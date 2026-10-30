import type { Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';
import { appSettingsOf, type AppSetting } from './rooms.ts';
import { parseActions, whoWords, type ServiceAction } from './serviceactions.ts';

/*
 * Services: code a person runs on a node of theirs, under a key of its own
 * (an agent key named "service:<name>"), with exactly the rights its contract
 * declares. Others see it as "person · name". The node it runs on gives it a
 * limited API: it signs only as itself, only the kinds it may write, and reads
 * only what its contract says, in the spaces it was added to.
 *
 *   weave.service.profile  {name, description, icon?, builtin?, contract, origin?}
 *                          public, signed by the service's own key: what it is, how to talk to it, and where it
 *                          comes from: a release (origin: {project, release, tag, fingerprint}, ids only, so it
 *                          says nothing to those outside the project; its members check it against the release),
 *                          or Weave itself (builtin). Neither: code its person runs without releasing it.
 *   weave.service.request  {to, text?, data?}
 *                          sealed in a space, by a member: a request for the service `to` (its key)
 *   weave.service.result   {request, text?, data?, error?}
 *                          sealed in the same space, by the service: its answer to a request
 *   weave.service.in       {service, on}
 *                          sealed in a space, by the service's person: it's in this space (members see it and
 *                          can ask it), or no longer (on: false); the latest per service counts
 *
 * A contract says what the service reads (only requests addressed to it, some
 * kinds, or the whole space), which kinds it writes, whether it serves websites,
 * the protocols it offers, and its version. It's a promise the runtime keeps:
 * the node that runs the service hands it nothing more.
 *
 * Protocols are small agreements on top of requests, named in the contract's
 * `offers`. The first one:
 *
 *   artifact.fetch  request data {protocol: 'artifact.fetch', artifact, platform}: a release of the space it's
 *                   asked in (the weave.app event's id), for a platform. Result data {url, file, sha256, size?}:
 *                   where to download that file for a while. Whoever fetches checks the file against the sha256
 *                   the release's maintainer signed, so it doesn't matter who delivers it.
 */
export const KIND_SERVICE_PROFILE = 'weave.service.profile';
export const KIND_SERVICE_REQUEST = 'weave.service.request';
export const KIND_SERVICE_RESULT = 'weave.service.result';
export const KIND_SERVICE_IN = 'weave.service.in';

/** The services in a space, by their keys: the latest word of each (`isTheirs` says whether its author runs that service). */
export function servicesIn(entries: Entry[], isTheirs: (service: Did, author: Did) => boolean): Did[] {
  const latest = new Map<Did, boolean>();
  for (const e of [...entries].filter((x) => x.kind === KIND_SERVICE_IN).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    const body = (e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}) as Record<string, unknown>;
    if (!isDid(body.service) || !isTheirs(body.service, e.event.author)) continue;
    latest.set(body.service, body.on !== false);
  }
  return [...latest].filter(([, on]) => on).map(([did]) => did);
}

/** Service keys are agent keys with this prefix in their name. */
export const SERVICE_PREFIX = 'service:';

/** The protocol for handing out a release's files (see above). */
export const PROTOCOL_ARTIFACT_FETCH = 'artifact.fetch';

/** The services Weave ships: websites, and releases from GitHub. */
export const BUILTINS = ['website', 'github'] as const;
export type Builtin = (typeof BUILTINS)[number];
export const isBuiltin = (value: unknown): value is Builtin => BUILTINS.includes(value as Builtin);

/**
 * What a service reads in the spaces it's in: nothing (it takes no requests either: a website, say), requests
 * addressed to it, those plus some kinds, or everything.
 */
export type ServiceReads = 'nothing' | 'addressed' | { kinds: string[] } | 'space';

