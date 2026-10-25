import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * SCIM 2.0 (RFC 7643/7644), as much as Entra ID, Okta and Google provision
 * with: Users and Groups, filters by equality, PATCH with the paths they send.
 * The company's node keeps the directory (stage 12) and acts on changes.
 */

export interface ScimUser {
  id: string;
  userName: string;
  externalId?: string;
  displayName?: string;
  emails: string[];
  active: boolean;
  created: string;
  modified: string;
}

export interface ScimGroup {
  id: string;
  displayName: string;
  externalId?: string;
  members: string[];
  created: string;
  modified: string;
}

export interface ScimDirectory {
  users: Record<string, ScimUser>;
  groups: Record<string, ScimGroup>;
  /** Users deleted from the directory: who they were, for matching. */
  deleted: Array<{ userName: string; externalId?: string; emails: string[]; time: string }>;
  /** A hash of the bearer token the company's user management uses. */
  tokenHash?: string;
}

export const emptyDirectory = (): ScimDirectory => ({ users: {}, groups: {}, deleted: [] });

const USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
const GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
const PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

export const hashToken = (token: string): string => createHash('sha256').update(`weave/scim/v1:${token}`).digest('base64url');
export const newScimToken = (): string => randomBytes(32).toString('base64url');

/** Is this the directory's bearer token? */
export function tokenMatches(directory: ScimDirectory, header: string | undefined): boolean {
  const given = header?.replace(/^Bearer\s+/i, '');
  if (!given || !directory.tokenHash) return false;
  const [a, b] = [Buffer.from(hashToken(given)), Buffer.from(directory.tokenHash)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The display names of the groups a user is in. */
export const groupsOf = (directory: ScimDirectory, userId: string): string[] =>
  Object.values(directory.groups)
    .filter((g) => g.members.includes(userId))
    .map((g) => g.displayName)
    .sort();

/** The directory's user for someone the company vouches for (their sign-in subject, or email), or that they were deleted. */
export function findPerson(directory: ScimDirectory, who: { subject: string; email?: string }): { user?: ScimUser; deleted?: true } {
  const email = who.email?.toLowerCase();
  const matches = (u: { userName: string; externalId?: string; emails: string[] }) =>
    u.externalId === who.subject || u.userName === who.subject || (!!email && (u.userName.toLowerCase() === email || u.emails.some((e) => e.toLowerCase() === email)));
  const user = Object.values(directory.users).find(matches);
  if (user) return { user };
  return directory.deleted.some(matches) ? { deleted: true } : {};
}

export interface ScimRequest {
  method: string;
  /** The path under /scim/v2, e.g. `/Users/abc`. */
  path: string;
  query: URLSearchParams;
  body: unknown;
  /** The endpoint's own address, for `meta.location`. */
  base: string;
}

export interface ScimResponse {
  status: number;
  body?: unknown;
  /** The directory changed (to save, and to act on). */
  changed?: boolean;
}

const error = (status: number, detail: string): ScimResponse => ({ status, body: { schemas: [ERROR], status: String(status), detail } });

const truthy = (v: unknown): boolean => v === true || (typeof v === 'string' && v.toLowerCase() === 'true');

function userResource(directory: ScimDirectory, u: ScimUser, base: string) {
  return {
    schemas: [USER],
    id: u.id,
    userName: u.userName,
    ...(u.externalId ? { externalId: u.externalId } : {}),
    ...(u.displayName ? { displayName: u.displayName } : {}),
    emails: u.emails.map((value, i) => ({ value, primary: i === 0, type: 'work' })),
    active: u.active,
    groups: Object.values(directory.groups)
      .filter((g) => g.members.includes(u.id))
      .map((g) => ({ value: g.id, display: g.displayName })),
    meta: { resourceType: 'User', created: u.created, lastModified: u.modified, location: `${base}/Users/${u.id}` },
  };
}

function groupResource(g: ScimGroup, directory: ScimDirectory, base: string) {
  return {
    schemas: [GROUP],
    id: g.id,
    displayName: g.displayName,
    ...(g.externalId ? { externalId: g.externalId } : {}),
    members: g.members.filter((id) => directory.users[id]).map((id) => ({ value: id, display: directory.users[id].displayName ?? directory.users[id].userName })),
    meta: { resourceType: 'Group', created: g.created, lastModified: g.modified, location: `${base}/Groups/${g.id}` },
  };
}

/** `attr eq "value"`: the only filter user management sends us. */
function filterBy(filter: string | null): ((r: Record<string, unknown>) => boolean) | undefined {
  if (!filter) return undefined;
  const m = /^\s*([\w.]+)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(filter);
  if (!m) return () => false;
  const [, attr, value] = m;
  return (r) => {
    if (attr.toLowerCase() === 'emails.value' || attr.toLowerCase() === 'emails') return ((r.emails as string[]) ?? []).some((e) => e.toLowerCase() === value.toLowerCase());
    const v = r[attr];
    return typeof v === 'string' && (attr === 'userName' ? v.toLowerCase() === value.toLowerCase() : v === value);
  };
}

function list<T>(items: T[], query: URLSearchParams) {
  const start = Math.max(1, Number(query.get('startIndex') ?? 1) || 1);
  const count = Math.max(0, Number(query.get('count') ?? 100) || 100);
  const page = items.slice(start - 1, start - 1 + count);
  return { schemas: [LIST], totalResults: items.length, startIndex: start, itemsPerPage: page.length, Resources: page };
}

function emailsFrom(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((e) => (typeof e === 'string' ? e : (e as { value?: unknown })?.value)).filter((e): e is string => typeof e === 'string');
}

/** Apply user attributes from a POST/PUT body or a PATCH value. */
function setUser(u: ScimUser, attrs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attrs)) {
    const k = key.toLowerCase();
    if (k === 'username' && typeof value === 'string') u.userName = value;
    else if (k === 'externalid' && typeof value === 'string') u.externalId = value;
    else if (k === 'displayname' && typeof value === 'string') u.displayName = value;
    else if (k === 'active') u.active = truthy(value);
    else if (k === 'emails') u.emails = emailsFrom(value) ?? u.emails;
    else if (/^emails\[.*\]\.value$/.test(k) && typeof value === 'string') u.emails = [value, ...u.emails.filter((e) => e !== value)];
  }
}

function memberIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map((m) => (m as { value?: unknown })?.value).filter((v): v is string => typeof v === 'string');
}

/** One request against the directory. */
export function scimHandle(directory: ScimDirectory, req: ScimRequest, now = new Date().toISOString()): ScimResponse {
  const [, kind, id] = req.path.split('/');
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (kind === 'ServiceProviderConfig')
    return {
      status: 200,
      body: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'The token weave company scim on printed' }],
      },
    };
  if (kind === 'ResourceTypes')
    return {
      status: 200,
      body: list(
        [
          { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: USER },
          { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: GROUP },
        ],
        new URLSearchParams(),
      ),
    };

  if (kind === 'Users') {
    if (!id && req.method === 'GET') {
      const filter = filterBy(req.query.get('filter'));
      const users = Object.values(directory.users).filter((u) => !filter || filter(u as unknown as Record<string, unknown>));
      return { status: 200, body: list(users.map((u) => userResource(directory, u, req.base)), req.query) };
    }
    if (!id && req.method === 'POST') {
      if (typeof body.userName !== 'string' || !body.userName) return error(400, 'userName is required');
      if (Object.values(directory.users).some((u) => u.userName.toLowerCase() === (body.userName as string).toLowerCase())) return { ...error(409, 'userName is taken'), body: { schemas: [ERROR], status: '409', scimType: 'uniqueness', detail: 'userName is taken' } };
      const user: ScimUser = { id: randomBytes(12).toString('base64url'), userName: body.userName, emails: [], active: true, created: now, modified: now };
      setUser(user, body);
      if (body.active === undefined) user.active = true;
      directory.users[user.id] = user;
      directory.deleted = directory.deleted.filter((d) => d.userName !== user.userName);
      return { status: 201, body: userResource(directory, user, req.base), changed: true };
    }
    const user = id ? directory.users[id] : undefined;
    if (!user) return error(404, 'no such user');
    if (req.method === 'GET') return { status: 200, body: userResource(directory, user, req.base) };
    if (req.method === 'PUT') {
      user.emails = [];
      user.displayName = undefined;
      setUser(user, body);
      if (body.active === undefined) user.active = true;
      user.modified = now;
      return { status: 200, body: userResource(directory, user, req.base), changed: true };
    }
    if (req.method === 'PATCH') {
      for (const op of (Array.isArray(body.Operations) ? body.Operations : []) as Array<{ op?: string; path?: string; value?: unknown }>) {
        const kindOfOp = String(op.op ?? '').toLowerCase();
        if (kindOfOp === 'remove') {
          if (op.path?.toLowerCase() === 'displayname') user.displayName = undefined;
          if (op.path?.toLowerCase() === 'externalid') user.externalId = undefined;
          continue;
        }
        if (op.path) setUser(user, { [op.path]: op.value });
        else if (op.value && typeof op.value === 'object') setUser(user, op.value as Record<string, unknown>);
      }
      user.modified = now;
      return { status: 200, body: userResource(directory, user, req.base), changed: true };
    }
    if (req.method === 'DELETE') {
      delete directory.users[user.id];
      for (const g of Object.values(directory.groups)) g.members = g.members.filter((m) => m !== user.id);
      directory.deleted.push({ userName: user.userName, ...(user.externalId ? { externalId: user.externalId } : {}), emails: user.emails, time: now });
      return { status: 204, changed: true };
    }
    return error(405, 'not supported');
  }

  if (kind === 'Groups') {
    if (!id && req.method === 'GET') {
      const filter = filterBy(req.query.get('filter'));
      const groups = Object.values(directory.groups).filter((g) => !filter || filter(g as unknown as Record<string, unknown>));
      return { status: 200, body: list(groups.map((g) => groupResource(g, directory, req.base)), req.query) };
    }
    if (!id && req.method === 'POST') {
      if (typeof body.displayName !== 'string' || !body.displayName) return error(400, 'displayName is required');
      const group: ScimGroup = { id: randomBytes(12).toString('base64url'), displayName: body.displayName, ...(typeof body.externalId === 'string' ? { externalId: body.externalId } : {}), members: memberIds(body.members ?? []).filter((m) => directory.users[m]), created: now, modified: now };
      directory.groups[group.id] = group;
      return { status: 201, body: groupResource(group, directory, req.base), changed: true };
    }
    const group = id ? directory.groups[id] : undefined;
    if (!group) return error(404, 'no such group');
    if (req.method === 'GET') return { status: 200, body: groupResource(group, directory, req.base) };
    if (req.method === 'PUT') {
      if (typeof body.displayName === 'string') group.displayName = body.displayName;
      group.members = memberIds(body.members ?? []).filter((m) => directory.users[m]);
      group.modified = now;
      return { status: 200, body: groupResource(group, directory, req.base), changed: true };
    }
    if (req.method === 'PATCH') {
      for (const op of (Array.isArray(body.Operations) ? body.Operations : []) as Array<{ op?: string; path?: string; value?: unknown }>) {
        const kindOfOp = String(op.op ?? '').toLowerCase();
        const path = op.path ?? '';
        const one = /^members\[value eq "([^"]+)"\]$/i.exec(path);
        if (kindOfOp === 'remove' && one) group.members = group.members.filter((m) => m !== one[1]);
        else if (kindOfOp === 'remove' && path.toLowerCase() === 'members') {
          const gone = op.value === undefined ? group.members : memberIds(op.value);
          group.members = group.members.filter((m) => !gone.includes(m));
        } else if (kindOfOp === 'add' && path.toLowerCase() === 'members') group.members = [...new Set([...group.members, ...memberIds(op.value).filter((m) => directory.users[m])])];
        else if (kindOfOp === 'replace' && path.toLowerCase() === 'members') group.members = memberIds(op.value).filter((m) => directory.users[m]);
        else if (kindOfOp === 'replace' && path.toLowerCase() === 'displayname' && typeof op.value === 'string') group.displayName = op.value;
        else if (!path && op.value && typeof op.value === 'object') {
          const v = op.value as Record<string, unknown>;
          if (typeof v.displayName === 'string') group.displayName = v.displayName;
          if (v.members !== undefined) group.members = [...new Set([...(kindOfOp === 'add' ? group.members : []), ...memberIds(v.members).filter((m) => directory.users[m])])];
        }
      }
      group.modified = now;
      return { status: 200, body: groupResource(group, directory, req.base), changed: true };
    }
    if (req.method === 'DELETE') {
      delete directory.groups[group.id];
      return { status: 204, changed: true };
    }
    return error(405, 'not supported');
  }
  return error(404, 'unknown resource');
}

/** Serve SCIM over HTTP: `handle` checks the token and does the rest. */
export async function startScimServer(port: number, handle: (req: ScimRequest, authorization: string | undefined) => Promise<ScimResponse>): Promise<{ port: number; server: Server; close(): Promise<void> }> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      void (async () => {
        let response: ScimResponse;
        try {
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
          const at = url.pathname.indexOf('/scim/v2');
          if (at < 0) response = error(404, 'the SCIM endpoint is /scim/v2');
          else {
            const base = `${url.protocol}//${url.host}${url.pathname.slice(0, at)}/scim/v2`;
            response = await handle({ method: req.method ?? 'GET', path: url.pathname.slice(at + '/scim/v2'.length) || '/', query: url.searchParams, body: raw ? JSON.parse(raw) : undefined, base }, req.headers.authorization);
          }
        } catch (e) {
          response = error(400, (e as Error).message);
        }
        res.statusCode = response.status;
        if (response.body !== undefined) {
          res.setHeader('content-type', 'application/scim+json');
          res.end(JSON.stringify(response.body));
        } else res.end();
      })();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });
  return { port: (server.address() as AddressInfo).port, server, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
