import {
  b64u,
  channelName,
  channelsOf,
  CHOICES,
  DEFAULT_CHANNEL,
  currentEpoch,
  decodeInvite,
  delegation,
  edgeBody,
  EDGE_KINDS,
  encodeInvite,
  eventId,
  followersOf,
  friendsOf,
  groupIdOf,
  groupState,
  groupTopic,
  isDid,
  ISSUE_STATUSES,
  issuesOf,
  KIND_BLOCK,
  KIND_CHANNEL,
  KIND_FOLLOW,
  KIND_GROUP_CREATE,
  KIND_INVITE,
  KIND_ISSUE,
  KIND_ISSUE_CLAIM,
  KIND_ISSUE_STATUS,
  KIND_JOIN,
  KIND_MSG,
  KIND_MUTE,
  KIND_PROPOSAL,
  KIND_REACT,
  KIND_REKEY,
  KIND_REMOVE,
  KIND_REPLY,
  KIND_SEALED,
  KIND_THREAD,
  KIND_VOTE,
  KIND_VOTE_DELEGATE,
  messagesOf,
  newGroup,
  open,
  openGroupEvent,
  openRekey,
  permits,
  proposalsOf,
  randomBytes,
  rekey,
  Replica,
  seal,
  sealForGroup,
  selfKey,
  socialGraph,
  threadsOf,
  visibleIn,
  type Choice,
  type Did,
  type EdgeEvent,
  type Entry,
  type EventFields,
  type GroupState,
  type Inner,
  type Issue,
  type IssueStatus,
  type Json,
  type Message,
  type Proposal,
  type Reaction,
  type Reply,
  type Sealed,
  type SigningIdentity,
  type Thread,
  type WeaveEvent,
} from '@weave/core';
import { SwarmNode } from '@weave/net';
import type {
  Actor,
  AgentInfo,
  Backend,
  ChannelInfo,
  EdgeInput,
  FeedItem,
  FeedQuery,
  GroupInfo,
  InGroup,
  IssueInfo,
  MemberInfo,
  MessageInfo,
  Person,
  Profile,
  ProfileInput,
  ProposalInfo,
  PublishInput,
  ReactionInfo,
  ReplyInfo,
  Social,
  Status,
  ThreadInfo,
  Whoami,
} from './backend.ts';
import { loadConfig, saveConfig, type Config } from './config.ts';
import { FileStore } from './filestore.ts';
import { loadGroups, saveGroup, type StoredGroup } from './groupstore.ts';
import { resolveHome, type Home } from './home.ts';
import { createAndSaveAgent, createAndSaveIdentity, loadAgents, loadIdentity, type AgentKey } from './keystore.ts';
import { acquireLock } from './lock.ts';
import { KIND_THEME, sanitizeTheme, type Theme } from './theme.ts';

export const KIND_PROFILE = 'weave.profile';
const SELF_SCOPE = 'self';

/** An event as this node can read it, before names are resolved. */
interface Decoded {
  event: WeaveEvent;
  inner: Inner;
  group?: StoredGroup;
  private?: true;
}

const EDGE_KIND: Record<EdgeInput['edge'], string> = { follow: KIND_FOLLOW, block: KIND_BLOCK, mute: KIND_MUTE };

/**
 * One person's node: their keys, their replica of the logs they know, the
 * groups they belong to, and optionally a live connection to peers. The CLI
 * uses it directly when no daemon runs; the daemon wraps it with networking
 * and the HTTP API.
 */
export class WeaveNode implements Backend {
  readonly home: Home;
  readonly identity: SigningIdentity;
  readonly replica: Replica;
  config: Config;
  #agents: AgentKey[];
  #groups = new Map<string, StoredGroup>();
  #swarm?: SwarmNode;
  #releaseLock: () => void;
  /** Everything this node can read, decrypted once; dropped whenever an event arrives or keys change. */
  #decoded?: Decoded[];

