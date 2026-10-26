import { KIND_BLOCK, KIND_IDENTITY, KIND_LEAVE, KIND_MUTE, KIND_REKEY, KIND_ROTATE } from '@weave/core';
import { KIND_THEME } from './theme.ts';
import { createPublicKey, createVerify } from 'node:crypto';
import { type StoredSpace } from './spacestore.ts';
import { b64u, type Box, boxTo, currentEpoch, decodeContact, type Did, gift, type Invite, isDid, type Json, KIND_ADMIT, KIND_ATTEST, KIND_CARRY, KIND_FOLLOW, KIND_JOIN, KIND_LINK, KIND_MAINTAINER, KIND_MANAGED, KIND_ORG_CHAT, KIND_ORG_CONSOLE, KIND_ORG_DONE, KIND_ORG_FREEZE, KIND_ORG_MAP, KIND_ORG_POLICY, KIND_ORG_REQUEST, KIND_ORG_SETTINGS, KIND_ORG_START, KIND_POST_DELETE, KIND_POST_EDIT, KIND_REMOVE, KIND_SETTLE, KIND_SIGNIN, type ManagedSetting, mayAct, openBox, parseScope, randomBytes, type Recipient, sealFor, type SpaceKeys, type SpaceKind, spaceScope, type SpaceState } from '@weave/core';
import { ManagedKeys } from './managed.ts';
import { type SqliteStore } from './sqlitestore.ts';
import { type AuditStreamInfo, type CompanyAgentInfo, type CompanyDeviceInfo, type CompanyInfo, type ConsoleInfo, type ConsoleRole, type CreateCompanyInput, type ExportLine, type LinkInfo, type Profile, type ScimInfo, type SignInStatus, type SpaceInfo } from './backend.ts';
import { browserSignIn, claimsOf, delegatedToken, openInBrowser, refreshSignIn, signInNonce } from './signin.ts';
import { type Keystore, keystoresHere, moveHomeKey, readSecretJson, vaultOf, writeSecretJson } from './vault.ts';
import { join as joinPath, resolve as resolvePath } from 'node:path';
import { type CompanyAction, type CompanyPolicy, encodeEnrollment, type Enrolling, type MapRole, orgState, type OrgState, readPolicy, type Retention } from './company.ts';
import { loadConfig, saveConfig } from './config.ts';
import { providerFor, type ProviderSpec } from './keyproviders.ts';
import { invitationMail, mailServer, sendMail } from './mail.ts';
import { checkAuthority, deviceProof, inspectDevice } from './devices.ts';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { type AuditSink, type AuditSinkInput, newSink, sendLines, sinkTarget, type StreamedLine } from './auditsinks.ts';
import { machinePolicy } from './machine.ts';
import { emptyDirectory, findPerson, groupsOf, hashToken, newScimToken, type ScimDirectory, scimHandle, type ScimRequest, type ScimResponse, startScimServer, tokenMatches } from './scim.ts';
import { startConsole } from './console.ts';
import { type WeaveNode, DAY_MS, type Decoded, withoutSecrets } from './node.ts';

/*
 * Company accounts (stages 10 to 15): a company's group and spaces, the accounts
 * it owns and their sign-in, its attestor, policy and retention, the audit in
 * security tools, SCIM, devices and the admin console. Who may act is decided
 * by mayAct (core) and by the company's own vouching here. It sees the node's
 * internals only through CompaniesCore.
 */



/** What a company account may always sign, whatever its company's policy: itself, its keys, its name, leaving, links (they have their own switch), blocking and muting. */
const ALWAYS_ALLOWED = new Set<string>([KIND_IDENTITY, KIND_ROTATE, 'weave.delegate', 'weave.revoke', KIND_ORG_FREEZE, 'weave.profile', KIND_THEME, KIND_LINK, KIND_LEAVE, KIND_BLOCK, KIND_MUTE, KIND_REKEY]);

/** A company sign-in kept on this computer (sso.json, sealed): the ID token, and where and how to renew it. */
interface Sso {
  idToken: string;
  /** The salt the ID token's nonce was made with for this identity (signInNonce). */
  salt?: string;
  expires?: number;
  refreshToken?: string;
  issuer?: string;
  clientId?: string;
}

/**
 * An OIDC ID token, checked against its issuer: the signature with the
 * issuer's published keys (RS256), the issuer, the audience, the expiry.
 * Returns its claims, or throws.
 */
export async function verifyIdToken(token: string, issuer: string, audience: string): Promise<{ sub: string; email?: string; groups: string[]; nonce?: string }> {
  const [h, b, sig] = token.split('.');
  if (!h || !b || !sig) throw new Error('not a token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`unsupported token algorithm ${header.alg}`);
  const discovery = (await (await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)).json()) as { jwks_uri: string };
  const { keys } = (await (await fetch(discovery.jwks_uri)).json()) as { keys: Array<Record<string, unknown> & { kid?: string }> };
  const jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error('unknown signing key');
  if (!createVerify('RSA-SHA256').update(`${h}.${b}`).verify(createPublicKey({ key: jwk as never, format: 'jwk' }), Buffer.from(sig, 'base64url'))) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString()) as { iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string; groups?: unknown; nonce?: unknown };
  if (claims.iss !== issuer) throw new Error('wrong issuer');
  if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) throw new Error('wrong audience');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('expired');
  if (!claims.sub) throw new Error('no subject');
  return { sub: claims.sub, ...(claims.email ? { email: claims.email } : {}), groups: Array.isArray(claims.groups) ? claims.groups.filter((g): g is string => typeof g === 'string') : [], ...(typeof claims.nonce === 'string' ? { nonce: claims.nonce } : {}) };
}

