import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import { hostname } from 'node:os';
import type { AuditLine } from './backend.ts';

/*
 * Where a company's node sends its audit as it happens (stage 12): a webhook,
 * Splunk's HTTP Event Collector, syslog (RFC 5424 over TCP), or Microsoft
 * Sentinel through Azure Monitor's Logs Ingestion API.
 */

export type AuditSink =
  | { id: string; kind: 'webhook'; url: string; token?: string }
  | { id: string; kind: 'splunk'; url: string; token: string }
  | { id: string; kind: 'syslog'; host: string; port: number }
  | { id: string; kind: 'sentinel'; endpoint: string; rule: string; stream: string; tenant: string; clientId: string; secret: string; authority?: string };

export type AuditSinkInput = { kind: 'webhook'; url: string; token?: string } | { kind: 'splunk'; url: string; token: string } | { kind: 'syslog'; host: string; port: number } | Omit<Extract<AuditSink, { kind: 'sentinel' }>, 'id'>;

/** A line as streamed: the audit line and the space it's from. */
export type StreamedLine = AuditLine & { space: { id: string; name: string } };

export const newSink = (input: AuditSinkInput): AuditSink => {
  const id = randomBytes(6).toString('base64url');
  if (input.kind === 'webhook' || input.kind === 'splunk') new URL(input.url);
  if (input.kind === 'syslog' && (!input.host || !Number.isInteger(input.port))) throw new Error('syslog needs host:port');
  if (input.kind === 'sentinel') new URL(input.endpoint);
  return { id, ...input } as AuditSink;
};

/** Where it sends, without secrets. */
export const sinkTarget = (sink: AuditSink): string =>
  sink.kind === 'syslog' ? `${sink.host}:${sink.port}` : sink.kind === 'sentinel' ? `${sink.endpoint} (${sink.stream})` : sink.url;

async function post(url: string, headers: Record<string, string>, body: string): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
}

/** Microsoft Entra: an app's token for Azure Monitor. */
async function azureMonitorToken(sink: Extract<AuditSink, { kind: 'sentinel' }>): Promise<string> {
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: sink.clientId, client_secret: sink.secret, scope: 'https://monitor.azure.com//.default' });
  const res = await fetch(`${sink.authority ?? 'https://login.microsoftonline.com'}/${sink.tenant}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !body.access_token) throw new Error(`Entra refused the sign-in for Azure Monitor (${res.status})`);
  return body.access_token;
}

function syslog(host: string, port: number, lines: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => socket.end(lines.join('')));
    socket.setTimeout(10_000, () => socket.destroy(new Error(`syslog at ${host}:${port} didn't answer`)));
    socket.on('error', reject);
    socket.on('close', (hadError) => (hadError ? undefined : resolve()));
  });
}

/** Send a batch of lines to one sink. */
export async function sendLines(sink: AuditSink, lines: StreamedLine[]): Promise<void> {
  if (!lines.length) return;
  switch (sink.kind) {
    case 'webhook':
      return post(sink.url, { 'content-type': 'application/json', ...(sink.token ? { authorization: `Bearer ${sink.token}` } : {}) }, JSON.stringify({ source: 'weave', lines }));
    case 'splunk':
      return post(
        sink.url,
        { authorization: `Splunk ${sink.token}`, 'content-type': 'application/json' },
        lines.map((l) => JSON.stringify({ time: Date.parse(l.time) / 1000, source: 'weave', sourcetype: 'weave:audit', event: l })).join('\n'),
      );
    case 'syslog': {
      // Facility "log audit" (13), severity informational (6); the message is the line as JSON.
      const host = hostname().replace(/\s/g, '-') || '-';
      return syslog(
        sink.host,
        sink.port,
        lines.map((l) => `<110>1 ${l.time} ${host} weave - audit - ${JSON.stringify(l)}\n`),
      );
    }
    case 'sentinel': {
      const token = await azureMonitorToken(sink);
      const rows = lines.map((l) => ({ TimeGenerated: l.time, Kind: l.kind, By: l.by, ByName: l.byName ?? '', Signer: l.signer, Agent: l.agent ?? '', Space: l.space.name, SpaceId: l.space.id, EventId: l.id ?? '', Detail: l.detail }));
      return post(`${sink.endpoint.replace(/\/$/, '')}/dataCollectionRules/${sink.rule}/streams/${sink.stream}?api-version=2023-01-01`, { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, JSON.stringify(rows));
    }
  }
}