export interface ServiceContract {
  reads: ServiceReads;
  /** Kinds it may sign, beyond its profile (and its answers, if it takes requests). */
  writes: string[];
  /** It serves websites (rooms, on the wire): pages people visit, which Weave tells who is visiting. */
  website?: boolean;
  /** Protocols it answers requests in, like artifact.fetch. */
  offers?: string[];
  /** Hosts it may reach over HTTPS: api.example.com, or *.example.com for any of its subdomains. Enforced for WebAssembly services; a container has its container's network. */
  net?: string[];
  /** What people may ask it to do, each with who may (serviceactions.ts): checked before it sees a request. */
  actions?: ServiceAction[];
  /**
   * It hosts websites in its projects, as Weave's website service does: what its person's services serve, and what
   * its person opens for a program of theirs, announced under its key; it lists and closes them. It never opens a
   * port itself.
   */
  websites?: 'host';
  /**
   * Who fetches what it hands out (artifact.fetch): its answer is a grant only that fetcher understands, run by the
   * asker's own node. A fetcher Weave ships, by name ("github-checkout"), or exactly this component ("sha256:…").
   */
  fetcher?: string;
  /** The sources whose artifacts it hands out (artifact.fetch): github, s3… Without, any. */
  sources?: string[];
  /**
   * Its person's keyvaults it uses, by platform, with the rights it wants there ({"github": {"contents": "read"}}):
   * it gets access only through them (token() in the WIT), cut to these rights and to what its person handed each
   * of its projects. It keeps no access of its own.
   */
  uses?: Record<string, Record<string, string>>;
  /**
   * How long a request counts, in seconds, by action or protocol ({"artifact.fetch": 120}): one older than that when
   * the service gets to it is answered by Weave as expired, and never reaches it. Without, a request waits for it.
   */
  expires?: Record<string, number>;
  /** The contract's version, e.g. 1.0. */
  version: string;
}

export interface ServiceProfile {
  /** The service's own key. */
  did: Did;
  /** Who runs it: the person whose agent key it is. */
  person: Did;
  name: string;
  description: string;
  /** A picture (wblob: reference). */
  icon?: string;
  /** One Weave ships (the website or GitHub service), rather than someone's own code. */
  builtin?: Builtin;
  contract: ServiceContract;
  /** The release it runs, as its profile claims it. */
  origin?: ServiceOrigin;
  /** The settings it asks for (its manifest's env): what its space's maintainers can fill in. */
  settings?: AppSetting[];
  /** A service Weave ships: its name, and its component's digest (each member's Weave checks it against its own). */
  shipped?: { name: string; digest: string };
  time: string;
}

/** Where a service comes from: a project's release (the weave.app event), and the fingerprint of what it runs. */
export interface ServiceOrigin {
  project: string;
  release: string;
  tag: string;
  fingerprint: string;
}

/** A shipped service's claim from untrusted input: its name and digest, or undefined. */
export function parseShipped(value: unknown): { name: string; digest: string } | undefined {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return serviceName(o.name) && typeof o.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(o.digest) ? { name: o.name as string, digest: o.digest } : undefined;
}

/** An origin from untrusted input, or undefined. */
export function parseOrigin(value: unknown): ServiceOrigin | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
  if (!id(o.project) || !id(o.release) || typeof o.tag !== 'string' || !o.tag || o.tag.length > 100 || typeof o.fingerprint !== 'string' || !/^[A-Za-z0-9_+/=-]{8,200}$/.test(o.fingerprint)) return undefined;
  return { project: o.project as string, release: o.release as string, tag: o.tag, fingerprint: o.fingerprint };
}

/** A kind name, as events use them: weave.something or an app's own (lowercase, dots, dashes). */
const isKind = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]*(\.[a-z0-9*-]+)*$/.test(value) && value.length <= 80;

/** The service name a person gives: letters, digits and dashes. */
export const serviceName = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value) ? value : undefined;

/** A contract from untrusted input, or undefined. */
const PLACEHOLDER = /\{([A-Z_][A-Z0-9_]{0,63})\}/g;
const DNS_NAME = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A host a contract may name in net: a DNS name (no IP addresses, no localhost), optionally *. for its subdomains, and
 * with settings as placeholders where the host depends on them: {S3_BUCKET}.s3.{S3_REGION}.amazonaws.com.
 */
export const isNetHost = (host: unknown): host is string => typeof host === 'string' && host.length <= 253 && DNS_NAME.test(host.replace(PLACEHOLDER, 'x'));

/** A host in lowercase, but its placeholders keep their names: {S3_BUCKET}.S3.amazonaws.com → {S3_BUCKET}.s3.amazonaws.com. */
export const lowerHost = (host: unknown): unknown => (typeof host === 'string' ? host.replace(/[^{}]+(?=\{|$)|^[^{]+/g, (part) => part.toLowerCase()) : host);

/** A contract's hosts with their placeholders filled in from settings; a host whose settings aren't there is left out. */
export function resolveNet(net: string[] | undefined, settings: Record<string, string | undefined>): string[] {
  return (net ?? []).flatMap((host) => {
    let missing = false;
    const filled = host.replace(PLACEHOLDER, (_, name: string) => {
      const value = settings[name]?.trim().toLowerCase() ?? '';
      // A part of a name, never a wildcard or another host's syntax.
      if (!/^[a-z0-9]([a-z0-9.-]{0,200}[a-z0-9])?$/.test(value)) missing = true;
      return value;
    });
    return !missing && filled.length <= 253 && DNS_NAME.test(filled) ? [filled] : [];
  });
}

/** Whether a contract's net lets a service reach this host. */
export const netAllows = (net: string[] | undefined, host: string): boolean =>
  !!net?.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) && host.length > h.length - 1 : host === h));

