import { type AccountClaim, type Did, type Entry, type Inner, type Json, KIND_ACCOUNT, KIND_BLOCK, KIND_CONTACT, KIND_FOLLOW, KIND_IMPRINT, KIND_MUTE, type SpaceState, TEXT_LIMITS, accountClaimsOf, accountProofText, b64u, decodeContact, edgeBody, encodeContact, followersOf, friendsOf, imprintOf, isDid, isPlatform, parseBlobRef, personKeyOf, personTargetOf, personUrl, randomBytes, rank, sealFor, tooLong } from '@weave/core';
import { type AvatarFigure, KIND_AVATAR, sanitizeFigure } from './avatar.ts';
import { type AccountInfo, type EdgeInput, type Found, type FoundKind, type ImprintInfo, type MyAccountInfo, PROJECT_STATUSES, type Person, type Profile, type ProfileInput, type ProjectStatus, type PublicProject, type Social } from './backend.ts';
import type { DeviceOAuth, startDeviceSignIn } from './devicecode.ts';
import type { StoredSpace } from './spacestore.ts';
import { KIND_THEME, type Theme, sanitizeTheme } from './theme.ts';
import type { PlatformInfo } from './verifiers.ts';
import type { Access, EventFields, Invite, SessionStamp, SpaceKind, WeaveRecord } from '@weave/core';
import { socialGraph } from '@weave/core';
import type { Actor, PostInfo } from './backend.ts';
import type { AgentKey } from './keystore.ts';
import type { Companies } from './companies.ts';
import type { ManagedKeys } from './managed.ts';
import type { Verifiers } from './verifiers.ts';
import type { Decoded, WeaveNode } from './node.ts';
import { meetTopic, meetSecretOf, KIND_PROFILE, KIND_PUBLIC_PROJECT } from './shared.ts';
/*
 * People: profiles, names and how a reference resolves to a person, the
 * social graph (follows, blocks, mutes, friends), avatars and themes, the
 * imprint, and accounts elsewhere with their proofs. It sees the node's
 * internals only through PeopleCore; the node delegates the Backend methods
 * to it.
 */

const EDGE_KIND: Record<EdgeInput['edge'], string> = { follow: KIND_FOLLOW, block: KIND_BLOCK, mute: KIND_MUTE };

/** What People needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface PeopleCore {
  access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access;
  actor(author: Did, signer: Did, session?: SessionStamp): Actor;
  adoptBootstrap(entry: Invite['entry']): void;
  agentMay(name: string, kind: string): void;
  readonly agents: AgentKey[];
  allPosts(): PostInfo[];
  readonly companies: Companies;
  readonly contactCache: { from: number; map: Map<Did, string | undefined> } | undefined;
  setContactCache(value: { from: number; map: Map<Did, string | undefined> }): void;
  decodeAll(): Decoded[];
  decodedIn(spaceId: string): Decoded[];
  /** Signing in to a platform with a device code, in the browser (a loopback server: the host's). */
  readonly deviceSignIn: typeof startDeviceSignIn;
  /** Bumped whenever the decoded views change: caches keyed on it go stale. */
  readonly decodedRevision: number;
  direct(peer: Did): StoredSpace;
  doorSecret(): Uint8Array;
  entries(space: StoredSpace): Entry[];
  entryPoint(): Invite['entry'];
  eventsOf(person: Did): WeaveRecord[];
  graph(): ReturnType<typeof socialGraph>;
  readonly managed: ManagedKeys;
  projectPost(project: StoredSpace): PostInfo | undefined;
  sealForSelf(inner: Inner): EventFields;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
  readonly verifiers: Verifiers;
}

export class People {
  private readonly node: WeaveNode;
  private readonly core: PeopleCore;