  private constructor(home: Home, identity: SigningIdentity) {
    this.home = home;
    this.identity = identity;
    this.#releaseLock = acquireLock(home);
    this.replica = new Replica(new FileStore(home.logs));
    this.config = loadConfig(home);
    this.#agents = loadAgents(home);
    for (const group of loadGroups(home)) this.#groups.set(group.id, group);

    // Pick up new group keys handed to us, now and whenever they arrive.
    for (const event of this.replica.events((e) => e.kind === KIND_REKEY)) this.#takeRekey(event);
    this.replica.onAppend((event) => {
      this.#decoded = undefined;
      if (event.kind === KIND_REKEY) this.#takeRekey(event);
    });
  }

  static open(dir?: string): WeaveNode {
    const home = resolveHome(dir);
    const identity = loadIdentity(home);
    if (!identity) throw new Error(`no identity in ${home.dir} — run "weave init" first`);
    return new WeaveNode(home, identity);
  }

  /** Create a new identity in an empty home and publish a profile with the given name. */
  static init(name: string, dir?: string): WeaveNode {
    const home = resolveHome(dir);
    createAndSaveIdentity(home);
    const node = WeaveNode.open(home.dir);
    node.replica.append(node.identity, { kind: KIND_PROFILE, body: { name } });
    return node;
  }

  get online(): boolean {
    return this.#swarm !== undefined;
  }

  /** Every DHT topic this node listens on: its own identity, configured topics, its groups and their entry points. */
  get topics(): string[] {
    const topics = new Set([this.identity.author, ...this.config.topics]);
    for (const group of this.#groups.values()) {
      topics.add(groupTopic(group));
      for (const topic of group.entry.topics) topics.add(topic);
    }
    return [...topics];
  }

