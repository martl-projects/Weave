import type { Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';

/*
 * Services: code a person runs on a node of theirs, under a key of its own
 * (an agent key named "service:<name>"), with exactly the rights its contract
 * declares. Others see it as "person · name". The node it runs on gives it a
 * limited API: it signs only as itself, only the kinds it may write, and reads
 * only what its contract says, in the spaces it was added to.
 *
 *   weave.service.profile  {name, description, icon?, contract}
 *                          public, signed by the service's own key: what it is and how to talk to it
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
 * and its version. It's a promise the runtime keeps: the node that runs the
 * service hands it nothing more.
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

/** What a service reads in the spaces it's in: requests addressed to it, those plus some kinds, or everything. */
export type ServiceReads = 'addressed' | { kinds: string[] } | 'space';

export interface ServiceContract {
  reads: ServiceReads;
  /** Kinds it may sign, beyond its profile and its results (which every service may). */
  writes: string[];
  /** It serves websites (rooms, on the wire): pages people visit, which Weave tells who is visiting. */
  website?: boolean;
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
  /** One Weave ships (the website service), rather than someone's own code. */
  builtin?: 'website';
  contract: ServiceContract;
  time: string;
}

/** A kind name, as events use them: weave.something or an app's own (lowercase, dots, dashes). */
const isKind = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]*(\.[a-z0-9*-]+)*$/.test(value) && value.length <= 80;

/** The service name a person gives: letters, digits and dashes. */
export const serviceName = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value) ? value : undefined;

/** A contract from untrusted input, or undefined. */
export function parseContract(value: unknown): ServiceContract | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const c = value as Record<string, unknown>;
  let reads: ServiceReads | undefined;
  if (c.reads === 'addressed' || c.reads === 'space') reads = c.reads;
  else if (c.reads && typeof c.reads === 'object' && Array.isArray((c.reads as { kinds?: unknown }).kinds)) {
    const kinds = ((c.reads as { kinds: unknown[] }).kinds).filter(isKind).slice(0, 50);
    if (kinds.length) reads = { kinds };
  }
  if (!reads) return undefined;
  const writes = Array.isArray(c.writes) ? [...new Set(c.writes.filter(isKind))].slice(0, 50) : [];
  const version = typeof c.version === 'string' && /^\d+(\.\d+){0,2}$/.test(c.version) ? c.version : undefined;
  if (!version) return undefined;
  return { reads, writes, ...(c.website === true ? { website: true } : {}), version };
}

/** The kinds a service's key may sign: its profile, its results, and what its contract writes (rooms, if it serves websites). */
export const servicePermissions = (contract: ServiceContract): string[] =>
  [...new Set([KIND_SERVICE_PROFILE, KIND_SERVICE_RESULT, ...contract.writes, ...(contract.website ? ['weave.room', 'weave.room.*'] : [])])];

/** A contract in plain words, as people approve it: "reads only what is asked of it; writes only its answers (contract 1.0)". */
export function contractWords(c: ServiceContract): string {
  const reads = c.reads === 'addressed' ? 'reads only what is asked of it' : c.reads === 'space' ? 'reads everything in its spaces' : `reads what is asked of it, and ${c.reads.kinds.join(', ')}`;
  const writes = c.writes.length ? `writes ${c.writes.join(', ')} and its answers` : 'writes only its answers';
  return `${reads}; ${writes}${c.website ? '; serves websites' : ''} (contract ${c.version})`;
}

/** Whether a service with this contract gets to see an event of this kind (addressed requests are judged separately). */
export function serviceReads(contract: ServiceContract, kind: string): boolean {
  if (contract.reads === 'space') return true;
  if (contract.reads === 'addressed') return false;
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
      ...(body.builtin === 'website' ? { builtin: 'website' as const } : {}),
      contract,
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
  time: string;
}

/** Requests in a space, oldest first (optionally only those for one service). */
export function requestsOf(entries: Entry[], to?: Did): ServiceRequest[] {
  return entries
    .filter((e) => e.kind === KIND_SERVICE_REQUEST)
    .map((e) => {
      const body = (e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}) as Record<string, unknown>;
      if (!isDid(body.to) || (to && body.to !== to)) return undefined;
      return { id: e.id, to: body.to, from: e.event.author, text: typeof body.text === 'string' ? body.text.slice(0, 4000) : '', ...(body.data !== undefined ? { data: body.data } : {}), time: e.event.time };
    })
    .filter((r): r is ServiceRequest => !!r)
    .sort((a, b) => a.time.localeCompare(b.time));
}