  constructor(node: WeaveNode, core: PeopleCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- accounts elsewhere

  /**
   * Who reads a space: its members, or in a project the readers of one of its boards (everyone, for a board nobody
   * limited).
   */
  /** The platforms accounts can be proven on here (a verifier checks each), and how. */
  async platforms(): Promise<PlatformInfo[]> {
    return this.core.verifiers.platforms();
  }

  /** What a proof of an account must hold (your Weave id), and how to make one on that platform. */
  async accountProof(input: { platform: string }): Promise<{ text: string; howto?: string }> {
    const p = this.core.verifiers.platforms().find((x) => x.platform === input.platform);
    if (!p) throw new Error(`nothing here checks accounts on ${input.platform}${this.core.verifiers.platforms().length ? ` (only on ${this.core.verifiers.platforms().map((x) => x.platform).join(', ')})` : ''}`);
    return { text: accountProofText(this.node.identity.author), ...(p.howto ? { howto: p.howto } : {}) };
  }

  /**
   * Say an account elsewhere is yours, with its proof (or take it back, on: false): on your hub for everyone, or in a
   * space for its members (whose services may give access by it). Checked here first, by its platform's verifier.
   */
  async linkAccount(input: { platform: string; handle?: string; proof?: string; space?: string; on?: boolean; as?: string }): Promise<AccountInfo[]> {
    if (input.as) this.core.agentMay(input.as, KIND_ACCOUNT);
    const space = input.space ? this.core.space(input.space) : undefined;
    if (space && (space.kind === 'direct' || !this.core.state(space).members.has(this.node.identity.author))) throw new Error(`you are not a member of ${space.name}`);
    if (!isPlatform(input.platform)) throw new Error('a platform: lowercase letters, digits and dashes, like github');
    let body: Json = { platform: input.platform, on: false };
    if (input.on !== false) {
      const handle = input.handle?.trim().replace(/^@/, '');
      const proof = input.proof?.trim();
      if (!handle || !proof) throw new Error(`your account on ${input.platform}, and where its proof is (weave account proof ${input.platform})`);
      const claim = { platform: input.platform, handle, proof };
      const ok = await this.core.verifiers.verify(claim, this.node.identity.author);
      if (ok === undefined) throw new Error(this.core.verifiers.platforms().some((p) => p.platform === input.platform) ? `${input.platform} can't be asked right now: try again in a moment` : `nothing here checks accounts on ${input.platform}`);
      if (!ok) throw new Error(`that proof doesn't hold: it has to be ${handle}'s, on ${input.platform}, and hold "${accountProofText(this.node.identity.author)}"`);
      body = { ...claim, on: true };
    }
    if (space) await this.node.publish({ kind: KIND_ACCOUNT, body, space: space.id, as: input.as });
    else this.node.replica.write(this.node.identity, { kind: KIND_ACCOUNT, body });
    return this.accounts({ ...(space ? { space: space.id } : {}) });
  }

  /** Proofs its verifier makes, under way: each waits for its sign-in with a code. */
  #proving = new Map<string, Promise<AccountInfo[]>>();

  /**
   * Prove an account elsewhere in one go: a sign-in with a code there (its verifier's), used once for the verifier to
   * make the proof (a secret gist naming you, on GitHub), then forgotten; the account is then yours on your hub, or in
   * a space. finishAccountProof waits for it.
   */
  async startAccountProof(input: { platform: string; space?: string }): Promise<{ id: string; url: string; code: string }> {
    const oauth = this.core.verifiers.prover(input.platform);
    if (!oauth?.device) throw new Error(`${input.platform}'s verifier can't make a proof itself: make one by hand (weave account proof ${input.platform})`);
    if (input.space) this.core.space(input.space);
    const started = await this.core.deviceSignIn(oauth as DeviceOAuth, this.node.oauthSetup.fetch, input.platform);
    const id = b64u.encode(randomBytes(12));
    const done = started.grant
      .then((grant) => this.core.verifiers.prove(input.platform, grant.access, this.node.identity.author))
      .then(({ handle, proof }) => this.linkAccount({ platform: input.platform, handle, proof, ...(input.space ? { space: input.space } : {}) }))
      .finally(() => setTimeout(() => this.#proving.delete(id), 60_000).unref());
    done.catch(() => {});
    this.#proving.set(id, done);
    return { id, url: started.url, code: started.code };
  }

  async finishAccountProof(input: { id: string }): Promise<AccountInfo[]> {
    const proving = this.#proving.get(input.id);
    if (!proving) throw new Error('no proof under way with that id');
    return proving;
  }

  /** Accounts elsewhere people said are theirs: on their hubs (who), or in a space; each checked by its platform's verifier. */
  async accounts(input: { space?: string; who?: string } = {}): Promise<AccountInfo[]> {
    // On hubs: public events, signed by the person. In a space: sealed for its members.
    const claims = input.space ? accountClaimsOf(this.core.entries(this.core.space(input.space))) : accountClaimsOf(this.node.replica.events((e) => e.kind === KIND_ACCOUNT).map((e) => ({ kind: e.kind, body: e.body as Json, event: { author: e.author, time: e.time } })));
    const only = input.who ? this.resolve(input.who) : undefined;
    // Each checked by its verifier, all at once (known ones aren't asked again for an hour).
    const all = [...claims].filter(([did]) => !only || did === only).flatMap(([did, mine]) => [...mine.values()].map((claim) => ({ did, claim })));
    return Promise.all(
      all.map(async ({ did, claim }): Promise<AccountInfo> => {
        const verified = await this.core.verifiers.verify(claim, did);
        const page = this.core.verifiers.page(claim);
        return { who: this.core.actor(did, did), platform: claim.platform, handle: claim.handle, proof: claim.proof, ...(page ? { url: page } : {}), ...(verified !== undefined ? { verified } : {}) };
      }),
    );
  }

  async myAccounts(): Promise<MyAccountInfo[]> {
    const me = this.node.identity.author;
    const byAccount = new Map<string, MyAccountInfo>();
    const said = (claim: AccountClaim | undefined, where: { hub: true } | { space: StoredSpace }) => {
      if (!claim) return;
      const key = JSON.stringify([claim.platform, claim.handle.toLowerCase(), claim.proof]);
      const page = this.core.verifiers.page(claim);
      const a = byAccount.get(key) ?? { ...claim, ...(page ? { url: page } : {}), hub: false, spaces: [] };
      if ('hub' in where) a.hub = true;
      else a.spaces.push({ id: where.space.id, kind: where.space.kind, name: where.space.name });
      byAccount.set(key, a);
    };
    for (const claim of accountClaimsOf(this.node.replica.events((e) => e.kind === KIND_ACCOUNT && e.author === me).map((e) => ({ kind: e.kind, body: e.body as Json, event: { author: e.author, time: e.time } }))).get(me)?.values() ?? []) said(claim, { hub: true });
    for (const space of this.core.spaces.values()) {
      if (space.kind === 'direct' || !this.core.state(space).members.has(me)) continue;
      for (const claim of accountClaimsOf(this.core.entries(space)).get(me)?.values() ?? []) said(claim, { space });
    }
    return Promise.all(
      [...byAccount.values()].map(async (a) => {
        const verified = await this.core.verifiers.verify(a, me);
        return { ...a, ...(verified !== undefined ? { verified } : {}) };
      }),
    );
  }

  // ---------------------------------------------------------------- people

  async setEdge(input: EdgeInput): Promise<void> {
    const subject = this.resolve(input.who);
    if (subject === this.node.identity.author) throw new Error('that is you');
    const inner: Inner = { kind: EDGE_KIND[input.edge], body: edgeBody(subject, input.on) };
    const isPrivate = input.private ?? input.edge !== 'follow';
    this.node.replica.write(this.node.identity, isPrivate ? this.core.sealForSelf(inner) : inner);
    // A follow they were told of in our direct chat ends there too, or they'd still count us as a friend.
    if (input.edge === 'follow' && !input.on && this.#toldFollow(subject)) this.#tellFollow(subject, false);
  }

  /** Whether we told someone in our direct chat that we follow them (or since, that we don't). */
  #toldFollow(peer: Did): boolean {
    if (!this.#keysHere(peer)) return false;
    const direct = this.core.direct(peer);
    return this.core.decodedIn(direct.id).some((d) => d.event.author === this.node.identity.author && d.inner.kind === KIND_FOLLOW && (d.inner.body as { subject?: unknown } | null)?.subject === peer);
  }

  /** Their log is here, with their encryption keys: before it, our direct chat's key would be made from their DID alone. */
  #keysHere(peer: Did): boolean {
    return this.core.eventsOf(peer).length > 0;
  }

  /** Follow someone where only the two of us read it: sealed in our direct chat. Friends without a public follow. */
  #tellFollow(peer: Did, on: boolean): void {
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(this.core.direct(peer)), { kind: KIND_FOLLOW, body: edgeBody(peer, on) }));
  }