/** A fetcher a contract names: one Weave ships ("github-checkout"), or a component by its digest ("sha256:…"). */
export const isFetcherRef = (value: string): boolean => /^[a-z][a-z0-9-]{0,39}$/.test(value) || /^sha256:[0-9a-f]{64}$/.test(value);

/** A contract's keyvaults, checked: platforms (github…), each with rights by name (contents: read). */
export function parseUses(value: unknown): Record<string, Record<string, string>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [platform, rights] of Object.entries(value as Record<string, unknown>).slice(0, 5)) {
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(platform) || !rights || typeof rights !== 'object' || Array.isArray(rights)) continue;
    const kept = Object.fromEntries(Object.entries(rights as Record<string, unknown>).filter(([k, v]) => /^[a-z][a-z0-9_]{0,40}$/.test(k) && typeof v === 'string' && /^[a-z]{1,12}$/.test(v)).slice(0, 20)) as Record<string, string>;
    if (Object.keys(kept).length) out[platform] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

export function parseContract(value: unknown): ServiceContract | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const c = value as Record<string, unknown>;
  let reads: ServiceReads | undefined;
  if (c.reads === 'nothing' || c.reads === 'addressed' || c.reads === 'space') reads = c.reads;
  else if (c.reads && typeof c.reads === 'object' && Array.isArray((c.reads as { kinds?: unknown }).kinds)) {
    const kinds = ((c.reads as { kinds: unknown[] }).kinds).filter(isKind).slice(0, 50);
    if (kinds.length) reads = { kinds };
  }
  if (!reads) return undefined;
  const writes = Array.isArray(c.writes) ? [...new Set(c.writes.filter(isKind))].slice(0, 50) : [];
  const version = typeof c.version === 'string' && /^\d+(\.\d+){0,2}$/.test(c.version) ? c.version : undefined;
  if (!version) return undefined;
  // Offering a protocol means answering requests in it: a service that reads nothing offers none.
  const offers = reads !== 'nothing' && Array.isArray(c.offers) ? [...new Set(c.offers.filter((p): p is string => typeof p === 'string' && /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(p) && p.length <= 60))].slice(0, 20) : [];
  const net = Array.isArray(c.net) ? [...new Set(c.net.map(lowerHost).filter(isNetHost))].slice(0, 20) : [];
  // Actions are requests: a service that reads nothing takes none.
  const actions = reads !== 'nothing' ? parseActions(c.actions) : [];
  const fetcher = offers.length && typeof c.fetcher === 'string' && isFetcherRef(c.fetcher) ? c.fetcher : undefined;
  const expires = reads !== 'nothing' && c.expires && typeof c.expires === 'object' && !Array.isArray(c.expires)
    ? Object.fromEntries(Object.entries(c.expires as Record<string, unknown>).filter(([k, v]) => /^[a-z][a-z0-9.-]{0,59}$/.test(k) && Number.isInteger(v) && (v as number) >= 10 && (v as number) <= 30 * 86400).slice(0, 20))
    : {};
  const sources = offers.length && Array.isArray(c.sources) ? [...new Set(c.sources.filter((x): x is string => typeof x === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(x)))].slice(0, 10) : [];
  const uses = parseUses(c.uses);
  return { reads, writes, ...(uses ? { uses } : {}), ...(c.website === true ? { website: true } : {}), ...(offers.length ? { offers } : {}), ...(fetcher ? { fetcher } : {}), ...(sources.length ? { sources } : {}), ...(Object.keys(expires).length ? { expires: expires as Record<string, number> } : {}), ...(net.length ? { net } : {}), ...(actions.length ? { actions } : {}), ...(c.websites === 'host' ? { websites: 'host' as const } : {}), version };
}

/**
 * The kinds a service's key may sign: its profile, its answers (only if it takes requests), and what its contract
 * writes (rooms, if it serves websites). A service that reads nothing and writes nothing signs its profile alone.
 */
export const servicePermissions = (contract: ServiceContract): string[] =>
  [...new Set([KIND_SERVICE_PROFILE, ...(contract.reads === 'nothing' ? [] : [KIND_SERVICE_RESULT]), ...contract.writes, ...(contract.website || contract.websites === 'host' ? ['weave.room', 'weave.room.*'] : [])])];