  /** Connect to peers and join all topics. */
  async goOnline(): Promise<void> {
    if (this.#swarm) return;
    this.#swarm = new SwarmNode(this.replica, this.config.bootstrap.length ? { bootstrap: this.config.bootstrap } : {});
    await Promise.all(this.topics.map((topic) => this.#swarm!.join(topic)));
  }

  async goOffline(): Promise<void> {
    await this.#swarm?.destroy();
    this.#swarm = undefined;
  }

  /** Go offline and release the home for other processes. */
  async close(): Promise<void> {
    await this.goOffline();
    this.#releaseLock();
  }

  async whoami(): Promise<Whoami> {
    return { did: this.identity.did, name: this.nameOf(this.identity.did), agents: this.#agents.map(agentInfo) };
  }

  async publish(input: PublishInput): Promise<FeedItem> {
    const signer = input.as ? this.#agents.find((a) => a.name === input.as) : this.identity;
    if (!signer) throw new Error(`no agent named "${input.as}"`);
    if (input.as && !permits((signer as AgentKey).permissions, input.kind)) {
      throw new Error(`agent "${input.as}" may not sign ${input.kind}`);
    }
    const inner: Inner = { kind: input.kind, body: input.body ?? null };
    const fields: EventFields = input.group ? sealForGroup(this.#group(input.group), inner) : inner;
    const event = this.replica.append(signer, fields);
    return this.itemFor(event)!;
  }

  async feed(query: FeedQuery = {}): Promise<FeedItem[]> {
    const kinds = query.kinds?.length ? new Set(query.kinds) : undefined;
    const onlyGroup = query.group ? this.#group(query.group) : undefined;
    const onlyAuthor = query.author ? this.resolve(query.author) : undefined;
    const hidden = this.#hiddenAuthors();
    const states = new Map<string, GroupState>();

    const items: FeedItem[] = [];
    for (const decoded of this.#decodeAll()) {
      if (onlyGroup && decoded.group?.id !== onlyGroup.id) continue;
      if (onlyAuthor && decoded.event.author !== onlyAuthor) continue;
      if (query.publicOnly && (decoded.group || decoded.private)) continue;
      if (kinds && !kinds.has(decoded.inner.kind)) continue;
      if (hidden.has(decoded.event.author)) continue;
      if (decoded.group) {
        if (!states.has(decoded.group.id)) states.set(decoded.group.id, this.#groupState(decoded.group));
        if (!this.#mine(decoded.event) && !visibleIn(states.get(decoded.group.id)!, decoded.event, decoded.inner)) continue;
      }
      items.push(this.#toItem(decoded));
    }
    return items.slice(-(query.limit ?? 50));
  }

  async addAgent(name: string, permissions: string[]): Promise<AgentInfo> {
    const agent = createAndSaveAgent(this.home, this.identity.author, name, permissions);
    this.replica.append(this.identity, delegation(agent.did, 'agent', permissions, name));
    this.#agents.push(agent);
    return agentInfo(agent);
  }

  async join(topic: string): Promise<void> {
    if (!this.config.topics.includes(topic)) {
      this.config = { ...this.config, topics: [...this.config.topics, topic] };
      saveConfig(this.home, this.config);
    }
    await this.#swarm?.join(topic);
  }

  async status(): Promise<Status> {
    const heads = this.replica.heads();
    return {
      did: this.identity.did,
      name: this.nameOf(this.identity.did),
      online: this.online,
      topics: this.config.topics,
      groups: this.#groups.size,
      peers: this.#swarm?.sessions.size ?? 0,
      logs: Object.keys(heads).length,
      events: Object.values(heads).reduce((sum, seq) => sum + seq, 0),
      pending: this.replica.pendingCount,
    };
  }

  async watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
    const unsubscribe = this.replica.onAppend((event) => {
      const item = this.itemFor(event);
      if (item && !this.#hiddenAuthors().has(item.author)) onItem(item);
    });
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    unsubscribe();
  }

  // ---------------------------------------------------------------- groups

  async createGroup(name: string): Promise<GroupInfo> {
    const group: StoredGroup = { ...newGroup(name, this.identity.author), entry: { topics: [], bootstrap: [] } };
    this.#saveGroup(group);
    this.replica.append(this.identity, sealForGroup(group, { kind: KIND_GROUP_CREATE, body: { name } }));
    await this.#swarm?.join(groupTopic(group));
    return this.#groupInfo(group);
  }

  async groups(): Promise<GroupInfo[]> {
    return [...this.#groups.values()].map((g) => this.#groupInfo(g));
  }

  async invite(groupRef: string, hours = 24 * 7): Promise<string> {
    const group = this.#group(groupRef);
    const invite = b64u.encode(randomBytes(12));
    const expires = new Date(Date.now() + hours * 3600_000).toISOString();
    this.replica.append(this.identity, sealForGroup(group, { kind: KIND_INVITE, body: { invite, expires } }));
    const { entry: _entry, ...keys } = group;
    return encodeInvite({
      v: 1,
      group: keys,
      invite,
      inviter: this.identity.author,
      expires,
      entry: { topics: [this.identity.author], bootstrap: this.config.bootstrap },
    });
  }

  async joinGroup(text: string): Promise<GroupInfo> {
    const invite = decodeInvite(text);
    if (this.#groups.has(invite.group.id)) throw new Error(`already in group "${invite.group.name}"`);
    // Someone on a private network (e.g. a local testnet) brings us onto it.
    if (!this.config.bootstrap.length && invite.entry.bootstrap.length) {
      this.config = { ...this.config, bootstrap: invite.entry.bootstrap };
      saveConfig(this.home, this.config);
    }
    const group: StoredGroup = { ...invite.group, entry: invite.entry };
    this.#saveGroup(group);
    this.replica.append(this.identity, sealForGroup(group, { kind: KIND_JOIN, body: { invite: invite.invite } }));
    if (this.#swarm) await Promise.all([groupTopic(group), ...invite.entry.topics].map((t) => this.#swarm!.join(t)));
    return this.#groupInfo(group);
  }

  async members(groupRef: string): Promise<MemberInfo[]> {
    const group = this.#group(groupRef);
    const state = this.#groupState(group);
    const lastActive = new Map<Did, string>();
    const agents = new Map<Did, Set<string>>();
    for (const entry of this.#entries(group)) {
      const { author, signer, time } = entry.event;
      if (time > (lastActive.get(author) ?? '')) lastActive.set(author, time);
      const agent = signer !== author ? this.replica.authority.grant(signer)?.name : undefined;
      if (agent) agents.set(author, (agents.get(author) ?? new Set()).add(agent));
    }
    return [...state.members.values()].map((m) => ({
      did: m.did,
      name: this.nameOf(m.did),
      since: m.since,
      ...(m.invitedBy ? { invitedBy: m.invitedBy, invitedByName: this.nameOf(m.invitedBy) } : {}),
      ...(lastActive.has(m.did) ? { lastActive: lastActive.get(m.did) } : {}),
      agents: [...(agents.get(m.did) ?? [])],
    }));
  }

  async removeMember(groupRef: string, who: string): Promise<void> {
    const group = this.#group(groupRef);
    if (group.founder !== this.identity.author) throw new Error('only the group founder can remove members (for now)');
    const member = this.resolve(who);
    const state = this.#groupState(group);
    if (!state.members.has(member)) throw new Error(`${who} is not a member of "${group.name}"`);

    this.replica.append(this.identity, sealForGroup(group, { kind: KIND_REMOVE, body: { member } }));
    const remaining = [...state.members.keys()].filter((did) => did !== member);
    const { fields, epoch, key } = rekey(group, remaining);
    group.keys[String(epoch)] = key;
    this.#saveGroup(group);
    this.replica.append(this.identity, fields);
  }

  // ---------------------------------------------------------------- social graph

  async setEdge(input: EdgeInput): Promise<void> {
    const subject = this.resolve(input.who);
    if (subject === this.identity.author) throw new Error('that is you');
    const inner: Inner = { kind: EDGE_KIND[input.edge], body: edgeBody(subject, input.on) };
    const isPrivate = input.private ?? input.edge !== 'follow';
    this.replica.append(this.identity, isPrivate ? this.#sealForSelf(inner) : inner);
  }

  async social(): Promise<Social> {
    const graph = this.#graph();
    const me = this.identity.author;
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

  // ---------------------------------------------------------------- spaces

  async profile(who?: string): Promise<Profile> {
    const did = who ? this.resolve(who) : this.identity.author;
    const graph = this.#graph();
    const me = this.identity.author;
    const mine = graph.get(me);
    return {
      did,
      name: this.nameOf(did),
      theme: this.themeOf(did),
      me: did === me,
      following: mine?.following.has(did) ?? false,
      followsMe: graph.get(did)?.following.has(me) ?? false,
      blocked: mine?.blocked.has(did) ?? false,
      muted: mine?.muted.has(did) ?? false,
      posts: this.replica.events((e) => e.author === did && e.kind === 'weave.post').length,
    };
  }

  async setProfile(input: ProfileInput): Promise<Profile> {
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 40) throw new Error('names are 1 to 40 characters');
      if (name !== this.nameOf(this.identity.author)) this.replica.append(this.identity, { kind: KIND_PROFILE, body: { name } });
    }
    if (input.theme) {
      const theme = sanitizeTheme({ ...this.themeOf(this.identity.author), ...input.theme });
      this.replica.append(this.identity, { kind: KIND_THEME, body: { ...theme } });
    }
    return this.profile();
  }

  async directory(): Promise<Profile[]> {
    const authors = new Set(this.replica.events((e) => e.kind === KIND_PROFILE).map((e) => e.author));
    authors.delete(this.identity.author);
    const profiles = await Promise.all([...authors].map((did) => this.profile(did)));
    return profiles.sort((a, b) => (a.name ?? a.did).localeCompare(b.name ?? b.did));
  }

  /** A space's theme: the latest theme event its author published. */
  themeOf(author: Did): Theme {
    let theme: unknown;
    for (const event of this.replica.store.range(author, 1)) if (event.kind === KIND_THEME) theme = event.body;
    return sanitizeTheme(theme);
  }

  // ---------------------------------------------------------------- working together

  async threads(groupRef: string): Promise<ThreadInfo[]> {
    return threadsOf(this.#entries(this.#group(groupRef))).map((t) => this.#threadInfo(t));
  }

  async startThread(input: InGroup & { title: string; text?: string }): Promise<ThreadInfo> {
    if (!input.title?.trim()) throw new Error('a thread needs a title');
    const { id } = await this.publish({ kind: KIND_THREAD, body: { title: input.title.trim(), text: input.text ?? '' }, group: input.group, as: input.as });
    return (await this.threads(input.group)).find((t) => t.id === id)!;
  }

  async reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo> {
    if (!input.text?.trim()) throw new Error('a reply needs text');
    const target = this.#find(input.target, [KIND_THREAD, KIND_ISSUE, KIND_PROPOSAL]);
    const item = await this.publish({ kind: KIND_REPLY, body: { target: target.id, text: input.text.trim() }, group: target.group?.id, as: input.as });
    return { id: item.id, by: this.#actor(item.author, item.signer), text: input.text.trim(), time: item.time };
  }

  async channels(groupRef: string): Promise<ChannelInfo[]> {
    return channelsOf(this.#entries(this.#group(groupRef)));
  }

  async createChannel(input: InGroup & { name: string; topic?: string }): Promise<ChannelInfo> {
    const name = channelName(input.name);
    if (!name) throw new Error('channel names use letters, digits and dashes');
    if ((await this.channels(input.group)).some((c) => c.name === name)) throw new Error(`#${name} already exists`);
    await this.publish({ kind: KIND_CHANNEL, body: { name, topic: input.topic ?? '' }, group: input.group, as: input.as });
    return (await this.channels(input.group)).find((c) => c.name === name)!;
  }

  async messages(groupRef: string, options: { channel?: string; limit?: number } = {}): Promise<MessageInfo[]> {
    const entries = this.#entries(this.#group(groupRef));
    const all = messagesOf(entries);
    const byId = new Map(all.map((m) => [m.id, m]));
    const channel = options.channel ? channelName(options.channel) ?? DEFAULT_CHANNEL : undefined;
    return all
      .filter((m) => !channel || m.channel === channel)
      .slice(-(options.limit ?? 200))
      .map((m) => this.#messageInfo(m, byId));
  }

  async say(input: InGroup & { text: string; channel?: string; replyTo?: string }): Promise<MessageInfo> {
    const text = input.text?.trim();
    if (!text) throw new Error('a message needs text');
    const body: Record<string, Json> = { text };
    const channel = input.channel ? channelName(input.channel) : undefined;
    if (input.channel && !channel) throw new Error('channel names use letters, digits and dashes');
    if (channel && channel !== DEFAULT_CHANNEL) body.channel = channel;
    if (input.replyTo) body.replyTo = this.#find(input.replyTo, [KIND_MSG]).id;
    const { id } = await this.publish({ kind: KIND_MSG, body, group: input.group, as: input.as });
    return (await this.messages(input.group)).find((m) => m.id === id)!;
  }

  async react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void> {
    const emoji = input.emoji?.trim();
    if (!emoji || emoji.length > 16) throw new Error('react with one emoji');
    const target = this.#find(input.target, [KIND_MSG, 'weave.post', KIND_THREAD, KIND_REPLY, KIND_ISSUE, KIND_PROPOSAL]);
    await this.publish({ kind: KIND_REACT, body: { target: target.id, emoji, on: input.on ?? true }, group: target.group?.id, as: input.as });
  }

  async issues(groupRef: string): Promise<IssueInfo[]> {
    return issuesOf(this.#entries(this.#group(groupRef))).map((i) => this.#issueInfo(i));
  }

  async openIssue(input: InGroup & { title: string; text?: string; labels?: string[] }): Promise<IssueInfo> {
    if (!input.title?.trim()) throw new Error('an issue needs a title');
    const body = { title: input.title.trim(), text: input.text ?? '', labels: input.labels ?? [] };
    const { id } = await this.publish({ kind: KIND_ISSUE, body, group: input.group, as: input.as });
    return (await this.issues(input.group)).find((i) => i.id === id)!;
  }

  async claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo> {
    const issue = this.#find(input.issue, [KIND_ISSUE]);
    await this.publish({ kind: KIND_ISSUE_CLAIM, body: { issue: issue.id }, group: issue.group?.id, as: input.as });
    return this.#issueById(issue);
  }

  async setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo> {
    if (!ISSUE_STATUSES.includes(input.status)) throw new Error(`status must be one of ${ISSUE_STATUSES.join(', ')}`);
    const issue = this.#find(input.issue, [KIND_ISSUE]);
    await this.publish({ kind: KIND_ISSUE_STATUS, body: { issue: issue.id, status: input.status }, group: issue.group?.id, as: input.as });
    return this.#issueById(issue);
  }

  async proposals(groupRef: string): Promise<ProposalInfo[]> {
    const group = this.#group(groupRef);
    const members = new Set(this.#groupState(group).members.keys());
    return proposalsOf(this.#entries(group), members).map((p) => this.#proposalInfo(p));
  }

  async propose(input: InGroup & { title: string; text?: string; hours?: number; quorum?: number }): Promise<ProposalInfo> {
    if (!input.title?.trim()) throw new Error('a proposal needs a title');
    const deadline = new Date(Date.now() + (input.hours ?? 72) * 3600_000).toISOString();
    const body: Record<string, Json> = { title: input.title.trim(), text: input.text ?? '', deadline };
    if (input.quorum) body.quorum = input.quorum;
    const { id } = await this.publish({ kind: KIND_PROPOSAL, body, group: input.group, as: input.as });
    return (await this.proposals(input.group)).find((p) => p.id === id)!;
  }

  async vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo> {
    if (!CHOICES.includes(input.choice)) throw new Error(`vote ${CHOICES.join(', ')}`);
    const proposal = this.#find(input.proposal, [KIND_PROPOSAL]);
    if (!proposal.group) throw new Error('votes happen inside groups');
    await this.publish({ kind: KIND_VOTE, body: { proposal: proposal.id, choice: input.choice }, group: proposal.group.id, as: input.as });
    return (await this.proposals(proposal.group.id)).find((p) => p.id === proposal.id)!;
  }

  async delegateVote(input: { group: string; who?: string }): Promise<void> {
    const to = input.who ? this.resolve(input.who) : null;
    if (to === this.identity.author) throw new Error('you cannot delegate to yourself');
    await this.publish({ kind: KIND_VOTE_DELEGATE, body: { to }, group: input.group });
  }

  async votingDelegate(groupRef: string): Promise<Actor | null> {
    let to: unknown = null;
    for (const entry of this.#entries(this.#group(groupRef))) {
      if (entry.kind === KIND_VOTE_DELEGATE && entry.event.author === this.identity.author) {
        to = (entry.body as { to?: unknown } | null)?.to ?? null;
      }
    }
    return isDid(to) ? this.#actor(to, to) : null;
  }

  /** A did:key, or the name of someone whose profile this node has seen. */
  resolve(who: string): Did {
    if (isDid(who)) return who;
    const matches = new Set<Did>();
    for (const event of this.replica.events((e) => e.kind === KIND_PROFILE)) {
      const name = (event.body as { name?: unknown } | null)?.name;
      if (typeof name === 'string' && name.toLowerCase() === who.toLowerCase()) matches.add(event.author);
    }
    if (matches.size === 0) throw new Error(`nobody named "${who}" is known yet — use their did:key`);
    if (matches.size > 1) throw new Error(`several people are named "${who}" — use their did:key`);
    return [...matches][0];
  }

  /** Display name for an author: the name in their latest profile. */
  nameOf(author: Did): string | undefined {
    let name: string | undefined;
    for (const event of this.replica.store.range(author, 1)) {
      const body = event.body as { name?: unknown } | null;
      if (event.kind === KIND_PROFILE && typeof body?.name === 'string') name = body.name;
    }
    return name;
  }

  /** The event as this node can read it, or undefined if it can't (someone else's group or private data). */
  itemFor(event: WeaveEvent): FeedItem | undefined {
    const decoded = this.#decode(event);
    return decoded && this.#toItem(decoded);
  }

  // ---------------------------------------------------------------- internals

  #group(ref: string): StoredGroup {
    const byId = this.#groups.get(ref);
    if (byId) return byId;
    const byName = [...this.#groups.values()].filter((g) => g.name.toLowerCase() === ref.toLowerCase());
    if (byName.length === 1) return byName[0];
    throw new Error(byName.length ? `several groups are named "${ref}" — use its id` : `you are not in a group "${ref}"`);
  }

  #saveGroup(group: StoredGroup): void {
    this.#decoded = undefined;
    this.#groups.set(group.id, group);
    saveGroup(this.home, group);
  }

  #takeRekey(event: WeaveEvent): void {
    const group = this.#groups.get(groupIdOf(event.scope) ?? '');
    if (!group || event.author !== group.founder) return;
    const opened = openRekey(event, this.identity);
    if (opened && !group.keys[String(opened.epoch)]) {
      group.keys[String(opened.epoch)] = opened.key;
      this.#saveGroup(group);
    }
  }

  #groupState(group: StoredGroup): GroupState {
    const opened = this.#decodeAll().filter((d) => d.group?.id === group.id);
    return groupState(group.founder, opened);
  }

  #groupInfo(group: StoredGroup): GroupInfo {
    return {
      id: group.id,
      name: group.name,
      founder: group.founder,
      founderName: this.nameOf(group.founder),
      members: this.#groupState(group).members.size,
      epoch: currentEpoch(group),
    };
  }

  #sealForSelf(inner: Inner): EventFields {
    const key = selfKey(this.identity.keys.secretKey);
    return { kind: KIND_SEALED, scope: SELF_SCOPE, body: seal(key, inner as unknown as Json, `weave/self/v1:${this.identity.author}`) };
  }

  #decode(event: WeaveEvent): Decoded | undefined {
    if (event.kind === KIND_REKEY) return undefined; // key plumbing, not content
    if (event.kind !== KIND_SEALED) return { event, inner: { kind: event.kind, body: event.body } };

    let decoded: Decoded | undefined;
    if (event.scope === SELF_SCOPE) {
      if (event.author !== this.identity.author) return undefined;
      try {
        const key = selfKey(this.identity.keys.secretKey);
        const inner = open(key, event.body as Sealed, `weave/self/v1:${event.author}`) as unknown as Inner;
        decoded = { event, inner, private: true };
      } catch {
        return undefined;
      }
    } else {
      const group = this.#groups.get(groupIdOf(event.scope) ?? '');
      const inner = group && openGroupEvent(group, event);
      if (!inner) return undefined;
      decoded = { event, inner, group };
    }
    // A delegated key may carry sealed events, but only of kinds it was granted.
    if (event.signer !== event.author) {
      const grant = this.replica.authority.grant(event.signer);
      if (!grant || !permits(grant.permissions, decoded.inner.kind)) return undefined;
    }
    return decoded;
  }

  #decodeAll(): Decoded[] {
    this.#decoded ??= this.replica.events().flatMap((event) => {
      const decoded = this.#decode(event);
      return decoded ? [decoded] : [];
    });
    return this.#decoded;
  }

  #graph() {
    const edges: EdgeEvent[] = this.#decodeAll()
      .filter((d) => (EDGE_KINDS as readonly string[]).includes(d.inner.kind))
      .map((d) => ({ author: d.event.author, kind: d.inner.kind, body: d.inner.body, time: d.event.time, signer: d.event.signer, seq: d.event.seq }));
    return socialGraph(edges);
  }

  /** Authors I blocked or muted: their events are left out of feeds. */
  #hiddenAuthors(): Set<Did> {
    const mine = this.#graph().get(this.identity.author);
    return new Set([...(mine?.blocked ?? []), ...(mine?.muted ?? [])]);
  }

  /**
   * Your own events are always shown to you: after joining offline, your node
   * can't confirm your membership until it has synced the founder's events.
   */
  #mine = (event: WeaveEvent): boolean => event.author === this.identity.author;

  /** A group's readable events from members, as entries for the collaboration functions. */
  #entries(group: StoredGroup): Entry[] {
    const state = this.#groupState(group);
    return this.#decodeAll()
      .filter((d) => d.group?.id === group.id && (this.#mine(d.event) || visibleIn(state, d.event, d.inner)))
      .map((d) => ({ id: eventId(d.event), event: d.event, kind: d.inner.kind, body: d.inner.body }));
  }

  /** An event by full id or a unique prefix (at least 6 characters), limited to some kinds. */
  #find(ref: string, kinds: string[]): Decoded & { id: string } {
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.#decodeAll()
      .filter((d) => kinds.includes(d.inner.kind))
      .map((d) => ({ ...d, id: eventId(d.event) }))
      .filter((d) => d.id.startsWith(ref));
    if (matches.length === 0) throw new Error(`nothing found with id ${ref}`);
    if (matches.length > 1) throw new Error(`id ${ref} is ambiguous — use more characters`);
    return matches[0];
  }

  async #issueById(issue: Decoded & { id: string }): Promise<IssueInfo> {
    if (!issue.group) throw new Error('issues live inside groups');
    return (await this.issues(issue.group.id)).find((i) => i.id === issue.id)!;
  }

  #actor(author: Did, signer: Did): Actor {
    const actor: Actor = { did: author };
    const name = this.nameOf(author);
    if (name) actor.name = name;
    if (signer !== author) {
      const agent = this.replica.authority.grant(signer)?.name;
      if (agent) actor.agent = agent;
    }
    return actor;
  }

  #reactionInfo = (r: Reaction): ReactionInfo => ({
    emoji: r.emoji,
    count: r.by.length,
    mine: r.by.some((who) => who.author === this.identity.author),
    by: r.by.map((who) => {
      const actor = this.#actor(who.author, who.signer);
      return `${actor.name ?? actor.did.slice(8, 16)}${actor.agent ? ` · ${actor.agent}` : ''}`;
    }),
  });

  #messageInfo(m: Message, byId: Map<string, Message>): MessageInfo {
    const parent = m.replyTo ? byId.get(m.replyTo) : undefined;
    return {
      id: m.id,
      short: m.id.slice(0, 8),
      by: this.#actor(m.author, m.signer),
      text: m.text,
      time: m.time,
      channel: m.channel,
      ...(parent ? { replyTo: { id: parent.id, by: this.#actor(parent.author, parent.signer), text: parent.text.slice(0, 140) } } : {}),
      reactions: m.reactions.map(this.#reactionInfo),
    };
  }

  #replyInfo = (r: Reply): ReplyInfo => ({ id: r.id, by: this.#actor(r.author, r.signer), text: r.text, time: r.time });

  #threadInfo(t: Thread): ThreadInfo {
    return { id: t.id, short: t.id.slice(0, 8), by: this.#actor(t.author, t.signer), title: t.title, text: t.text, time: t.time, active: t.active, replies: t.replies.map(this.#replyInfo) };
  }

  #issueInfo(i: Issue): IssueInfo {
    return {
      id: i.id,
      short: i.id.slice(0, 8),
      by: this.#actor(i.author, i.signer),
      title: i.title,
      text: i.text,
      labels: i.labels,
      status: i.status,
      ...(i.assignee ? { assignee: this.#actor(i.assignee.author, i.assignee.signer) } : {}),
      time: i.time,
      replies: i.replies.map(this.#replyInfo),
    };
  }

  #proposalInfo(p: Proposal): ProposalInfo {
    const { votes, ...t } = p.tally;
    const mine = votes.get(this.identity.author);
    return {
      id: p.id,
      short: p.id.slice(0, 8),
      by: this.#actor(p.author, p.signer),
      title: p.title,
      text: p.text,
      deadline: p.deadline,
      time: p.time,
      ...t,
      ...(mine ? { myVote: { choice: mine.choice, ...(mine.via ? { via: this.#actor(mine.via, mine.via) } : {}) } } : {}),
      replies: p.replies.map(this.#replyInfo),
    };
  }

  #toItem({ event, inner, group, private: isPrivate }: Decoded): FeedItem {
    const item: FeedItem = {
      id: eventId(event),
      time: event.time,
      kind: inner.kind,
      scope: event.scope,
      body: inner.body,
      author: event.author,
      signer: event.signer,
      seq: event.seq,
    };
    const authorName = this.nameOf(event.author);
    if (authorName) item.authorName = authorName;
    if (event.signer !== event.author) {
      const signerName = this.replica.authority.grant(event.signer)?.name;
      if (signerName) item.signerName = signerName;
    }
    if (group) item.group = { id: group.id, name: group.name };
    if (isPrivate) item.private = true;
    return item;
  }
}

const agentInfo = (agent: AgentKey): AgentInfo => ({ name: agent.name, did: agent.did, permissions: agent.permissions });
