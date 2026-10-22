import {
  b64u,
  isDid,
  KIND_ORG_DONE,
  KIND_ORG_MAP,
  KIND_ORG_REQUEST,
  KIND_ORG_SETTINGS,
  KIND_ORG_START,
  type Did,
  type Inner,
  type Invite,
  type Json,
} from '@weave/core';

/*
 * Company accounts (stage 10, docs/v2-stage10.md): the links that carry a
 * company to a new laptop, and the company's settings as its group holds them.
 */

const ENROLL_PREFIX = 'weave:enroll:';
const RECOVER_PREFIX = 'weave:recover:';
const RECOVERY_PREFIX = 'weave:recovery:';

/** An enrollment link: the company, its group, and an invite into it. */
export interface Enrollment {
  v: 1;
  company: Did;
  name: string;
  group: string;
  invite: string;
  entry: Invite['entry'];
}

const encode = (prefix: string, value: unknown) => prefix + b64u.encode(new TextEncoder().encode(JSON.stringify(value)));

function decode<T>(prefix: string, text: string, what: string): T {
  const link = text.trim().split(/\s+/).find((part) => part.startsWith(prefix));
  if (!link) throw new Error(`no ${what} found`);
  try {
    return JSON.parse(new TextDecoder().decode(b64u.decode(link.slice(prefix.length)))) as T;
  } catch {
    throw new Error(`${what} is damaged`);
  }
}

export const encodeEnrollment = (enrollment: Enrollment): string => encode(ENROLL_PREFIX, enrollment);

export function decodeEnrollment(text: string): Enrollment {
  const e = decode<Enrollment>(ENROLL_PREFIX, text, 'enrollment link');
  if (e?.v !== 1 || !isDid(e.company) || typeof e.group !== 'string' || typeof e.invite !== 'string' || typeof e.name !== 'string' || !Array.isArray(e.entry?.topics)) throw new Error('enrollment link is damaged');
  return e;
}

/** A new laptop's request for a company-owned identity's recovery: the key the answer is boxed to. */
export const encodeRecoveryRequest = (key: Did): string => encode(RECOVER_PREFIX, { v: 1, key });

export function decodeRecoveryRequest(text: string): Did {
  const r = decode<{ v: number; key: unknown }>(RECOVER_PREFIX, text, 'recovery request');
  if (r?.v !== 1 || !isDid(r.key)) throw new Error('recovery request is damaged');
  return r.key;
}

/** The answer: the recovery words, boxed to the request's key. */
export const encodeRecoveryAnswer = (person: Did, box: Json): string => encode(RECOVERY_PREFIX, { v: 1, person, box });

export function decodeRecoveryAnswer(text: string): { person: Did; box: Json } {
  const r = decode<{ v: number; person: unknown; box: Json }>(RECOVERY_PREFIX, text, 'recovery answer');
  if (r?.v !== 1 || !isDid(r.person) || !r.box) throw new Error('recovery answer is damaged');
  return { person: r.person, box: r.box };
}

export type MapRole = 'member' | 'maintainer';

/** What an admin may ask the company for (and the company does itself). */
export type CompanyAction =
  | { action: 'settings'; admins?: string; links?: boolean }
  | { action: 'map'; group: string; space: string; role?: MapRole; on?: boolean }
  | { action: 'start'; contacts: string[] }
  | { action: 'space'; kind: 'project' | 'group'; name: string }
  | { action: 'hold'; space: string; until: string; reason?: string }
  | { action: 'destroy-key'; space: string }
  | { action: 'freeze'; person: string };

export const COMPANY_ACTIONS = ['settings', 'map', 'start', 'space', 'hold', 'destroy-key', 'freeze'] as const;

export interface OrgState {
  admins?: string;
  links: boolean;
  /** Sign-in group → company space id → role, as the company last said. */
  maps: Array<{ group: string; space: string; role: MapRole }>;
  start?: { contacts: string[] };
  requests: Array<{ id: string; by: Did; time: string; action: CompanyAction }>;
  done: Map<string, { error?: string; time: string }>;
}

type Opened = { id: string; event: { author: Did; time: string }; inner: Inner };

/** A company group's settings: only what the company itself signed counts, except requests (anyone may ask; the company decides). */
export function orgState(company: Did, opened: Opened[]): OrgState | undefined {
  const state: OrgState = { links: true, maps: [], requests: [], done: new Map() };
  let known = false;
  const maps = new Map<string, { group: string; space: string; role: MapRole }>();
  for (const o of [...opened].sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    const b = (o.inner.body ?? {}) as Record<string, unknown>;
    if (o.inner.kind === KIND_ORG_REQUEST) {
      if (typeof b.action === 'string' && (COMPANY_ACTIONS as readonly string[]).includes(b.action)) state.requests.push({ id: o.id, by: o.event.author, time: o.event.time, action: b as unknown as CompanyAction });
      continue;
    }
    if (o.event.author !== company) continue;
    switch (o.inner.kind) {
      case KIND_ORG_SETTINGS:
        known = true;
        if (typeof b.admins === 'string') state.admins = b.admins;
        if (typeof b.links === 'boolean') state.links = b.links;
        break;
      case KIND_ORG_MAP:
        if (typeof b.group === 'string' && typeof b.space === 'string') {
          const key = `${b.group}\n${b.space}`;
          if (b.on === false) maps.delete(key);
          else maps.set(key, { group: b.group, space: b.space, role: b.role === 'maintainer' ? 'maintainer' : 'member' });
        }
        break;
      case KIND_ORG_START:
        if (Array.isArray(b.contacts)) state.start = { contacts: b.contacts.filter((c): c is string => typeof c === 'string') };
        break;
      case KIND_ORG_DONE:
        if (typeof b.request === 'string') state.done.set(b.request, { ...(typeof b.error === 'string' ? { error: b.error } : {}), time: o.event.time });
        break;
    }
  }
  state.maps = [...maps.values()];
  return known ? state : undefined;
}

/** A name for a new company account, from its sign-in token (name, else the start of the email), unchecked: it's only a suggestion. */
export function nameFromToken(idToken: string | undefined): string | undefined {
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64u.decode(idToken?.split('.')[1] ?? ''))) as { name?: unknown; email?: unknown; preferred_username?: unknown };
    const name = typeof claims.name === 'string' ? claims.name : typeof claims.email === 'string' ? claims.email.split('@')[0] : typeof claims.preferred_username === 'string' ? claims.preferred_username.split('@')[0] : undefined;
    return name?.trim().slice(0, 40) || undefined;
  } catch {
    return undefined;
  }
}

/** A new company account's steps still to do, kept sealed at rest (the words only until the company holds them). */
export interface Enrolling {
  group: string;
  invite: string;
  joined?: true;
  words?: string;
  idToken?: string;
  started?: true;
}
