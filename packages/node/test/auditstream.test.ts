import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createHttp, type Server } from 'node:http';
import { createServer as createTcp, type Server as TcpServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { OidcStub, VaultStub } from './helpers/stubs.ts';

const dirs: string[] = [];
let oidc: OidcStub;
let vault: VaultStub;
beforeAll(async () => {
  oidc = await new OidcStub().start();
  vault = await new VaultStub(oidc).start();
});
afterAll(async () => {
  closeOpenStores();
  await vault.stop();
  await oidc.stop();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function dir(): string {
  const made = mkdtempSync(join(tmpdir(), 'weave-audit-'));
  dirs.push(made);
  return made;
}
const settle = () => new Promise((r) => setTimeout(r, 300));

/** A webhook, Splunk's collector, Entra's token endpoint and Azure Monitor's ingestion, in one stand-in; they keep what they're sent. */
async function securityTools() {
  const got = { webhook: [] as Array<{ auth?: string; lines: Array<{ id: string; kind: string; space: { name: string } }> }>, splunk: [] as Array<{ auth?: string; events: unknown[] }>, sentinel: [] as Array<{ auth?: string; rows: Array<{ Kind: string; Space: string }> }> };
  const http: Server = createHttp((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = req.url ?? '';
      if (url === '/hook') got.webhook.push({ auth: req.headers.authorization, lines: JSON.parse(raw).lines });
      else if (url === '/services/collector/event') got.splunk.push({ auth: req.headers.authorization, events: raw.split('\n').map((l) => JSON.parse(l)) });
      else if (url.endsWith('/oauth2/v2.0/token')) {
        const form = new URLSearchParams(raw);
        if (form.get('client_secret') !== 's3cret') return void ((res.statusCode = 401), res.end('{}'));
        return void res.end(JSON.stringify({ access_token: 'monitor-token', expires_in: 3600 }));
      } else if (url.startsWith('/dataCollectionRules/dcr-1/streams/Custom-WeaveAudit_CL')) got.sentinel.push({ auth: req.headers.authorization, rows: JSON.parse(raw) });
      else res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  const syslogLines: string[] = [];
  const tcp: TcpServer = createTcp((socket) => {
    let raw = '';
    socket.on('data', (c) => (raw += c));
    socket.on('end', () => syslogLines.push(...raw.split('\n').filter(Boolean)));
  });
  await new Promise<void>((r) => tcp.listen(0, '127.0.0.1', r));
  return {
    got,
    syslogLines,
    http: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    syslogPort: (tcp.address() as AddressInfo).port,
    stopSyslog: () => new Promise<void>((r) => tcp.close(() => r())),
    stop: () => Promise.all([new Promise((r) => http.close(r)), new Promise((r) => tcp.close(r))]),
  };
}

describe('the audit in the company’s security tools', { timeout: 120_000 }, () => {
  it('streams every audit line once to a webhook, Splunk, syslog and Sentinel, and exports a space for legal searches', async () => {
    const tools = await securityTools();
    try {
      vault.createKey('acme-audit');
      const acme = WeaveNode.init('Acme', dir());
      acme.kmsCredentials = { token: vault.rootToken };
      await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-audit', jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
      await settle();

      await acme.addAuditStream({ kind: 'webhook', url: `${tools.http}/hook`, token: 'hook-token' });
      await acme.addAuditStream({ kind: 'splunk', url: `${tools.http}/services/collector/event`, token: 'hec-token' });
      await acme.addAuditStream({ kind: 'syslog', host: '127.0.0.1', port: tools.syslogPort });
      await acme.addAuditStream({ kind: 'sentinel', endpoint: tools.http, rule: 'dcr-1', stream: 'Custom-WeaveAudit_CL', tenant: 'acme', clientId: 'weave-audit', secret: 's3cret', authority: tools.http });
      await settle();
      const kinds = (sent: Array<{ lines: Array<{ kind: string }> }>) => sent.flatMap((s) => s.lines.map((l) => l.kind));
      expect(kinds(tools.got.webhook)).toEqual(expect.arrayContaining(['weave.space.create', 'weave.space.managed', 'weave.org.settings']));
      expect(tools.got.webhook[0].auth).toBe('Bearer hook-token');
      expect(tools.got.splunk[0].auth).toBe('Splunk hec-token');
      expect(tools.got.sentinel[0].auth).toBe('Bearer monitor-token');
      expect(tools.got.sentinel.flatMap((s) => s.rows.map((r) => r.Space))).toContain('Acme');
      expect(tools.syslogLines.some((l) => l.startsWith('<110>1 ') && l.includes('weave.org.settings'))).toBe(true);

      // Something new: only that goes out, everywhere; nothing twice.
      await acme.companyAction({ action: 'space', kind: 'project', name: 'Roadmap' });
      await acme.reconcile();
      const ids = tools.got.webhook.flatMap((s) => s.lines.map((l) => l.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(tools.got.webhook.flatMap((s) => s.lines).some((l) => l.space.name === 'Roadmap' && l.kind === 'weave.space.create')).toBe(true);
      expect(tools.got.splunk.flatMap((s) => s.events)).toHaveLength(ids.length);

      // A tool that's down: its problem shows, and it catches up later.
      await tools.stopSyslog();
      await acme.companyAction({ action: 'settings', public: false });
      await acme.reconcile();
      expect((await acme.auditStreams()).find((s) => s.kind === 'syslog')?.problem).toBeTruthy();
      expect((await acme.auditStreams()).find((s) => s.kind === 'webhook')).toMatchObject({ sent: ids.length + 1 });

      // For legal searches: everything a company space holds, deleted posts included and marked.
      const post = await acme.submit({ space: 'Roadmap', board: 'ideas', title: 'Q3 plan' });
      await acme.deletePost({ post: post.id });
      const exported = await acme.exportSpace({ space: 'Roadmap' });
      expect(exported.find((l) => l.id === post.id)).toMatchObject({ kind: 'weave.post', deleted: expect.any(String) });
      expect(JSON.stringify(exported)).not.toMatch(/"wrapped"|"boxes"/);
      await acme.close();
    } finally {
      await tools.stop();
    }
  });
});