  /**
   * Contacts we follow, told so in our direct chat once their keys are here (adding a contact may come before
   * their log does). Returns how many were told.
   */
  tellContacts(): number {
    const following = this.core.graph().get(this.node.identity.author)?.following;
    let told = 0;
    for (const did of this.contacts().keys()) {
      if (!following?.has(did) || !this.#keysHere(did) || this.#toldFollow(did)) continue;
      this.#tellFollow(did, true);
      told++;
    }
    return told;
  }

  async social(): Promise<Social> {
    const graph = this.core.graph();
    const me = this.node.identity.author;
    const mine = graph.get(me);
    const people = (dids: Iterable<Did>): Person[] => [...dids].map((did) => ({ did, name: this.nameOf(did) }));
    return {
      following: people(mine?.following ?? []),
      followers: people(followersOf(graph, me)),
      friends: people(friendsOf(graph, me)),
      blocked: people(mine?.blocked ?? []),
      muted: people(mine?.muted ?? []),
    };
  }

  async profile(who?: string): Promise<Profile> {
    const did = who ? this.resolve(who) : this.node.identity.author;
    // The accounts elsewhere on their hub, those that hold (a false proof isn't shown at all).
    const accounts = (await this.accounts({ who: did })).filter((a) => a.verified !== false).map(({ platform, handle, url, verified }) => ({ platform, handle, ...(url ? { url } : {}), ...(verified ? { verified } : {}) }));
    return { ...this.#profile(did), ...(accounts.length ? { accounts } : {}) };
  }

  #profile(did: Did): Profile {
    const graph = this.core.graph();
    const me = this.node.identity.author;
    const mine = graph.get(me);
    const name = this.nameOf(did);
    return {
      did,
      name,
      url: personUrl(name, did),
      theme: this.themeOf(did),
      ...((figure) => (figure ? { avatar: figure } : {}))(this.avatarOf(did)),
      ...((agents) => (Object.keys(agents).length ? { agentAvatars: agents } : {}))(this.#agentAvatars(did)),
      me: did === me,
      following: mine?.following.has(did) ?? false,
      followsMe: graph.get(did)?.following.has(me) ?? false,
      blocked: mine?.blocked.has(did) ?? false,
      muted: mine?.muted.has(did) ?? false,
      contact: this.contacts().has(did),
      posts: this.node.replica.events((e) => e.author === did && e.kind === 'weave.post').length,
      projects: this.publicProjectsOf(did),
      ...((claim) => (claim && claim.vouched !== false ? { company: { ...this.core.companies.companyOfPerson(did), ...(claim.vouched ? {} : { unconfirmed: true as const }) } } : {}))(this.core.companies.companyClaim(did)),
      links: this.core.companies.linksOf(did).filter((l) => l.state === 'linked'),
    };
  }

  async setProfile(input: ProfileInput): Promise<Profile> {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 40) throw new Error('names are 1 to 40 characters');
      if (name !== this.nameOf(this.node.identity.author)) this.node.replica.write(this.node.identity, { kind: KIND_PROFILE, body: { name } });
    }
    if (input.theme) {
      const theme = sanitizeTheme({ ...this.themeOf(this.node.identity.author), ...input.theme });
      this.node.replica.write(this.node.identity, { kind: KIND_THEME, body: { ...theme } });
    }
    if (input.avatar !== undefined || input.agentAvatars !== undefined) {
      const figure = input.avatar === undefined ? this.avatarOf(this.node.identity.author) : input.avatar === null ? undefined : sanitizeFigure(input.avatar);
      if (input.avatar && !figure) throw new Error('an avatar is parts with whole numbers, like { "hair": 3 }');
      // Your agents' figures: by their name, null takes one back (it shows as its default again).
      const agents = { ...this.#agentAvatars(this.node.identity.author) };
      for (const [name, f] of Object.entries(input.agentAvatars ?? {})) {
        if (!this.core.agents.some((a) => a.name === name)) throw new Error(`you have no agent named ${name}`);
        const clean = f === null ? undefined : sanitizeFigure(f);
        if (f !== null && !clean) throw new Error(`${name}'s avatar is parts with whole numbers, like { "head": 1 }`);
        if (clean) agents[name] = clean;
        else delete agents[name];
      }
      this.node.replica.write(this.node.identity, { kind: KIND_AVATAR, body: { figure: figure ?? null, ...(Object.keys(agents).length ? { agents: agents as unknown as Json } : {}) } });
    }
    return this.profile();
  }

  async imprint(who?: string): Promise<ImprintInfo | null> {
    const did = who ? this.resolve(who) : this.node.identity.author;
    const found = imprintOf(this.core.eventsOf(did));
    return found ? { did, ...found } : null;
  }

  async setImprint(input: { text: string }): Promise<ImprintInfo | null> {
    if (typeof input?.text !== 'string') throw new Error('an imprint is text (Markdown); an empty text takes it back');
    const text = input.text.trim();
    if (text.length > TEXT_LIMITS.imprint) throw tooLong('The imprint', text.length, TEXT_LIMITS.imprint);
    const current = imprintOf(this.core.eventsOf(this.node.identity.author))?.text ?? '';
    if (text !== current) this.node.replica.write(this.node.identity, { kind: KIND_IMPRINT, body: { text } });
    return this.imprint();
  }

  async directory(query?: string): Promise<Profile[]> {
    const authors = new Set([...this.node.replica.events((e) => e.kind === KIND_PROFILE).map((e) => e.author), ...this.contacts().keys()]);
    authors.delete(this.node.identity.author);
    const key = query && personTargetOf(query);
    const q = query?.trim().toLowerCase();
    const profiles = [...authors].map((did) => this.#profile(did));
    return profiles
      .filter((p) => (key ? personKeyOf(p.did).startsWith(key) : !q || (p.name ?? '').toLowerCase().includes(q) || (q.length >= 8 && p.did.toLowerCase().includes(q))))
      .sort((a, b) => (a.name ?? a.did).localeCompare(b.name ?? b.did));
  }

  async find(query: string, limit = 30, only?: FoundKind): Promise<Found[]> {
    const q = query.trim().toLowerCase();
    // How well a name matches: whole name, its start, a word's start, anywhere (lower is better).
    const rank = (text: string | undefined): number => {
      const t = (text ?? '').toLowerCase();
      if (!q) return 3; // after the people you follow
      if (t === q) return 0;
      if (t.startsWith(q)) return 1;
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(t)) return 2;
      return t.includes(q) ? 3 : -1;
    };
    const key = personTargetOf(query) ?? (q.length >= 4 ? query.trim() : undefined);
    const found: Array<{ item: Found; rank: number; order: number; time: string }> = [];
    for (const person of only && only !== 'people' ? [] : await this.directory()) {
      // Without a query, the people you'd most likely mean: friends, then those you follow.
      const r = !q ? (person.following && person.followsMe ? 0 : person.following ? 1 : 2) : key && personKeyOf(person.did).startsWith(key) ? 1 : rank(person.name);
      if (r >= 0) found.push({ item: { person }, rank: r, order: 0, time: '' });
    }
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'project' || (only && only !== 'projects')) continue;
      const post = this.core.projectPost(space);
      const r = post ? rank(post.title) : -1;
      if (post && r >= 0) found.push({ item: { post }, rank: r, order: 1, time: post.active ?? post.time });
    }
    for (const post of only && only !== 'posts' ? [] : this.core.allPosts()) {
      if (post.type === 'project') continue;
      const r = rank(post.title);
      if (r >= 0) found.push({ item: { post }, rank: r, order: 2, time: post.active ?? post.time });
    }
    return found
      .sort((a, b) => a.rank - b.rank || a.order - b.order || b.time.localeCompare(a.time) || (a.item.person?.name ?? '').localeCompare(b.item.person?.name ?? ''))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((f) => f.item);
  }

  /**
   * Your contact link. `door`: through your front door instead, to give to anyone (a website, the app's bundle):
   * whoever adds it reaches only your always-on node, never this computer, and learns only your public side.
   */
  async contactLink(input: { door?: boolean } = {}): Promise<string> {
    const name = this.nameOf(this.node.identity.author);
    const door = this.core.doorSecret();
    const entry = input.door ? { topics: [meetTopic(door)], bootstrap: this.node.config.bootstrap, meet: b64u.encode(door) } : this.core.entryPoint();
    return encodeContact({ v: 1, did: this.node.identity.author, ...(name ? { name } : {}), entry, ...(input.door ? { door: true as const } : {}) });
  }

  async addContact(link: string): Promise<Profile> {
    const contact = decodeContact(link);
    if (contact.did === this.node.identity.author) throw new Error("that's your own contact link");
    this.core.adoptBootstrap(contact.entry);
    // Their meeting point, looked up only (a link from before meeting points names their DID there instead).
    for (const topic of new Set(contact.entry.topics)) await this.node.join(topic);
    const meet = meetSecretOf(contact.entry) && contact.entry.meet;
    // Kept with the contact: holding it is how their node lets us in. A newer link of someone we have brings it.
    if (!this.contacts().has(contact.did) || (meet && !this.core.selfBodies(KIND_CONTACT).some((b) => b.did === contact.did && b.meet === meet))) {
      this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_CONTACT, body: { did: contact.did, name: contact.name ?? null, ...(meet ? { meet } : {}) } }));
    }
    // Not a public follow: whom you know stays between the two of you (sealed to yourself, and in your direct chat
    // once their keys are here).
    if (!(await this.profile(contact.did)).following) await this.setEdge({ edge: 'follow', who: contact.did, on: true, private: true });
    this.tellContacts();
    return this.profile(contact.did);
  }

  /** A space's theme: the latest theme event its author published. */
  /** Someone's avatar: their figure, or none (they show as the figure their key makes). */
  avatarOf(author: Did): AvatarFigure | undefined {
    let body: unknown;
    for (const event of this.core.eventsOf(author)) if (event.kind === KIND_AVATAR) body = event.body;
    return sanitizeFigure((body as { figure?: unknown } | undefined)?.figure);
  }

  /** Someone's agents' avatars, by the agent's name, as they set them. */
  #agentAvatars(author: Did): Record<string, AvatarFigure> {
    let body: unknown;
    for (const event of this.core.eventsOf(author)) if (event.kind === KIND_AVATAR) body = event.body;
    const agents = (body as { agents?: unknown } | undefined)?.agents;
    if (!agents || typeof agents !== 'object' || Array.isArray(agents)) return {};
    const out: Record<string, AvatarFigure> = {};
    for (const [name, f] of Object.entries(agents).slice(0, 50)) {
      const figure = sanitizeFigure(f);
      if (figure && name.length <= 40) out[name] = figure;
    }
    return out;
  }

  /**
   * The avatars of these people (and of their agents, asked for as "did·agent"), those who have one: what the app
   * draws for them.
   */
  async avatars(people: string[]): Promise<Record<string, AvatarFigure>> {
    const out: Record<string, AvatarFigure> = {};
    for (const ref of new Set(people.slice(0, 500))) {
      const at = ref.indexOf('·');
      const figure = at < 0 ? this.avatarOf(ref as Did) : this.#agentAvatars(ref.slice(0, at) as Did)[ref.slice(at + 1)];
      if (figure) out[ref] = figure;
    }
    return out;
  }

  themeOf(author: Did): Theme {
    let theme: unknown;
    for (const event of this.core.eventsOf(author)) if (event.kind === KIND_THEME) theme = event.body;
    return sanitizeTheme(theme);
  }

  /** Projects someone shows publicly: their latest public page per project, unless withdrawn. */
  publicProjectsOf(author: Did): PublicProject[] {
    const latest = new Map<string, { body: Record<string, unknown>; time: string }>();
    for (const event of this.core.eventsOf(author)) {
      const body = event.body as Record<string, unknown> | null;
      if (event.kind === KIND_PUBLIC_PROJECT && typeof body?.project === 'string') latest.set(body.project, { body, time: event.time });
    }
    return [...latest.values()]
      .filter(({ body }) => body.public === true && typeof body.name === 'string')
      .map(({ body, time }) => ({
        id: body.project as string,
        name: body.name as string,
        description: typeof body.description === 'string' ? body.description : '',
        ...(parseBlobRef(body.icon) ? { icon: body.icon as string } : {}),
        status: PROJECT_STATUSES.includes(body.status as ProjectStatus) ? (body.status as ProjectStatus) : 'active',
        time,
      }));
  }

  /** A did:key, a person's address (personUrl), or the name of someone whose profile this node has seen or who is in your address book. */
  resolve(who: string): Did {
    if (isDid(who)) return who;
    const key = personTargetOf(who);
    if (key) {
      const known = new Set([this.node.identity.author, ...this.node.replica.events((e) => e.kind === KIND_PROFILE).map((e) => e.author), ...this.contacts().keys()]);
      const found = [...known].filter((did) => personKeyOf(did).startsWith(key));
      if (found.length === 0) throw new Error(`nobody with that address (${key}) is known here yet`);
      if (found.length > 1) throw new Error(`several people start with ${key} — use their did:key`);
      return found[0];
    }
    const matches = new Set<Did>();
    for (const event of this.node.replica.events((e) => e.kind === KIND_PROFILE)) {
      const name = (event.body as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.toLowerCase() === who.toLowerCase()) matches.add(event.author);
    }
    for (const [did, name] of this.contacts()) if (name?.toLowerCase() === who.toLowerCase()) matches.add(did);
    if (matches.size === 0) throw new Error(`nobody named "${who}" is known yet — use their did:key`);
    if (matches.size > 1) throw new Error(`several people are named "${who}" — use their did:key`);
    return [...matches][0];
  }

  /** Display name for an author: the name in their latest profile, else the one their contact link gave. */
  /** Each person's profile name as last read, and the events it was read from: read again only once they wrote more. */
  readonly #names = new Map<Did, { events: WeaveRecord[]; length: number; name?: string }>();

  nameOf(author: Did): string | undefined {
    const events = this.core.eventsOf(author);
    const kept = this.#names.get(author);
    let name: string | undefined;
    if (kept && kept.events === events && kept.length === events.length) name = kept.name;
    else {
      for (const event of events) {
        const body = event.body as { name?: unknown } | null;
        if (event.kind === KIND_PROFILE && typeof body?.name === 'string') name = body.name;
      }
      this.#names.set(author, { events, length: events.length, ...(name !== undefined ? { name } : {}) });
    }
    return name ?? this.contacts().get(author);
  }

  /** Your address book: people added by contact link, with the name their link gave. */
  contacts(): Map<Did, string | undefined> {
    const decoded = this.core.decodeAll();
    if (this.core.contactCache?.from !== this.core.decodedRevision) {
      const map = new Map<Did, string | undefined>();
      for (const d of decoded) {
        const body = d.inner.body as { did?: unknown; name?: unknown } | null;
        if (d.private && d.inner.kind === KIND_CONTACT && isDid(body?.did)) map.set(body.did, typeof body.name === 'string' ? body.name : undefined);
      }
      this.core.setContactCache({ from: this.core.decodedRevision, map });
    }
    return this.core.contactCache!.map;
  }
}