/** Whether a service takes requests (and may answer them). */
export const takesRequests = (contract: ServiceContract): boolean => contract.reads !== 'nothing';

/** A contract in plain words, as people approve it: "reads only what is asked of it; writes only its answers (contract 1.0)". */
export function contractWords(c: ServiceContract): string {
  const reads = c.reads === 'nothing' ? 'reads nothing and takes no requests' : c.reads === 'addressed' ? 'reads only what is asked of it' : c.reads === 'space' ? 'reads everything in its spaces' : `reads what is asked of it, and ${c.reads.kinds.join(', ')}`;
  const answers = c.reads === 'nothing' ? '' : ' and its answers';
  const writes = c.writes.length ? `writes ${c.writes.join(', ')}${answers}` : c.reads === 'nothing' ? 'writes nothing' : 'writes only its answers';
  return `${reads}; ${writes}${c.website ? '; serves websites' : ''}${c.websites === 'host' ? "; hosts its projects' websites" : ''}${c.offers?.length ? `; offers ${c.offers.join(', ')}` : ''}${c.fetcher ? `; fetched with ${c.fetcher.startsWith('sha256:') ? `the fetcher ${c.fetcher.slice(0, 19)}…` : c.fetcher}` : ''}${c.net?.length ? `; talks to ${c.net.join(', ')} over HTTPS` : ''}${c.uses ? Object.entries(c.uses).map(([p, r]) => `; uses your ${p} keyvault (${Object.entries(r).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')})`).join('') : ''}${c.actions?.length ? `; ${c.actions.map((a) => `${whoWords(a.who)} can ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`).join(', ')}` : ''} (contract ${c.version})`;
}

/** Whether a service with this contract gets to see an event of this kind (addressed requests are judged separately). */
export function serviceReads(contract: ServiceContract, kind: string): boolean {
  if (contract.reads === 'space') return true;
  if (contract.reads === 'addressed' || contract.reads === 'nothing') return false;
  return contract.reads.kinds.some((k) => k === kind || (k.endsWith('.*') && kind.startsWith(k.slice(0, -1))));
}

/**
 * Profiles from public events: the latest of each service, signed by the service's own key for its person.
 * `isService(signer, author)` says whether the signer is a service key of that person (the authority knows).
 */
export function profilesOf(events: Array<{ kind: string; body: unknown; author: Did; signer: string; time: string }>, isService: (signer: string, author: Did) => boolean): ServiceProfile[] {
  const latest = new Map<string, ServiceProfile>();
  for (const e of events) {
    if (e.kind !== KIND_SERVICE_PROFILE || !isDid(e.signer) || !isService(e.signer, e.author)) continue;
    const body = (e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    const contract = parseContract(body.contract);
    if (!name || !contract) continue;
    const before = latest.get(e.signer);
    if (before && before.time > e.time) continue;
    latest.set(e.signer, {
      did: e.signer,
      person: e.author,
      name,
      description: typeof body.description === 'string' ? body.description.slice(0, 1000) : '',
      ...(typeof body.icon === 'string' && body.icon.startsWith('wblob:') ? { icon: body.icon } : {}),
      ...(isBuiltin(body.builtin) ? { builtin: body.builtin } : {}),
      contract,
      ...(parseOrigin(body.origin) ? { origin: parseOrigin(body.origin) } : {}),
      ...(appSettingsOf(body.settings).length ? { settings: appSettingsOf(body.settings) } : {}),
      ...(parseShipped(body.shipped) ? { shipped: parseShipped(body.shipped) } : {}),
      time: e.time,
    });
  }
  return [...latest.values()];
}

export interface ServiceRequest {
  id: string;
  /** The service it's for (its key). */
  to: Did;
  from: Did;
  text: string;
  data?: unknown;
  /** The action it asks for (one its contract declares): its asker's role was checked. */
  action?: string;
  time: string;
}

/** Requests in a space, oldest first (optionally only those for one service). */
export function requestsOf(entries: Entry[], to?: Did): ServiceRequest[] {
  return entries
    .filter((e) => e.kind === KIND_SERVICE_REQUEST)
    .map((e) => {
      const body = (e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}) as Record<string, unknown>;
      if (!isDid(body.to) || (to && body.to !== to)) return undefined;
      return { id: e.id, to: body.to, from: e.event.author, text: typeof body.text === 'string' ? body.text.slice(0, 4000) : '', ...(body.data !== undefined ? { data: body.data } : {}), ...(typeof body.action === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(body.action) ? { action: body.action } : {}), time: e.event.time };
    })
    .filter((r): r is ServiceRequest => !!r)
    .sort((a, b) => a.time.localeCompare(b.time));
}