/** What Companies needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface CompaniesCore {
  state(space: StoredSpace): SpaceState;
  decodedIn(spaceId: string): Decoded[];
  readonly managed: ManagedKeys;
  memo<T>(name: string, compute: () => T): T;
  readonly spaces: Map<string, StoredSpace>;
  createSpace(kind: SpaceKind, name: string, extra?: Record<string, Json>): Promise<StoredSpace>;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  keysForNewcomers(space: StoredSpace): SpaceKeys;
  entryPoint(): Invite['entry'];
  readonly encryptionKeyOf: (person: Did) => Did;
  upTo(person: Did): Record<string, number>;
  anchor(person: Did, space: StoredSpace): Record<string, { c: number; s: number; n: number }>;
  held(state: SpaceState): boolean;
  epochStarts(space: StoredSpace): Map<number, string>;
  readonly directs: Map<string, { space: StoredSpace; peer: Did }>;
  decodeAll(): Decoded[];
  agentName(signer: Did, author: Did): string | undefined;
  readonly sqlite: SqliteStore | undefined;
  tryOpen<T>(open: (me: Recipient) => T | undefined): T | undefined;
  rotateKey(space: StoredSpace): void;
  spaceInfo(space: StoredSpace): SpaceInfo;
  invalidateDecoded(): void;
}

export class Companies {
  private readonly node: WeaveNode;
  private readonly core: CompaniesCore;

  constructor(node: WeaveNode, core: CompaniesCore) {
    this.node = node;
    this.core = core;
  }

  /** The person's latest company sign-in (stage 6.3); none yet. */
  ssoToken(): string | undefined {
    return this.sso()?.idToken;
  }

  /** Access tokens for other resources, issued to this person from their sign-in (stage 14), until they run out. */
  delegatedTokens = new Map<string, { token: string; until: number }>();

  /** An access token for a resource (Azure Key Vault), as this person: from their sign-in's refresh token. */
  async delegated(scope: string): Promise<string | undefined> {
    const kept = this.delegatedTokens.get(scope);
    if (kept && kept.until > Date.now()) return kept.token;
    const sso = this.sso();
    if (!sso?.refreshToken || !sso.issuer || !sso.clientId) return undefined;
    const fresh = await delegatedToken({ issuer: sso.issuer, clientId: sso.clientId }, sso.refreshToken, scope);
    // Entra may hand out a new refresh token with it: keep the newest.
    if (fresh.refreshToken && fresh.refreshToken !== sso.refreshToken) this.saveSso({ ...sso, refreshToken: fresh.refreshToken });
    this.delegatedTokens.set(scope, { token: fresh.accessToken, until: fresh.expires });
    return fresh.accessToken;
  }

  /** The company sign-in kept here (sealed at rest): the ID token, and what renews it (stage 13). */
  sso(): Sso | undefined {
    return readSecretJson<Sso>(this.node.home, joinPath(this.node.home.dir, 'sso.json'));
  }

  saveSso(sso: Sso): void {
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'sso.json'), sso);
  }

  signInProblem?: string;

  /** The company group this company account belongs to (not the company's own node). */
  myCompanyGroup(): StoredSpace | undefined {
    const here = this.companyHere();
    return here && here.group.founder !== this.node.identity.author ? here.group : undefined;
  }

  /**
   * Keep a company account signed in (stage 13): renew the ID token with the
   * refresh token before it runs out, and sign in to the company again before
   * its vouching (24 hours) runs out, so nobody has to.
   */
  async renewSignIn(): Promise<number> {
    const sso = this.sso();
    if (!sso?.idToken) return 0;
    const now = this.node.clock();
    let changed = 0;
    if (sso.refreshToken && sso.issuer && sso.clientId && (sso.expires ?? 0) - now < 10 * 60_000) {
      try {
        const fresh = await refreshSignIn({ issuer: sso.issuer, clientId: sso.clientId }, sso.refreshToken);
        Object.assign(sso, fresh);
        this.saveSso(sso);
        this.signInProblem = undefined;
        changed++;
      } catch (error) {
        this.signInProblem = (error as Error).message;
        return changed;
      }
    }
    const group = this.myCompanyGroup();
    if (!group || (sso.expires ?? 0) <= now || !this.core.state(group).members.has(this.node.identity.author)) return changed;
    const vouched = this.attestations(group, group.founder).get(this.node.identity.author);
    const lastSignIn = this.core.decodedIn(group.id).filter((d) => d.inner.kind === KIND_SIGNIN && d.event.author === this.node.identity.author).at(-1)?.event.time ?? '';
    const soon = new Date(now + 6 * 3_600_000).toISOString();
    const hourAgo = new Date(now - 3_600_000).toISOString();
    if ((!vouched || vouched.until < soon) && lastSignIn < hourAgo) {
      await this.signIn({ space: group.id, idToken: sso.idToken });
      changed++;
    }
    return changed;
  }

  /** Sign in with your company account again, in the browser (when renewing stopped working, or to switch accounts). */
  async companySignIn(): Promise<SignInStatus> {
    const group = this.myCompanyGroup();
    const here = this.companyHere();
    const sso = this.sso();
    const config = sso?.issuer && sso.clientId ? { issuer: sso.issuer, clientId: sso.clientId } : here?.org.signIn;
    if (!group || !config) throw new Error("this isn't a company account, or its company hasn't said where to sign in");
    const tokens = await browserSignIn(config, openInBrowser, { for: this.node.identity.author, ...(claimsOf(sso?.idToken ?? '').email ? { loginHint: claimsOf(sso!.idToken).email! } : {}) });
    this.saveSso({ ...tokens, ...config });
    this.signInProblem = undefined;
    await this.signIn({ space: group.id, idToken: tokens.idToken, ...(tokens.salt ? { salt: tokens.salt } : {}) });
    return this.signInStatus();
  }

  async signInStatus(): Promise<SignInStatus> {
    const here = this.companyHere();
    const group = this.myCompanyGroup();
    if (!here || !group) return { company: false };
    const sso = this.sso();
    const vouched = this.attestations(group, group.founder).get(this.node.identity.author);
    const claims = claimsOf(sso?.idToken ?? '');
    return {
      company: true,
      name: this.node.nameOf(here.group.founder) ?? here.group.name,
      ...(claims.email ? { account: claims.email } : {}),
      ...(sso?.expires ? { tokenUntil: new Date(sso.expires).toISOString() } : {}),
      renews: !!sso?.refreshToken,
      ...(vouched ? { vouchedUntil: vouched.until } : {}),
      ...(this.signInProblem ? { problem: this.signInProblem } : {}),
    };
  }

  // ---------------------------------------------------------------- company accounts (stage 10)

  /** A company group's settings, if it is one: what the company that founded it signed there. */
  orgOf(group: StoredSpace): OrgState | undefined {
    // Only a group managed as its own company group can be one; that's read without decoding it.
    if (group.kind !== 'group' || this.core.managed.managedRaw(group).setting?.company !== group.id) return undefined;
    return this.core.memo(`org:${group.id}`, () => orgState(group.founder, this.core.decodedIn(group.id)));
  }

  /** The company groups this node runs: it founded them as the company. */
  companyGroups(): StoredSpace[] {
    return [...this.core.spaces.values()].filter((s) => s.kind === 'group' && s.founder === this.node.identity.author && this.orgOf(s));
  }

  /** The company this node runs, else the one this person belongs to (their own company's, for a company-owned identity). */
  companyHere(): { group: StoredSpace; org: OrgState } | undefined {
    const groups = [...this.core.spaces.values()].filter((s) => s.kind === 'group');
    const owner = this.node.replica.authority.keys(this.node.identity.author).org;
    const order = [this.node.identity.author, ...(owner ? [owner] : [])];
    for (const founder of [...order, undefined]) {
      for (const group of groups) {
        if (founder !== undefined ? group.founder !== founder : order.includes(group.founder)) continue;
        const org = this.orgOf(group);
        if (org) return { group, org };
      }
    }
    return undefined;
  }

  /** The company's spaces besides its group: founded by it, vouched for through the group. */
  companySpaces(group: StoredSpace): StoredSpace[] {
    return [...this.core.spaces.values()].filter((s) => s.id !== group.id && s.founder === group.founder && this.core.managed.managedRaw(s).setting?.company === group.id);
  }

  /** Who the company vouches for right now, with their sign-in groups. */
  vouched(group: StoredSpace): Map<Did, { groups: string[] }> {
    const now = new Date(this.node.clock()).toISOString();
    const out = new Map<Did, { groups: string[] }>();
    for (const [did, a] of this.attestations(group, group.founder)) if (a.until > now && !this.node.replica.authority.frozen(did)) out.set(did, { groups: a.groups });
    return out;
  }

  isOrgAdmin(group: StoredSpace, org: OrgState, did: Did): boolean {
    return did === group.founder || (!!org.admins && !!this.vouched(group).get(did)?.groups.includes(org.admins));
  }

  companyOfPerson(did: Did): NonNullable<Profile['company']> {
    const org = this.node.replica.authority.keys(did).org!;
    return { did: org, name: this.node.nameOf(org), ...(this.node.replica.authority.frozen(did) ? { frozen: true as const } : {}) };
  }

  /**
   * The company someone belongs to, as far as this node can tell (MHV79Ro6):
   * the one their identity names, if that company has them in its company
   * group. Anyone can name a company in their identity; only the company puts
   * them in its group. A bare claim counts only for what it costs the claimant
   * (the company may freeze them; its policy holds them).
   */
  companyVouchedOf(did: Did): Did | undefined {
    const claim = this.companyClaim(did);
    return claim?.vouched ? claim.org : undefined;
  }

  /** The company someone's identity names, and whether it vouches for them as far as this node sees: yes, no (we hold its group), or can't tell. */
  companyClaim(did: Did): { org: Did; vouched?: boolean } | undefined {
    const org = this.node.replica.authority.keys(did).org;
    if (!org) return undefined;
    // A freeze by that company is its word too: it held them.
    if (this.node.replica.authority.frozen(did)) return { org, vouched: true };
    const groups = [...this.core.spaces.values()].filter((s) => s.kind === 'group' && s.founder === org && !!this.orgOf(s));
    if (!groups.length) return { org };
    return { org, vouched: groups.some((g) => this.core.state(g).members.has(did)) };
  }

  async createCompany(input: CreateCompanyInput): Promise<CompanyInfo> {
    if (this.companyGroups().length) throw new Error('this node already runs a company');
    if (!input.admins?.trim()) throw new Error("name the sign-in group of the company's admins");
    if (!input.issuer || !input.audience) throw new Error("the company's sign-in: its issuer and the audience its tokens name");
    const group = await this.core.createSpace('group', input.name);
    this.node.config = { ...this.node.config, attestor: { issuer: input.issuer, audience: input.audience, ...(input.hours ? { hours: input.hours } : {}) } };
    saveConfig(this.node.home, this.node.config);
    await this.manageSpace({ space: group.id, provider: input.provider as ProviderSpec, ttlMinutes: input.ttlMinutes, graceHours: input.graceHours, attestor: this.node.identity.author, company: group.id });
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_ORG_SETTINGS, body: { admins: input.admins.trim(), links: true, signIn: { issuer: input.issuer, clientId: input.audience } } }));
    return (await this.company())!;
  }

  async company(): Promise<CompanyInfo | undefined> {
    const here = this.companyHere();
    if (!here) return undefined;
    const { group, org } = here;
    const name = (id: string) => this.core.spaces.get(id)?.name ?? id;
    return {
      did: group.founder,
      name: this.node.nameOf(group.founder) ?? group.name,
      group: { id: group.id, name: group.name },
      runsHere: group.founder === this.node.identity.author,
      admin: this.isOrgAdmin(group, org, this.node.identity.author),
      ...(org.admins ? { admins: org.admins } : {}),
      ...(org.auditors ? { auditors: org.auditors } : {}),
      ...(org.helpdesk ? { helpdesk: org.helpdesk } : {}),
      links: org.links,
      policy: org.policy,
      retention: org.retention,
      spaceRetention: org.spaceRetention,
      chats: org.chats.map((c) => ({ space: c.space, name: name(c.space), people: c.people.map((d) => this.node.nameOf(d) ?? d) })),
      maps: org.maps.map((m) => ({ ...m, spaceName: name(m.space) })),
      start: org.start?.contacts ?? [],
      spaces: this.companySpaces(group).map((s) => ({ id: s.id, kind: s.kind, name: s.name })),
      requests: org.requests.slice(-20).map((r) => {
        const done = org.done.get(r.id);
        return { id: r.id, by: r.by, byName: this.node.nameOf(r.by), time: r.time, action: r.action.action, done: !!done, ...(done?.error ? { error: done.error } : {}) };
      }),
    };
  }

  async companyAction(action: CompanyAction): Promise<CompanyInfo> {
    const here = this.companyHere();
    if (!here) throw new Error("you're not in a company");
    const { group, org } = here;
    if (group.founder === this.node.identity.author) await this.orgDo(group, action);
    else {
      if (action.action !== 'chat' && !this.isOrgAdmin(group, org, this.node.identity.author)) throw new Error(`only ${this.node.nameOf(group.founder) ?? group.name}'s admins ask the company for that`);
      // Spaces and people as ids where this node knows them; the company resolves the rest.
      const body: Record<string, Json> = { ...(action as unknown as Record<string, Json>) };
      if (typeof body.space === 'string' && action.action !== 'space') body.space = this.core.spaces.has(body.space) ? body.space : ([...this.core.spaces.values()].find((s) => s.name === body.space)?.id ?? body.space);
      if (typeof body.person === 'string') body.person = this.node.resolve(body.person);
      if (typeof body.with === 'string') body.with = this.node.resolve(body.with);
      this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_ORG_REQUEST, body }));
    }
    return (await this.company())!;
  }

  async enrollLink(input: { days?: number } = {}): Promise<string> {
    const here = this.companyHere();
    if (!here) throw new Error("you're not in a company: create it on the company's node first (weave company create)");
    if (!this.isOrgAdmin(here.group, here.org, this.node.identity.author)) throw new Error('only the company and its admins hand out enrollment links');
    const invite = await this.node.invite(here.group.id, (input.days ?? 30) * 24);
    const company = here.group.founder;
    const signIn = here.org.signIn ?? (this.node.config.attestor ? { issuer: this.node.config.attestor.issuer, clientId: this.node.config.attestor.audience } : undefined);
    return encodeEnrollment({ v: 1, company, name: this.node.nameOf(company) ?? here.group.name, group: here.group.id, invite, entry: { topics: [company], bootstrap: this.node.config.bootstrap }, ...(signIn ? { signIn } : {}) });
  }

  /**
   * An invitation by email (stage 14): a new enrollment link, sent through the company's mail server
   * (WEAVE_SMTP_URL). It points at the console's join page, which opens Weave with the link.
   */
  async inviteByEmail(input: { to: string; by?: string; days?: number }): Promise<{ to: string; joinUrl: string }> {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.to)) throw new Error(`${input.to} isn't an email address`);
    const server = mailServer();
    if (!server) throw new Error("give the company's node its mail server first (WEAVE_SMTP_URL, and WEAVE_SMTP_FROM)");
    const base = this.console?.url ?? process.env.WEAVE_PUBLIC_URL;
    if (!base) throw new Error('the invitation points at the admin console: turn it on first (weave company console on)');
    const link = await this.enrollLink(input.days ? { days: input.days } : {});
    const joinUrl = `${base.replace(/\/$/, '')}/join#${link}`;
    const company = (await this.company())?.name ?? 'your company';
    await sendMail(server, invitationMail({ to: input.to, company, joinUrl, link, ...(input.by ? { by: input.by } : {}) }));
    return { to: input.to, joinUrl };
  }

  /** What the company does, on its own node: for itself, or for an admin who asked. */
  async orgDo(group: StoredSpace, action: CompanyAction, by: Did = this.node.identity.author): Promise<void> {
    const write = (kind: string, body: Json) => this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind, body }));
    const companySpace = (ref: string) => {
      const space = this.core.space(ref);
      if (space.id !== group.id && !this.companySpaces(group).some((s) => s.id === space.id)) throw new Error(`${space.name} isn't one of the company's spaces`);
      return space;
    };
    switch (action.action) {
      case 'settings': {
        const org = this.orgOf(group)!;
        const policy = readPolicy(action, org.policy);
        // The company's retention, or one project's or group's own (stage 15).
        const forSpace = action.retention?.space ? companySpace(action.retention.space) : undefined;
        const spaceRetention: Record<string, Retention> = { ...org.spaceRetention };
        const retention: Retention = forSpace ? { ...(org.spaceRetention[forSpace.id] ?? {}) } : { ...org.retention };
        for (const key of ['minDays', 'maxDays'] as const) {
          const days = action.retention?.[key];
          if (days === null) delete retention[key];
          else if (days !== undefined) {
            if (!Number.isFinite(days) || days <= 0 || days > 36_500) throw new Error('retention is a number of days above 0');
            retention[key] = days;
          }
        }
        if (retention.minDays && retention.maxDays && retention.minDays > retention.maxDays) throw new Error('the minimum is longer than the maximum');
        if (forSpace) {
          if (retention.minDays || retention.maxDays) spaceRetention[forSpace.id] = retention;
          else delete spaceRetention[forSpace.id];
        }
        const role = (value: string | null | undefined, now: string | undefined) => (value === null ? null : value?.trim() || now || null);
        let deviceCA = org.deviceCA ?? null;
        if (action.deviceCA === null) deviceCA = null;
        else if (action.deviceCA !== undefined) {
          checkAuthority(action.deviceCA);
          deviceCA = action.deviceCA;
        }
        write(KIND_ORG_SETTINGS, {
          admins: action.admins?.trim() || org.admins || null,
          auditors: role(action.auditors, org.auditors),
          helpdesk: role(action.helpdesk, org.helpdesk),
          ...policy,
          retention: (forSpace ? org.retention : retention) as unknown as Json,
          spaceRetention: spaceRetention as unknown as Json,
          deviceCA,
          ...(org.signIn ? { signIn: org.signIn } : {}),
        });
        // Published, so every node holds the company's accounts to it (and counts their links only while allowed).
        // With the last number of each company account's keys it holds: what they sign past it is held to the policy, whatever date it claims.
        if (JSON.stringify(policy) !== JSON.stringify(org.policy)) this.node.replica.write(this.node.identity, { kind: KIND_ORG_POLICY, body: { ...policy, from: this.companyKeysUpTo() } });
        return;
      }
      case 'chat': {
        if (by === this.node.identity.author) throw new Error('a company chat is between two colleagues: one of them asks for it');
        const other = this.node.resolve(action.with);
        const vouched = this.vouched(group);
        if (!vouched.has(by) || !vouched.has(other) || other === by) throw new Error('company chats are between two colleagues the company vouches for');
        if (this.orgOf(group)!.chats.some((c) => c.people.includes(by) && c.people.includes(other) && this.core.spaces.has(c.space))) return;
        const space = await this.core.createSpace('group', `${this.node.nameOf(by) ?? 'colleague'} & ${this.node.nameOf(other) ?? 'colleague'}`);
        const setting = this.core.managed.managedRaw(group).setting!;
        await this.manageSpace({ space: space.id, provider: setting.provider as unknown as ProviderSpec, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, attestor: this.node.identity.author, company: group.id });
        write(KIND_ORG_CHAT, { space: space.id, people: [by, other] });
        return;
      }
      case 'map': {
        const space = companySpace(action.space);
        if (space.id === group.id) throw new Error('everyone the company vouches for is in the company group already');
        if (!action.group?.trim()) throw new Error('map a sign-in group');
        write(KIND_ORG_MAP, { group: action.group.trim(), space: space.id, role: action.role === 'maintainer' ? 'maintainer' : 'member', on: action.on !== false });
        return;
      }
      case 'start':
        for (const contact of action.contacts) decodeContact(contact);
        write(KIND_ORG_START, { contacts: action.contacts });
        return;
      case 'space': {
        const space = await this.core.createSpace(action.kind === 'group' ? 'group' : 'project', action.name);
        const setting = this.core.managed.managedRaw(group).setting!;
        await this.manageSpace({ space: space.id, provider: setting.provider as unknown as ProviderSpec, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, attestor: this.node.identity.author, company: group.id });
        return;
      }
      case 'hold':
        await this.node.setHold({ space: companySpace(action.space).id, until: action.until, ...(action.reason ? { reason: action.reason } : {}) });
        return;
      case 'destroy-key':
        await this.destroyCompanyKey(companySpace(action.space).id);
        return;
      case 'freeze':
        await this.freeze(this.node.resolve(action.person));
        return;
    }
  }

  /**
   * Freeze a company-owned identity: public, so every node ignores what its
   * keys sign after the numbers seen here (and anything by keys not seen). It
   * leaves the company's spaces; its history stays.
   */
  async freeze(person: Did): Promise<void> {
    const keys = this.node.replica.authority.keys(person);
    if (keys.org !== this.node.identity.author) throw new Error(`${this.node.nameOf(person) ?? person} isn't an identity this company owns`);
    const signers = new Set<Did>([person, keys.root, ...keys.retired.keys(), ...this.node.replica.authority.grantsOf(person).map((g) => g.subject)]);
    const last: Record<string, number> = {};
    for (const r of this.node.replica.events((e) => signers.has(e.signer))) last[r.signer] = Math.max(last[r.signer] ?? 0, r.seq);
    for (const space of [...this.core.spaces.values()]) {
      const state = this.core.state(space);
      if (space.founder === this.node.identity.author && state.members.has(person) && mayAct(state, this.node.identity.author, 'manage').ok) await this.node.removeMember(space.id, person);
    }
    this.node.replica.write(this.node.identity, { kind: KIND_ORG_FREEZE, body: { person, keys: last } });
  }

  /**
   * On the company's node: answer admins' requests, and keep the company's
   * spaces in line with its sign-in groups: admit and gift keys to those a
   * mapping (or being an admin) puts there, appoint maintainers, and remove
   * those a mapping brought in that no longer belong.
   */
  async orgDuties(): Promise<number> {
    let changed = 0;
    for (const group of this.companyGroups()) {
      let org = this.orgOf(group)!;
      for (const request of org.requests) {
        if (org.done.has(request.id)) continue;
        let error: string | undefined;
        // Anyone the company vouches for may ask for a company chat; everything else is for admins.
        const allowed = request.action.action === 'chat' ? this.vouched(group).has(request.by) : this.isOrgAdmin(group, org, request.by);
        if (!allowed) error = request.action.action === 'chat' ? 'company chats are for colleagues the company vouches for' : "only the company's admins ask for that";
        else {
          try {
            await this.orgDo(group, request.action, request.by);
          } catch (e) {
            error = (e as Error).message;
          }
        }
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_ORG_DONE, body: { request: request.id, ...(error ? { error } : {}) } }));
        changed++;
      }
      org = this.orgOf(group)!;
      const vouched = this.vouched(group);
      for (const space of this.companySpaces(group)) {
        let state = this.core.state(space);
        if (state.closed) continue;
        const want = new Map<Did, MapRole>();
        for (const [did, a] of vouched) {
          if (org.admins && a.groups.includes(org.admins) && space.kind === 'project') want.set(did, 'maintainer');
          for (const m of org.maps) if (m.space === space.id && a.groups.includes(m.group) && want.get(did) !== 'maintainer') want.set(did, m.role);
        }
        for (const chat of org.chats) if (chat.space === space.id) for (const did of chat.people) if (vouched.has(did) && !want.has(did)) want.set(did, 'member');
        const newcomers = [...want.keys()].filter((did) => !state.members.has(did));
        if (newcomers.length) {
          for (const member of newcomers) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ADMIT, body: { member, via: group.id } }));
          this.node.replica.write(this.node.identity, gift(this.core.keysForNewcomers(space), newcomers, spaceScope(group), this.core.entryPoint(), this.core.encryptionKeyOf));
          changed += newcomers.length;
          state = this.core.state(space);
        }
        if (space.kind === 'project') {
          for (const [did, role] of want) {
            if (role !== 'maintainer' || !state.members.has(did) || state.maintainers.has(did)) continue;
            this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_MAINTAINER, body: { member: did, on: true } }));
            changed++;
          }
          for (const did of state.maintainers) {
            if (did === state.founder || state.members.get(did)?.via !== group.id || want.get(did) === 'maintainer') continue;
            this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_MAINTAINER, body: { member: did, on: false, upTo: this.core.upTo(did), at: this.core.anchor(did, space) } }));
            changed++;
          }
          state = this.core.state(space);
        }
        for (const member of [...state.members.values()]) {
          if (member.via !== group.id || member.did === this.node.identity.author || want.has(member.did)) continue;
          await this.node.removeMember(space.id, member.did);
          changed++;
        }
      }
      for (const space of [group, ...this.companySpaces(group)]) {
        const maxDays = (org.spaceRetention[space.id] ?? org.retention).maxDays;
        if (maxDays) changed += await this.shredOlder(space, maxDays);
      }
    }
    return changed;
  }

  /** The company's maximum: shred the keys of a company space that ended before it (what rules keep is carried forward first). */
  async shredOlder(space: StoredSpace, maxDays: number): Promise<number> {
    const state = this.core.state(space);
    if (this.core.held(state) || !mayAct(state, this.node.identity.author, 'manage').ok) return 0;
    const before = new Date(this.node.clock() - maxDays * DAY_MS).toISOString();
    const starts = this.core.epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    if (!epochs.slice(0, -1).some((_, i) => (starts.get(epochs[i + 1]) ?? '') !== '' && starts.get(epochs[i + 1])! <= before)) return 0;
    await this.node.shred({ space: space.id, before, dropOlder: true });
    return 1;
  }

  /** A company space's retention, from its company group: its own if the company gave it one (stage 15), else the company's. */
  companyRetention(space: StoredSpace): Retention | undefined {
    const company = this.core.managed.managedRaw(space).setting?.company;
    const group = company ? this.core.spaces.get(company) : this.orgOf(space) ? space : undefined;
    const org = group ? this.orgOf(group) : undefined;
    return org ? (org.spaceRetention[space.id] ?? org.retention) : undefined;
  }

  /** A space's epochs that ended less than `days` ago (or haven't ended): a company's minimum keeps them. */
  endedWithin(space: StoredSpace, days: number): Set<number> {
    const since = new Date(this.node.clock() - days * DAY_MS).toISOString();
    const starts = this.core.epochStarts(space);
    const epochs = Object.keys(space.keys).map(Number).sort((a, b) => a - b);
    return new Set(epochs.filter((_, i) => i === epochs.length - 1 || (starts.get(epochs[i + 1]) ?? '9999') > since));
  }

  // ---------------------------------------------------------------- company policy (stage 11)

  /** Companies' published policies, by company. Read once, then kept up to date as policies arrive (it's asked while events are received). */
  policyCache?: Map<Did, CompanyPolicy & { time: string; from?: Map<Did, number> }>;

  /** The last number of every key of this company's accounts that this (the company's) node holds. */
  companyKeysUpTo(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const signer of this.node.replica.signers()) {
      const person = this.node.replica.authority.personOf(signer);
      if (person === this.node.identity.author || this.node.replica.authority.keys(person).org !== this.node.identity.author) continue;
      out[signer] = this.node.replica.number(signer);
    }
    return out;
  }

  policies(): Map<Did, CompanyPolicy & { time: string; from?: Map<Did, number> }> {
    if (!this.policyCache) {
      this.policyCache = new Map();
      for (const r of this.node.replica.events((e) => e.kind === KIND_ORG_POLICY && e.scope === 'public')) this.takePolicy(r);
    }
    return this.policyCache;
  }

  takePolicy(r: { author: Did; time: string; body: Json }): void {
    const before = this.policyCache!.get(r.author);
    const from = (r.body as { from?: unknown } | null)?.from;
    const upTo = from && typeof from === 'object' && !Array.isArray(from) ? new Map(Object.entries(from as Record<string, unknown>).filter((e): e is [Did, number] => isDid(e[0]) && Number.isSafeInteger(e[1]))) : undefined;
    if (!before || before.time <= r.time) this.policyCache!.set(r.author, { ...readPolicy(r.body), time: r.time, ...(upTo ? { from: upTo } : {}) });
  }

  /** A company account's company policy, if its company published one. */
  policyOf(person: Did): { org: Did; policy: CompanyPolicy & { time: string; from?: Map<Did, number> } } | undefined {
    const org = this.node.replica.authority.keys(person).org;
    const policy = org ? this.policies().get(org) : undefined;
    return org && policy ? { org, policy } : undefined;
  }

  /** For a company account kept to the company's spaces: why it may not go elsewhere. */
  insideOnly(founder?: Did): string | undefined {
    const own = this.policyOf(this.node.identity.author);
    if (!own || own.policy.outside || founder === own.org) return undefined;
    return `${this.node.nameOf(own.org) ?? 'Your company'}'s accounts stay in the company's spaces`;
  }

  /**
   * What a company account signs against its company's published policy, from
   * when it was published: refused by its own node when writing and by every
   * node when receiving. Leaving, identity and keys are always allowed. "From
   * when" is by number where the policy names them (what each key had signed by
   * then), so backdating doesn't get past it; by time for older policies.
   */
  policyRefuses(event: { author: Did; signer?: Did; n?: number; space: string; kind: string; time: string }, body: Json | undefined): string | undefined {
    const found = this.policyOf(event.author);
    if (!found || ALWAYS_ALLOWED.has(event.kind)) return undefined;
    const from = found.policy.from;
    const earlier = from && event.signer && event.n !== undefined ? event.n <= (from.get(event.signer) ?? 0) : event.time < found.policy.time;
    if (earlier) return undefined;
    const { org, policy } = found;
    const who = this.node.nameOf(org) ?? 'The company';
    const colleague = (did: Did) => did === org || this.companyVouchedOf(did) === org;
    if (event.space === 'public') {
      if (policy.public) return undefined;
      const b = body as { subject?: unknown; on?: unknown } | null | undefined;
      if (event.kind === KIND_FOLLOW && (b?.on === false || (isDid(b?.subject) && colleague(b.subject)))) return undefined;
      return `${who}'s accounts don't post publicly`;
    }
    if (event.space === 'self' || (event as { class?: string }).class === 'control') return undefined;
    const scope = parseScope(event.space);
    if (!scope) return undefined;
    if (scope.kind === 'direct') {
      if (policy.directs === 'off') return `${who}'s accounts don't use direct chats`;
      const direct = this.core.directs.get(scope.id);
      const other = !direct ? undefined : event.author === this.node.identity.author ? direct.peer : direct.peer === event.author ? this.node.identity.author : undefined;
      if (!other) return undefined;
      if (policy.directs === 'company' && !colleague(other)) return `${who}'s accounts chat directly only with colleagues`;
      if (policy.chats && other !== org && colleague(other)) return `${who} keeps chats between colleagues in company chats (weave company chat <colleague>)`;
      return undefined;
    }
    if (policy.outside) return undefined;
    const space = this.core.spaces.get(scope.id);
    return space && space.founder !== org ? `${who}'s accounts stay in the company's spaces` : undefined;
  }

  get enrollFile(): string {
    return joinPath(this.node.home.dir, 'enroll.json');
  }

  /**
   * A new company account's remaining steps, once the company group's events
   * are here: unlock it with the person's sign-in, join, sign in with the
   * attestor, leave the words with the company, the starting setup.
   */
  async continueEnrollment(): Promise<number> {
    const pending = readSecretJson<Enrolling>(this.node.home, this.enrollFile);
    if (!pending) return 0;
    const group = this.core.spaces.get(pending.group);
    if (!group || !this.core.managed.managedRaw(group).setting?.attestor) return 0;
    let changed = 0;
    if (pending.idToken && this.sso()?.idToken !== pending.idToken) this.saveSso({ ...(this.sso() ?? {}), idToken: pending.idToken, salt: pending.salt, expires: (claimsOf(pending.idToken).exp ?? 0) * 1000 });
    await this.core.managed.unlock(group);
    if (this.core.managed.managedProblems.has(group.id)) return 0;
    if (!pending.joined) {
      this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_JOIN, body: { invite: pending.invite, ...(pending.proof ? { proof: pending.proof } : {}) } }));
      pending.joined = true;
      changed++;
    }
    if (pending.idToken) {
      await this.signIn({ space: group.id, idToken: pending.idToken, ...(pending.salt ? { salt: pending.salt } : {}) });
      delete pending.idToken;
      delete pending.salt;
      changed++;
    }
    if (pending.words) {
      await this.node.escrowRecovery({ space: group.id, words: pending.words });
      delete pending.words;
      changed++;
    }
    const org = this.orgOf(group);
    if (!pending.started && org) {
      for (const contact of org.start?.contacts ?? []) {
        try {
          await this.node.addContact(contact);
        } catch {
          // Our own link, or a damaged one: nothing to add.
        }
      }
      pending.started = true;
      changed++;
    }
    if (pending.words || !pending.started) writeSecretJson(this.node.home, this.enrollFile, pending);
    else rmSync(this.enrollFile, { force: true });
    return changed;
  }

  async link(input: { who: string; space?: string; on?: boolean }): Promise<LinkInfo[]> {
    const to = input.who.includes('weave:contact:') ? (await this.node.addContact(input.who)).did : this.node.resolve(input.who);
    if (to === this.node.identity.author) throw new Error("that's this identity");
    const on = input.on !== false;
    if (on && this.node.replica.authority.keys(this.node.identity.author).org) {
      const here = this.companyHere();
      if (here && !here.org.links) throw new Error(`${this.node.nameOf(here.group.founder) ?? here.group.name} doesn't let its accounts link to others`);
    }
    const fields = { kind: KIND_LINK, body: { to, on } };
    if (input.space) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(this.core.space(input.space)), fields));
    else this.node.replica.write(this.node.identity, fields);
    return this.linksOf(this.node.identity.author);
  }

  async links(who?: string): Promise<LinkInfo[]> {
    return this.linksOf(who ? this.node.resolve(who) : this.node.identity.author);
  }

  /**
   * Every link statement this node can read (public, or sealed into its
   * spaces), the latest per direction; companies' public word on links; and
   * when companies froze their identities. Built once per change of what's
   * decoded: profiles ask for it person by person.
   */
  linkIndex(): { said: Map<string, { on: boolean; time: string; space?: string }>; others: Map<Did, Set<Did>>; policy: Map<Did, boolean>; frozenAt: Map<Did, string> } {
    return this.core.memo('links', () => {
      const said = new Map<string, { on: boolean; time: string; space?: string }>();
      const others = new Map<Did, Set<Did>>();
      const policy = new Map<Did, boolean>();
      const frozenAt = new Map<Did, string>();
      for (const d of this.core.decodeAll()) {
        const b = d.inner.body as Record<string, unknown> | null;
        if (d.inner.kind === KIND_LINK && isDid(b?.to) && b.to !== d.event.author) {
          const [from, to] = [d.event.author, b.to];
          const before = said.get(`${from} ${to}`);
          if (!before || before.time <= d.event.time) said.set(`${from} ${to}`, { on: b.on !== false, time: d.event.time, ...(d.space ? { space: d.space.id } : {}) });
          for (const [x, y] of [[from, to], [to, from]] as const) {
            const set = others.get(x) ?? new Set<Did>();
            others.set(x, set.add(y));
          }
        } else if (d.inner.kind === KIND_ORG_POLICY && !d.space && typeof b?.links === 'boolean') policy.set(d.event.author, b.links);
        else if (d.inner.kind === KIND_ORG_FREEZE && isDid(b?.person) && !frozenAt.has(b.person) && this.node.replica.authority.keys(b.person).org === d.event.author) frozenAt.set(b.person, d.event.time);
      }
      return { said, others, policy, frozenAt };
    });
  }

  /** A person's links, where either side says so (see #linkIndex). */
  linksOf(did: Did): LinkInfo[] {
    const { said, others, policy, frozenAt } = this.linkIndex();
    const out: LinkInfo[] = [];
    for (const other of others.get(did) ?? []) {
      const mine = said.get(`${did} ${other}`);
      const theirs = said.get(`${other} ${did}`);
      if (!mine?.on && !theirs?.on) continue;
      // A company that said no: its identities' links don't count (it does allow them unless it said so).
      const refused = [did, other].some((x) => {
        const org = this.node.replica.authority.keys(x).org;
        return !!org && policy.get(org) === false;
      });
      const until = [did, other].map((x) => (this.node.replica.authority.frozen(x) ? frozenAt.get(x) : undefined)).filter((t): t is string => !!t).sort()[0];
      const claim = this.companyClaim(other);
      const org = claim && claim.vouched !== false ? claim.org : undefined;
      const space = mine?.space ?? theirs?.space;
      out.push({
        did: other,
        name: this.node.nameOf(other),
        state: refused ? 'refused' : mine?.on && theirs?.on ? 'linked' : mine?.on ? 'waiting' : 'asked',
        since: [mine?.on ? mine.time : '', theirs?.on ? theirs.time : ''].sort().at(-1)!,
        ...(until ? { until } : {}),
        ...(org ? { company: { did: org, name: this.node.nameOf(org), ...(claim?.vouched ? {} : { unconfirmed: true as const }) } } : {}),
        ...(space ? { space: this.core.spaces.get(space)?.name ?? space } : {}),
      });
    }
    return out.sort((a, b) => a.since.localeCompare(b.since));
  }

  // ---------------------------------------------------------------- the audit in security tools, and exports (stage 12)

  get sinksFile(): string {
    return joinPath(this.node.home.dir, 'audit-streams.json');
  }

  /** Sinks (secrets included: sealed at rest), what each was sent (line id → time), and their last problems. */
  sinks(): { sinks: AuditSink[]; sent: Record<string, Record<string, string>>; problems: Record<string, string> } {
    return readSecretJson(this.node.home, this.sinksFile) ?? { sinks: [], sent: {}, problems: {} };
  }

  async addAuditStream(input: AuditSinkInput): Promise<AuditStreamInfo[]> {
    if (!this.companyGroups().length) throw new Error("the audit streams from the company's own node");
    const state = this.sinks();
    state.sinks.push(newSink(input));
    writeSecretJson(this.node.home, this.sinksFile, state);
    await this.streamAudit();
    return this.auditStreams();
  }

  async removeAuditStream(id: string): Promise<AuditStreamInfo[]> {
    const state = this.sinks();
    if (!state.sinks.some((s) => s.id === id)) throw new Error(`no audit stream ${id}`);
    state.sinks = state.sinks.filter((s) => s.id !== id);
    delete state.sent[id];
    delete state.problems[id];
    writeSecretJson(this.node.home, this.sinksFile, state);
    return this.auditStreams();
  }

  async auditStreams(): Promise<AuditStreamInfo[]> {
    const state = this.sinks();
    return state.sinks.map((s) => {
      const sent = Object.values(state.sent[s.id] ?? {});
      return { id: s.id, kind: s.kind, target: sinkTarget(s), sent: sent.length, ...(sent.length ? { lastSent: sent.sort().at(-1) } : {}), ...(state.problems[s.id] ? { problem: state.problems[s.id] } : {}) };
    });
  }

  streaming?: Promise<number>;

  /** Send each sink the company's audit lines of the last 31 days it hasn't had yet; what fails is sent next time. */
  streamAudit(): Promise<number> {
    this.streaming ??= (async () => {
      try {
        const state = this.sinks();
        if (!state.sinks.length) return 0;
        const since = new Date(this.node.clock() - 31 * DAY_MS).toISOString();
        const lines: StreamedLine[] = [];
        for (const group of this.companyGroups()) {
          for (const space of [group, ...this.companySpaces(group)]) {
            for (const l of await this.node.audit({ space: space.id, since })) lines.push({ ...l, space: { id: space.id, name: space.name } });
          }
        }
        lines.sort((a, b) => a.time.localeCompare(b.time));
        let sent = 0;
        for (const sink of state.sinks) {
          const had = (state.sent[sink.id] ??= {});
          for (const [id, time] of Object.entries(had)) if (time < since) delete had[id];
          const fresh = lines.filter((l) => l.id && !had[l.id]);
          try {
            for (let i = 0; i < fresh.length; i += 500) {
              const batch = fresh.slice(i, i + 500);
              await sendLines(sink, batch);
              for (const l of batch) had[l.id!] = l.time;
              sent += batch.length;
            }
            delete state.problems[sink.id];
          } catch (error) {
            state.problems[sink.id] = (error as Error).message;
          }
        }
        writeSecretJson(this.node.home, this.sinksFile, state);
        return sent;
      } finally {
        this.streaming = undefined;
      }
    })();
    return this.streaming;
  }

  async exportSpace(input: { space: string; since?: string; until?: string }): Promise<ExportLine[]> {
    const space = this.core.space(input.space);
    const state = this.core.state(space);
    if (!mayAct(state, this.node.identity.author, 'manage').ok) throw new Error(`only those who manage ${space.name} export it`);
    const since = input.since ? new Date(input.since).toISOString() : '';
    const until = input.until ? new Date(input.until).toISOString() : '9999';
    const decoded = this.core.decodedIn(space.id);
    const deleted = new Map<string, string>();
    const edited = new Map<string, string[]>();
    for (const d of decoded) {
      const target = (d.inner.body as { target?: unknown } | null)?.target;
      if (typeof target !== 'string') continue;
      if (d.inner.kind === KIND_POST_DELETE && !deleted.has(target)) deleted.set(target, d.event.time);
      if (d.inner.kind === KIND_POST_EDIT) edited.set(target, [...(edited.get(target) ?? []), d.event.time]);
    }
    return decoded
      .filter((d) => d.event.time >= since && d.event.time <= until && d.inner.kind !== KIND_CARRY)
      .map((d) => {
        const agent = this.core.agentName(d.event.signer, d.event.author);
        const name = this.node.nameOf(d.event.author);
        return {
          id: d.id,
          time: d.event.time,
          kind: d.inner.kind,
          by: d.event.author,
          ...(name ? { byName: name } : {}),
          signer: d.event.signer,
          ...(agent ? { agent } : {}),
          body: withoutSecrets(d.inner.body),
          ...(deleted.has(d.id) ? { deleted: deleted.get(d.id) } : {}),
          ...(edited.has(d.id) ? { edited: edited.get(d.id) } : {}),
        };
      });
  }

  // ---------------------------------------------------------------- SCIM and devices (stage 12)

  deviceProof(idToken: string): unknown {
    let creds = this.node.deviceCredentials;
    const managed = machinePolicy();
    if (!creds && managed.deviceCert && managed.deviceKey) {
      try {
        creds = { cert: readFileSync(managed.deviceCert, 'utf8'), key: readFileSync(managed.deviceKey, 'utf8') };
      } catch {
        creds = undefined;
      }
    }
    return creds ? deviceProof(creds.cert, creds.key, this.node.identity.author, idToken) : undefined;
  }

  get scimFile(): string {
    return joinPath(this.node.home.dir, 'scim.json');
  }

  scimDirectory(): ScimDirectory {
    return readSecretJson<ScimDirectory>(this.node.home, this.scimFile) ?? emptyDirectory();
  }

  scimServer?: { port: number; close(): Promise<void> };
  /** Directory changes, one after another. */
  scimWork: Promise<unknown> = Promise.resolve();

  /** On the company's node: serve SCIM for the company's user management (a new token each time), or stop. */
  async setScim(input: { on: boolean; port?: number; invite?: boolean }): Promise<ScimInfo> {
    if (!this.companyGroups().length) throw new Error("SCIM runs on the company's own node (weave company create)");
    if (!input.on) {
      const { scim: _scim, ...rest } = this.node.config;
      this.node.config = rest;
      saveConfig(this.node.home, this.node.config);
      await this.scimServer?.close();
      this.scimServer = undefined;
      return this.scim();
    }
    const token = newScimToken();
    writeSecretJson(this.node.home, this.scimFile, { ...this.scimDirectory(), tokenHash: hashToken(token) });
    if (input.invite && !mailServer()) throw new Error("to send invitations, give the company's node its mail server (WEAVE_SMTP_URL)");
    this.node.config = { ...this.node.config, scim: { port: input.port ?? this.node.config.scim?.port ?? 7720, ...((input.invite ?? this.node.config.scim?.invite) ? { invite: true } : {}) } };
    saveConfig(this.node.home, this.node.config);
    await this.startScim();
    return { ...(await this.scim()), token };
  }

  async scim(): Promise<ScimInfo> {
    const directory = this.scimDirectory();
    const vouched = new Map<string, Did>();
    for (const group of this.companyGroups()) for (const [did, a] of this.attestations(group, this.node.identity.author)) vouched.set(a.subject, did);
    return {
      on: !!this.node.config.scim,
      ...(this.scimServer ? { port: this.scimServer.port } : {}),
      ...(this.node.config.scim?.invite ? { invite: true } : {}),
      users: Object.values(directory.users).map((u) => {
        const did = vouched.get(u.externalId ?? '') ?? vouched.get(u.userName);
        return { userName: u.userName, ...(u.displayName ? { displayName: u.displayName } : {}), active: u.active, groups: groupsOf(directory, u.id), ...(did ? { did, name: this.node.nameOf(did) } : {}) };
      }),
      groups: Object.values(directory.groups).map((g) => ({ name: g.displayName, members: g.members.length })),
    };
  }

  /** Start what the company's node serves (SCIM, the admin console), as configured. The daemon calls it. */
  async startServices(): Promise<void> {
    if (this.node.config.standby) return;
    if (this.node.config.scim) await this.startScim().catch((error: Error) => console.error(`weave: SCIM couldn't start: ${error.message}`));
    if (this.node.config.console) await this.startConsole().catch((error: Error) => console.error(`weave: the admin console couldn't start: ${error.message}`));
  }

  // ---------------------------------------------------------------- the admin console (stage 12)

  console?: { port: number; url: string; operatorLink(): string; close(): Promise<void> };

  get consoleFile(): string {
    return joinPath(this.node.home.dir, 'console.json');
  }

  /** On the company's node: serve the admin console (or stop). Admins sign in with the company's sign-in through the app registration `clientId`. */
  async setConsole(input: { on: boolean; port?: number; url?: string; clientId?: string; clientSecret?: string }): Promise<ConsoleInfo> {
    if (!this.companyGroups().length || !this.node.config.attestor) throw new Error("the admin console runs on the company's own node (weave company create)");
    if (!input.on) {
      const { console: _console, ...rest } = this.node.config;
      this.node.config = rest;
      saveConfig(this.node.home, this.node.config);
      await this.console?.close();
      this.console = undefined;
      return this.consoleInfo();
    }
    const clientId = input.clientId ?? this.node.config.console?.clientId;
    if (!clientId) throw new Error("name the console's app registration with the company's sign-in (its client id)");
    if (input.clientSecret) writeSecretJson(this.node.home, this.consoleFile, { clientSecret: input.clientSecret });
    this.node.config = { ...this.node.config, console: { port: input.port ?? this.node.config.console?.port ?? 7730, clientId, ...((input.url ?? this.node.config.console?.url) ? { url: input.url ?? this.node.config.console?.url } : {}) } };
    saveConfig(this.node.home, this.node.config);
    await this.startConsole();
    return { ...(await this.consoleInfo()), operatorLink: this.console!.operatorLink() };
  }

  /**
   * A backup of this home (stage 14): its files, and a consistent copy of its database, into an empty folder.
   * With the home key in the company's key service it opens only with access to it; otherwise the backup
   * carries what opens it (a file keystore) or opens only on this computer (DPAPI, Keychain): the result says.
   */
  async backup(input: { to: string }): Promise<{ to: string; files: number; bytes: number; keystore: Keystore; note?: string }> {
    const to = resolvePath(input.to);
    if (existsSync(to) && readdirSync(to).length) throw new Error(`${to} isn't empty`);
    mkdirSync(to, { recursive: true });
    let files = 0;
    let bytes = 0;
    const skip = new Set(['weave.db', 'weave.db-wal', 'weave.db-shm', 'node.lock', 'daemon.json']);
    const copy = (from: string, into: string) => {
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (skip.has(entry.name) && from === this.node.home.dir) continue;
        const source = joinPath(from, entry.name);
        const target = joinPath(into, entry.name);
        if (entry.isDirectory()) {
          mkdirSync(target, { recursive: true });
          copy(source, target);
        } else {
          cpSync(source, target);
          files++;
          bytes += statSync(source).size;
        }
      }
    };
    copy(this.node.home.dir, to);
    if (this.core.sqlite) {
      this.core.sqlite.snapshot(joinPath(to, 'weave.db'));
      files++;
      bytes += statSync(joinPath(to, 'weave.db')).size;
    }
    const keystore = vaultOf(this.node.home).keystore;
    const note =
      keystore === 'kms'
        ? undefined
        : keystore === 'file'
          ? "this backup carries the key that opens it (vault.json): keep it as safe as the server, or move the home key to the company's key service"
          : `this backup opens only on this computer, as this user (${keystore})`;
    return { to, files, bytes, keystore, ...(note ? { note } : {}) };
  }

  /** Where this computer can keep the home key (stage 17). */
  async keystores(): Promise<Array<{ keystore: Keystore; name: string; ready: boolean; why?: string; current: boolean }>> {
    const current = vaultOf(this.node.home).keystore;
    const here = keystoresHere();
    if (!here.some((k) => k.keystore === current)) here.unshift({ keystore: current, name: current, ready: true });
    return here.map((k) => ({ ...k, current: k.keystore === current }));
  }

  /** Keep the home key somewhere else (stage 17): the same key, so nothing else changes. */
  async moveHomeKey(input: { to: 'os' | Exclude<Keystore, 'kms'> }): Promise<{ from: Keystore; to: Keystore }> {
    return moveHomeKey(this.node.home, input.to);
  }

  async consoleOperatorLink(): Promise<string> {
    if (!this.console) throw new Error('the admin console is off (weave company console on)');
    return this.console.operatorLink();
  }

  async consoleInfo(): Promise<ConsoleInfo> {
    return { on: !!this.console, ...(this.console ? { url: this.console.url, port: this.console.port } : {}), ...(this.node.config.console?.clientId ? { clientId: this.node.config.console.clientId } : {}) };
  }

  async startConsole(): Promise<void> {
    await this.console?.close();
    const c = this.node.config.console!;
    const secret = readSecretJson<{ clientSecret?: string }>(this.node.home, this.consoleFile)?.clientSecret;
    this.console = await startConsole(this.node, { port: c.port, ...(c.url ? { url: c.url } : {}), issuer: this.node.config.attestor!.issuer, clientId: c.clientId!, ...(secret ? { clientSecret: secret } : {}) });
  }

  /** Is the person behind this company sign-in one of the company's admins (by the directory's groups when SCIM is on)? */
  consoleAdmin(claims: { sub: string; email?: string; groups: string[] }): boolean {
    return this.consoleRole(claims) === 'admin';
  }

  /**
   * What the person behind this company sign-in may do in the console (stage 15), by their sign-in groups
   * (the directory's when SCIM is on): admins everything, auditors read everything, the helpdesk sets people up.
   */
  /** Signing nothing: a standby, or a server a newer one took over from. */
  refuseWrites(): void {
    const refuse = () => {
      throw new Error('this is a standby server: it follows the active one and writes nothing (weave-server promote, once the active one is gone)');
    };
    this.node.replica.write = refuse;
    this.node.replica.append = refuse;
    this.node.replica.append2 = refuse;
  }

  /** A server of this identity of a newer generation than ours: we stand down, as a standby. */
  seeGeneration(event: { body: Json }): void {
    const generation = (event.body as { generation?: unknown } | null)?.generation;
    if (!Number.isSafeInteger(generation) || (generation as number) <= (this.node.config.generation ?? 0) || this.node.config.standby) return;
    this.node.config = { ...this.node.config, standby: true };
    saveConfig(this.node.home, { ...loadConfig(this.node.home), standby: true });
    this.refuseWrites();
    console.warn(`weave: a newer server of this identity took over (generation ${generation}): this one is a standby now and writes nothing`);
  }

  /** Is this person (name or did) one of the company's admins, or the company itself? */
  isCompanyAdmin(who: string): boolean {
    const here = this.companyHere();
    if (!here) return false;
    return this.isOrgAdmin(here.group, here.org, this.node.resolve(who));
  }

  consoleRole(claims: { sub: string; email?: string; groups: string[] }): ConsoleRole | undefined {
    const group = this.companyGroups()[0];
    const org = group ? this.orgOf(group) : undefined;
    if (!org) return undefined;
    let groups = claims.groups;
    if (this.node.config.scim) {
      const directory = this.scimDirectory();
      const { user, deleted } = findPerson(directory, { subject: claims.sub, email: claims.email });
      if (deleted || (user && !user.active)) return undefined;
      if (user) groups = groupsOf(directory, user.id);
    }
    if (org.admins && groups.includes(org.admins)) return 'admin';
    if (org.auditors && groups.includes(org.auditors)) return 'auditor';
    if (org.helpdesk && groups.includes(org.helpdesk)) return 'helpdesk';
    return undefined;
  }

  /**
   * The agents of the company's people, and in which of its projects and groups each may act (stage 15).
   * Agents act in a company space only once whoever manages it approves them: on the company's node, the company.
   */
  async companyAgents(): Promise<CompanyAgentInfo[]> {
    const group = this.companyGroups()[0];
    if (!group) throw new Error('not a company node');
    const spaces = [group, ...this.companySpaces(group)];
    const people = new Set<Did>();
    for (const space of spaces) for (const did of this.core.state(space).members.keys()) people.add(did);
    const out: CompanyAgentInfo[] = [];
    for (const person of people) {
      for (const grant of this.node.replica.authority.grantsOf(person)) {
        if (grant.role !== 'agent') continue;
        out.push({
          did: grant.subject,
          name: grant.name ?? 'agent',
          person,
          ...(this.node.nameOf(person) ? { personName: this.node.nameOf(person) } : {}),
          spaces: spaces.filter((s) => this.core.state(s).members.has(person)).map((s) => ({ id: s.id, name: s.name, approved: !!this.core.state(s).approvedAgents?.has(grant.subject) })),
        });
      }
    }
    return out.sort((a, b) => `${a.personName ?? a.person}/${a.name}`.localeCompare(`${b.personName ?? b.person}/${b.name}`));
  }

  /**
   * Each person's company computer as the company last saw it (stage 15): the certificate their sign-in came with,
   * until when it's valid, or why a sign-in wasn't vouched for (no certificate, another authority, expired).
   */
  async companyDevices(): Promise<CompanyDeviceInfo[]> {
    const group = this.companyGroups()[0];
    if (!group) throw new Error('not a company node');
    const required = !!this.orgOf(group)?.deviceCA;
    const attested = this.attestations(group, group.founder);
    const now = new Date(this.node.clock()).toISOString();
    return [...this.core.state(group).members.keys()]
      .filter((did) => did !== group.founder)
      .map((did) => {
        const a = attested.get(did);
        const refused = this.deviceRefused.get(did) ?? this.signInRefused.get(did);
        return {
          did,
          ...(this.node.nameOf(did) ? { name: this.node.nameOf(did) } : {}),
          required,
          ...(a?.device ? { device: a.device } : {}),
          ...(a ? { vouchedUntil: a.until, vouched: a.until > now } : { vouched: false }),
          ...(refused && (!a || refused.time > a.time) ? { problem: refused.problem, problemTime: refused.time } : {}),
        };
      });
  }

  /** Record what an admin did in the console, in the company's audit. */
  async consoleRecord(what: Record<string, string>, admin: { subject: string; email?: string; role?: string }): Promise<void> {
    const group = this.companyGroups()[0];
    if (!group) throw new Error('not a company node');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_ORG_CONSOLE, body: { subject: admin.subject, ...(admin.email ? { email: admin.email } : {}), ...(admin.role ? { role: admin.role } : {}), ...what } }));
  }

  /** An admin in the console: the company does it, recorded with who asked. */
  async consoleAction(action: CompanyAction, admin: { subject: string; email?: string; role?: string }): Promise<CompanyInfo> {
    const group = this.companyGroups()[0];
    if (!group) throw new Error('not a company node');
    const what: Record<string, string> = { action: action.action };
    for (const key of ['space', 'person', 'group', 'name', 'kind'] as const) {
      const value = (action as Record<string, unknown>)[key];
      if (typeof value === 'string') what[key] = value;
    }
    await this.consoleRecord(what, admin);
    await this.orgDo(group, action);
    return (await this.company())!;
  }

  async startScim(): Promise<void> {
    await this.scimServer?.close();
    this.scimServer = await startScimServer(this.node.config.scim!.port, (req, auth) => this.scimRequest(req, auth));
  }

  /** One request from the company's user management. Changes take effect at once. */
  async scimRequest(req: ScimRequest, authorization: string | undefined): Promise<ScimResponse> {
    const run = this.scimWork.then(async () => {
      const directory = this.scimDirectory();
      if (!tokenMatches(directory, authorization)) return { status: 401, body: { schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '401', detail: 'wrong or missing bearer token' } };
      const response = scimHandle(directory, req);
      if (response.changed) {
        writeSecretJson(this.node.home, this.scimFile, directory);
        await this.applyDirectory();
      }
      // Someone new in the user management gets their invitation by email, if the company wants that.
      const created = response.status === 201 && req.path.startsWith('/Users') ? (response.body as { active?: boolean; userName?: string; emails?: Array<{ value: string }> }) : undefined;
      const email = created?.active === false ? undefined : (created?.emails?.[0]?.value ?? (created?.userName?.includes('@') ? created.userName : undefined));
      if (email && this.node.config.scim?.invite)
        void this.inviteByEmail({ to: email })
          .then(() => this.consoleRecord({ action: 'invite', email }, { subject: 'scim' }))
          .catch((error: Error) => console.error(`weave: the invitation to ${email} wasn't sent: ${error.message}`));
      return response;
    });
    this.scimWork = run.catch(() => undefined);
    return run;
  }

  /**
   * The directory as it stands, applied to everyone the company vouches for:
   * deactivated or deleted people aren't vouched for any more (and are removed
   * from the company's spaces at once; deleted company-owned identities are
   * frozen); everyone else gets the directory's groups. People the directory
   * doesn't know yet are left as they are.
   */
  async applyDirectory(): Promise<number> {
    if (!this.node.config.scim) return 0;
    const directory = this.scimDirectory();
    const now = new Date(this.node.clock()).toISOString();
    let changed = 0;
    for (const group of this.companyGroups()) {
      for (const [did, a] of this.attestations(group, this.node.identity.author)) {
        if (a.until <= now) continue;
        const found = findPerson(directory, { subject: a.subject, email: a.email });
        const vouch = (groups: string[], until: string) =>
          this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_ATTEST, body: { did, subject: a.subject, ...(a.email ? { email: a.email } : {}), groups, until } }));
        if (found.deleted || (found.user && !found.user.active)) {
          vouch(a.groups, now);
          if (found.deleted && this.node.replica.authority.keys(did).org === this.node.identity.author && !this.node.replica.authority.frozen(did)) await this.freeze(did);
          changed++;
        } else if (found.user) {
          const groups = groupsOf(directory, found.user.id);
          if (groups.join('\n') !== [...a.groups].sort().join('\n')) {
            vouch(groups, a.until);
            changed++;
          }
        }
      }
    }
    if (changed) {
      await this.offboard();
      await this.orgDuties();
    }
    return changed;
  }

  // ---------------------------------------------------------------- SSO (stage 6.3)

  async signIn(input: { space: string; idToken: string; salt?: string }): Promise<void> {
    const space = this.core.space(input.space);
    const setting = this.core.state(space).managed;
    if (!setting?.attestor) throw new Error(`${space.name} has no company sign-in`);
    const sso = this.sso();
    // A token keeps its salt (a refreshed one too, while the company's sign-in keeps its nonce).
    const salt = input.salt ?? sso?.salt;
    // Kept for the key service too (Vault's JWT auth), sealed at rest.
    this.saveSso({ ...(sso ?? {}), idToken: input.idToken, salt, expires: (claimsOf(input.idToken).exp ?? 0) * 1000 });
    await this.core.managed.unlock(space);
    const device = this.deviceProof(input.idToken);
    // Who hands it in, and the salt that ties the token to them (0siqvEzB).
    const box = boxTo(this.core.encryptionKeyOf(setting.attestor), { idToken: input.idToken, did: this.node.identity.author, ...(salt ? { salt } : {}), ...(device ? { device: device as unknown as Json } : {}) });
    // A sign-in is what lets the company's key service open its half to us, so it can't wait for it: boxed to the attestor, it goes under the newest key at hand.
    const cipher = await this.core.managed.cipherReady(space);
    const athand = { ...cipher, keys: Object.fromEntries(Object.entries(cipher.keys).filter(([, key]) => key)) };
    this.node.replica.write(this.node.identity, sealFor(athand, { kind: KIND_SIGNIN, body: { box: box as unknown as Json } }));
  }

  /** Who the attestor vouches for in a space: did → their latest attestation, while it holds or not. */
  /** Sign-ins the company didn't vouch for because of the computer they came from (stage 15): person → why, and when. */
  deviceRefused = new Map<Did, { problem: string; time: string }>();
  /** Sign-ins the company didn't vouch for because they weren't the identity's own (0siqvEzB): person → why, and when. */
  signInRefused = new Map<Did, { problem: string; time: string }>();

  attestations(space: StoredSpace, attestor: Did): Map<Did, { subject: string; email?: string; groups: string[]; until: string; time: string; device?: { subject: string; serial: string; validTo?: string } }> {
    const out = new Map<Did, { subject: string; email?: string; groups: string[]; until: string; time: string; device?: { subject: string; serial: string; validTo?: string } }>();
    // A company space's people are vouched for in the company group (stage 10).
    const company = this.core.managed.managedRaw(space).setting?.company;
    for (const d of this.core.decodedIn(company && this.core.spaces.has(company) ? company : space.id)) {
      if (d.inner.kind !== KIND_ATTEST || d.event.author !== attestor) continue;
      const b = d.inner.body as { did?: unknown; subject?: unknown; email?: unknown; groups?: unknown; until?: unknown; device?: { subject?: unknown; serial?: unknown; validTo?: unknown } } | null;
      if (!isDid(b?.did) || typeof b?.subject !== 'string' || typeof b?.until !== 'string') continue;
      out.set(b.did, { subject: b.subject, ...(typeof b.email === 'string' ? { email: b.email } : {}), groups: Array.isArray(b.groups) ? b.groups.filter((g): g is string => typeof g === 'string') : [], until: b.until, time: d.event.time, ...(typeof b.device?.subject === 'string' && typeof b.device.serial === 'string' ? { device: { subject: b.device.subject, serial: b.device.serial, ...(typeof b.device.validTo === 'string' ? { validTo: b.device.validTo } : {}) } } : {}) });
    }
    return out;
  }

  /** As a company's attestor: check new sign-ins with the OIDC provider and vouch for those that hold. */
  async attest(): Promise<number> {
    const config = this.node.config.attestor;
    if (!config) return 0;
    let made = 0;
    for (const space of [...this.core.spaces.values()]) {
      const setting = this.core.state(space).managed;
      if (setting?.attestor !== this.node.identity.author) continue;
      const attested = this.attestations(space, this.node.identity.author);
      for (const d of this.core.decodedIn(space.id)) {
        if (d.inner.kind !== KIND_SIGNIN || (attested.get(d.event.author)?.time ?? '') >= d.event.time) continue;
        const box = (d.inner.body as { box?: unknown } | null)?.box;
        const opened = box ? this.core.tryOpen((me) => openBox(me.keys.secretKey, me.keys.publicKey, box as unknown as Box) as { idToken?: unknown }) : undefined;
        if (typeof opened?.idToken !== 'string') continue;
        const claims = await verifyIdToken(opened.idToken, config.issuer, config.audience).catch(() => undefined);
        if (!claims) continue;
        // The sign-in must be this identity's own (0siqvEzB): colleagues read the sealed sign-ins and could copy a box, and
        // whoever sees a token (the key service takes it too) could hand it in as theirs. The token's nonce names the
        // identity it was asked for; one without (a refreshed token) only renews who it vouched for already.
        const handedIn = opened as { did?: unknown; salt?: unknown };
        const salt = typeof handedIn.salt === 'string' ? handedIn.salt : undefined;
        const bound = !!salt && claims.nonce === signInNonce(d.event.author, salt);
        const renews = attested.get(d.event.author)?.subject === claims.sub;
        const now = new Date(this.node.clock()).toISOString();
        const taken = [...attested].some(([did, a]) => did !== d.event.author && a.subject === claims.sub && a.until > now);
        const problem =
          handedIn.did !== d.event.author ? 'this sign-in was handed in by someone else'
          : salt && claims.nonce !== undefined && !bound ? 'this sign-in was made for another identity'
          : !bound && !renews ? "this sign-in isn't tied to this identity: sign in from Weave on this computer"
          : taken ? `${claims.email ?? claims.sub} is vouched for as another identity: that one has to lapse or be removed first`
          : undefined;
        if (problem) {
          this.signInRefused.set(d.event.author, { problem, time: d.event.time });
          continue;
        }
        this.signInRefused.delete(d.event.author);
        // With SCIM on, the directory decides: deactivated or unknown people aren't vouched for, and its groups count (stage 12).
        let groups = claims.groups;
        if (this.node.config.scim) {
          const directory = this.scimDirectory();
          // The directory decides for those it knows: deactivated or deleted aren't vouched for; the rest get its groups.
          // Those it doesn't know yet (before the first provisioning) keep their sign-in's groups.
          const { user, deleted } = findPerson(directory, { subject: claims.sub, email: claims.email });
          if (deleted || (user && !user.active)) continue;
          if (user) groups = groupsOf(directory, user.id);
        }
        // With a device authority, only sign-ins from the company's computers.
        const ca = this.orgOf(space)?.deviceCA;
        const checked = ca ? inspectDevice((opened as { device?: unknown }).device, ca, d.event.author, opened.idToken, this.node.clock()) : undefined;
        if (checked && 'problem' in checked) {
          this.deviceRefused.set(d.event.author, { problem: checked.problem, time: d.event.time });
          continue;
        }
        const device = checked?.device;
        this.deviceRefused.delete(d.event.author);
        const until = new Date(this.node.clock() + (config.hours ?? 24) * 3_600_000).toISOString();
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ATTEST, body: { did: d.event.author, subject: claims.sub, ...(claims.email ? { email: claims.email } : {}), groups, until, ...(device ? { device } : {}) } }));
        attested.set(d.event.author, { subject: claims.sub, groups, until, time: new Date().toISOString() });
        made++;
      }
    }
    return made;
  }

  /**
   * In a space with an attestor: people the company no longer vouches for are
   * removed (with a new key), by whoever manages the space. Newcomers get an
   * hour to sign in.
   */
  /**
   * Two people who took each other's role at once (each removal or demotion
   * not naming the other as seen): as the owner, say which came first, by the
   * order this node got them, so every node ends up alike (H7hk7X9S).
   */
  settleLosses(): number {
    let settled = 0;
    for (const space of [...this.core.spaces.values()]) {
      if (space.founder !== this.node.identity.author || this.core.directs.has(space.id)) continue;
      const state = this.core.state(space);
      if (state.founder !== this.node.identity.author) continue;
      for (const pair of state.unsettled ?? []) {
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_SETTLE, body: pair }));
        settled++;
      }
    }
    return settled;
  }

  /**
   * People removed before removals named what they saw (an anchor, see
   * spaces.ts): whoever manages the space anchors them now, once, by what this
   * node holds of them. What they sign past it counts as after their removal.
   */
  anchorRemovals(): number {
    let anchored = 0;
    for (const space of [...this.core.spaces.values()]) {
      if (this.core.directs.has(space.id)) continue;
      const state = this.core.state(space);
      if (!mayAct(state, this.node.identity.author, 'manage').ok || !state.removed.size) continue;
      for (const did of state.removed.keys()) {
        if (state.left.has(did) || state.members.has(did)) continue;
        const signers = this.node.replica.signers().filter((s) => this.node.replica.authority.personOf(s) === did);
        if (!signers.length || signers.every((s) => state.cutoffs?.some((c) => c.signer === s && c.c !== undefined))) continue;
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_REMOVE, body: { member: did, upTo: this.core.upTo(did), at: this.core.anchor(did, space) } }));
        anchored++;
      }
    }
    return anchored;
  }

  async offboard(): Promise<number> {
    let removed = 0;
    const now = new Date(this.node.clock()).toISOString();
    const hourAgo = new Date(this.node.clock() - 3_600_000).toISOString();
    for (const space of [...this.core.spaces.values()]) {
      const state = this.core.state(space);
      const attestor = state.managed?.attestor;
      if (!attestor || !mayAct(state, this.node.identity.author, 'manage').ok) continue;
      const attested = this.attestations(space, attestor);
      for (const [did, member] of state.members) {
        if (did === state.founder || did === attestor || did === this.node.identity.author) continue;
        // Newcomers get an hour to sign in; someone the company stopped vouching for goes at once.
        const attestation = attested.get(did);
        if (attestation ? attestation.until > now : member.since > hourAgo) continue;
        await this.node.removeMember(space.id, did);
        removed++;
      }
    }
    return removed;
  }

  async manageSpace(input: { space: string; provider: ProviderSpec; ttlMinutes?: number; graceHours?: number; attestor?: string; company?: string }): Promise<SpaceInfo> {
    const space = this.core.space(input.space);
    const state = this.core.state(space);
    if (space.kind === 'direct') throw new Error('a direct chat belongs to two people, not a company');
    if (!mayAct(state, this.node.identity.author, 'own').ok) throw new Error(`only the owner of ${space.name} puts its keys under a company's key service`);
    const setting: ManagedSetting = { provider: input.provider as unknown as Json, ttlMinutes: input.ttlMinutes ?? 15, graceHours: input.graceHours ?? 8, by: this.node.identity.author, time: new Date().toISOString() };
    // Check the provider works before anything depends on it.
    const probe = new Uint8Array(randomBytes(32));
    const back = await this.core.managed.provider(setting).unwrap(await this.core.managed.provider(setting).wrap(probe, { space: spaceScope(space), epoch: -1 }), { space: spaceScope(space), epoch: -1 });
    if (b64u.encode(back) !== b64u.encode(probe)) throw new Error('the key service gave back something else');
    const attestor = input.attestor ? this.node.resolve(input.attestor) : undefined;
    this.node.replica.write(this.node.identity, sealFor(space, { kind: KIND_MANAGED, body: { provider: setting.provider, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, ...(attestor ? { attestor } : {}), ...(input.company ? { company: input.company } : {}), from: currentEpoch(space) + 1 } }));
    // From the next key on, half of it is the company's.
    this.core.rotateKey(space);
    return this.core.spaceInfo(space);
  }

  async unlockSpace(ref: string): Promise<SpaceInfo> {
    const space = this.core.space(ref);
    await this.core.managed.unlock(space);
    const problem = this.core.managed.managedProblems.get(space.id);
    if (problem) throw new Error(problem);
    return this.core.spaceInfo(space);
  }

  async destroyCompanyKey(ref: string): Promise<void> {
    const space = this.core.space(ref);
    const state = this.core.state(space);
    if (!state.managed) throw new Error(`${space.name} isn't under a company's key service`);
    if (!mayAct(state, this.node.identity.author, 'own').ok) throw new Error(`only the owner of ${space.name} destroys its company key`);
    if (this.core.held(state)) throw new Error(`${space.name} is on legal hold until ${state.hold!.until.slice(0, 10)}: its company key stays`);
    await this.core.managed.provider(state.managed).destroy();
    for (const id of [...this.core.managed.managedKeys.keys()]) if (id.startsWith(`${space.id}:`)) this.core.managed.managedKeys.delete(id);
    const cache = this.core.managed.graceCache();
    for (const id of Object.keys(cache)) if (id.startsWith(`${space.id}:`)) delete cache[id];
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'managed-keys.json'), cache);
    this.core.invalidateDecoded();
  }

  managedInfo(space: StoredSpace, setting: ManagedSetting): NonNullable<SpaceInfo['managed']> {
    const spec = setting.provider as unknown as ProviderSpec;
    const current = this.core.managed.cipher(space).keys[String(currentEpoch(space))] !== undefined;
    const problem = this.core.managed.managedProblems.get(space.id);
    return {
      agents: [...(this.core.state(space).approvedAgents ?? [])].map((did) => {
        const grant = this.node.replica.authority.grant(did);
        return grant ? `${this.node.nameOf(grant.author) ?? grant.author}/${grant.name ?? did.slice(8, 16)}` : did;
      }),
      provider: spec.kind === 'vault' ? `Vault at ${spec.address} (${spec.key})` : spec.kind === 'azure' ? `Azure Key Vault ${spec.vault} (${spec.key})` : spec.kind === 'aws' || spec.kind === 'gcp' ? providerFor(spec, this.node.home, {}).describe().keyRef : spec.kind,
      unlocked: current,
      ttlMinutes: setting.ttlMinutes,
      graceHours: setting.graceHours,
      ...(setting.attestor ? { attestor: setting.attestor } : {}),
      ...(problem ? { problem } : {}),
    };
  }
}
