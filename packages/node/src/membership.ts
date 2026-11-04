import { type BoardRight, type Did, HISTORIES, type HistorySetting, type Json, KIND_ADMIT, KIND_AGENT_APPROVE, KIND_CLOSE, KIND_DECLINE, KIND_HANDOVER, KIND_HISTORY, KIND_INVITE, KIND_JOIN, KIND_KNOCK, KIND_KNOCK_HANDLED, KIND_KNOCK_PENDING, KIND_LEAVE, KIND_PROJECT_GROUP, KIND_REMOVE, KIND_RULE, KIND_SPACE_CREATE, KIND_VISITORS, SERVICE_PREFIX, type SpaceKind, type VisitorRule, WeaveError, type WeaveRecord, decodeInvite, decodeKnock, encodeInvite, encodeKnock, gift, inviteKeys, inviteRightsOf, isDid, isInviteLink, isKnockLink, joinProof, knockFor, mayDo, open, openKnock, parseVisitorRule, peekInvite, peekKnock, rekey, sealFor, spaceScope, spaceTopics } from '@weave/core';
import { type Admission, type CommunityInfo, type InviteLook, type InviteOptions, type KnockInfo, type MemberInfo, type ProjectInfo, type SpaceInfo, noAgentError } from './backend.ts';
import { type StoredSpace, removeSpace } from './spacestore.ts';
import type { Recipient } from '@weave/core';
import type { Network } from './ports.ts';
import type { AgentKey } from './keystore.ts';
import type { Companies } from './companies.ts';
import type { Kernel } from './kernel.ts';
import type { ManagedKeys } from './managed.ts';
import type { WeaveNode } from './node.ts';
import { summary, KIND_PAGE } from './node.ts';
import { DEFAULT_PAGE } from './node.ts';
/*
 * Membership: creating groups, projects and communities, invite and knock
 * links, joining, who is in, leaving and handing over, removing, closing,
 * what newcomers read, approved agents and visitors, groups invited into
 * projects and their admissions. Every write asks mayDo (core). It sees the
 * node's internals only through MembershipCore; the node delegates the
 * Backend methods to it.
 */

/** What Membership needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface MembershipCore {
  agentMay(name: string, kind: string): void;
  agentName(signer: Did, author: Did): string | undefined;
  readonly agents: AgentKey[];
  readonly companies: Companies;
  readonly encryptionKeyOf: (person: Did) => Did;
  readonly kernel: Kernel;
  readonly managed: ManagedKeys;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  readonly spaces: Map<string, StoredSpace>;
  readonly network: Network | undefined;
  tryOpen<T>(open: (me: Recipient) => T | undefined): T | undefined;
}

export class Membership {
  private readonly node: WeaveNode;
  private readonly core: MembershipCore;

  constructor(node: WeaveNode, core: MembershipCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- groups and projects

  async spaces(kind?: SpaceKind): Promise<SpaceInfo[]> {
    return [...this.core.spaces.values()].filter((s) => !kind || s.kind === kind).map((s) => this.core.kernel.spaceInfo(s));
  }

  async createGroup(name: string): Promise<SpaceInfo> {
    return this.core.kernel.spaceInfo(await this.core.kernel.createSpace('group', name));
  }

  async createProject(input: { name: string; description?: string; as?: string }): Promise<ProjectInfo> {
    // An agent counts as its person: it may start a project for them, which is theirs, never its own.
    if (input.as) this.core.agentMay(input.as, KIND_SPACE_CREATE);
    const project = await this.core.kernel.createSpace('project', input.name);
    if (input.description) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_PAGE, body: { ...DEFAULT_PAGE, body: input.description, description: summary(input.description) } }));
    return this.node.project(project.id);
  }

  async invite(ref: string, hours = 24 * 7, options: InviteOptions = {}): Promise<string> {
    const space = this.core.kernel.space(ref);
    const state = this.core.kernel.state(space);
    if (space.kind === 'direct') throw new WeaveError('daemon.invite.direct', undefined, 'a direct chat is between two people; start a group to talk with more');
    if (state.closed) throw new WeaveError('daemon.invite.closed', { space: space.name }, `${space.name} is closed`);
    if (state.tier && !mayDo(state, this.node.identity.author, 'invite').ok) {
      const who = this.node.nameOf(state.founder);
      throw who
        ? new WeaveError('daemon.invite.founder.only', { who, space: space.name }, `only ${who} lets people into ${space.name}`)
        : new WeaveError('daemon.invite.founder.only.unknown', { space: space.name }, `only its creator lets people into ${space.name}`);
    }
    // Our own new space, before its creation is folded in, is ours to invite to.
    const allowed = mayDo(state, this.node.identity.author, 'invite').ok || (space.kind !== 'project' && this.core.kernel.mineFounder(space));
    if (!allowed)
      throw space.kind === 'project'
        ? new WeaveError('daemon.invite.maintainers.only', undefined, 'only maintainers can invite people into a project')
        : new WeaveError('daemon.invite.not.member', { space: space.name }, `you are not a member of ${space.name}`);
    if (options.access?.length && space.kind !== 'project') throw new WeaveError('daemon.invite.board.rights', undefined, 'board rights are for projects');
    const boards = space.kind === 'project' ? this.core.kernel.spacePosts(space).boards : [];
    const access: BoardRight[] = (options.access ?? []).map((r) => ({ board: this.core.kernel.board(space, boards, r.board).name, ...(r.read ? { read: true } : {}), ...(r.write ? { write: true } : {}) }));
    // The space reads the link's public key as its id; the link keeps the secret one (inviteKeys).
    const { invite, key } = inviteKeys();
    const expires = new Date(Date.now() + hours * 3600_000).toISOString();
    const body: Record<string, Json> = { invite, expires, key: true };
    if (access.length) body.access = access as unknown as Json;
    if (options.accept) body.accept = true;
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_INVITE, body }));
    if (options.accept) {
      return encodeKnock({
        v: 1,
        space: { kind: space.kind, id: space.id, name: space.name, founder: space.founder },
        invite,
        inviter: this.node.identity.author,
        enc: this.core.encryptionKeyOf(this.node.identity.author),
        expires,
        entry: this.core.kernel.entryPoint(),
      });
    }
    const boardKeys = this.core.kernel.boardKeysFor(space, access);
    return encodeInvite({ v: 2, space: this.core.kernel.keysForNewcomers(space), invite, key, inviter: this.node.identity.author, expires, entry: this.core.kernel.entryPoint(), ...(boardKeys ? { boards: boardKeys } : {}) });
  }

  async joinSpace(text: string, note?: string): Promise<SpaceInfo> {
    if (isKnockLink(text)) return this.#knock(text, note ?? '');
    const { space, invite, proof } = await this.takeInvite(text);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_JOIN, body: { invite, ...(proof ? { proof } : {}) } }));
    return this.core.kernel.spaceInfo(space);
  }

  async lookAtInvite(text: string): Promise<InviteLook> {
    const link = text.trim();
    const knock = isKnockLink(link);
    if (!knock && !isInviteLink(link)) throw new Error('not a Weave invite link');
    let parsed: { space: { id: string; kind: SpaceKind; name: string; founder: Did }; inviter: Did; expires: string; boards?: Record<string, unknown>; key?: string };
    try {
      parsed = knock ? peekKnock(link) : peekInvite(link);
    } catch (error) {
      throw new Error((error as Error).message);
    }
    const me = this.node.identity.author;
    const held = this.core.spaces.get(parsed.space.id);
    const look: InviteLook = {
      kind: knock ? 'knock' : 'invite',
      space: { id: parsed.space.id, kind: parsed.space.kind, name: held ? this.core.kernel.spaceName(held) : parsed.space.name, founder: parsed.space.founder, ...(this.node.nameOf(parsed.space.founder) ? { founderName: this.node.nameOf(parsed.space.founder) } : {}) },
      inviter: { did: parsed.inviter, ...(this.node.nameOf(parsed.inviter) ? { name: this.node.nameOf(parsed.inviter) } : {}) },
      expires: parsed.expires,
      boards: Object.keys(parsed.boards ?? {}),
      standing: 'open',
    };
    const state = held ? this.core.kernel.state(held) : undefined;
    if (parsed.inviter === me) return { ...look, standing: 'mine', ...(state ? { members: state.members.size } : {}) };
    // In already: we hold its keys and weren't removed (a join written here counts before the invite it cites has synced).
    // Removed and asked back with a new link: open, as takeInvite takes it.
    if (state && (state.members.has(me) || !state.removed.has(me))) return { ...look, standing: 'member', members: state.members.size };
    if (knock && this.core.selfBodies(KIND_KNOCK_PENDING).some((b) => b.space === parsed.space.id && b.inviter === parsed.inviter)) return { ...look, standing: 'waiting' };
    if (!knock && typeof parsed.key !== 'string') return { ...look, standing: 'old', problem: 'this link was made by an older Weave and no longer works: ask for a new one' };
    if (Date.parse(parsed.expires) < this.node.clock()) return { ...look, standing: 'expired', problem: 'this link has expired: ask for a new one' };
    const inside = this.core.companies.insideOnly(parsed.space.founder);
    if (inside) return { ...look, standing: 'elsewhere', problem: inside };
    return look;
  }

  /** An invite's space and keys, kept here; the join itself is written by the caller. */
  async takeInvite(text: string): Promise<{ space: StoredSpace; invite: string; proof?: string }> {
    const invite = decodeInvite(text);
    const held = this.core.spaces.get(invite.space.id);
    if (held) {
      // Removed, and asked back with a new link (_Ak3UUmp): the space as it is now, keys added to the ones we kept.
      const state = this.core.kernel.state(held);
      if (!state.removed.has(this.node.identity.author) || state.members.has(this.node.identity.author)) throw new WeaveError('daemon.join.already', { space: invite.space.name }, `you are already in ${invite.space.name}`);
      for (const [epoch, key] of Object.entries(invite.space.keys)) if (!held.keys[epoch]) held.keys[epoch] = key;
      held.via = invite.inviter;
      if (invite.boards) for (const [board, epochs] of Object.entries(invite.boards)) held.boards = { ...held.boards, [board]: { ...held.boards?.[board], ...epochs } };
      this.core.kernel.saveSpace(held);
      return { space: held, invite: invite.invite, ...(invite.key ? { proof: joinProof(invite.key, spaceScope(held), this.node.identity.author) } : {}) };
    }
    const inside = this.core.companies.insideOnly(invite.space.founder);
    if (inside) throw new Error(inside);
    this.core.kernel.adoptBootstrap(invite.entry);
    const space: StoredSpace = { ...invite.space, entry: invite.entry, via: invite.inviter, ...(invite.boards ? { boards: invite.boards } : {}) };
    await this.core.kernel.addSpace(space);
    return { space, invite: invite.invite, ...(invite.key ? { proof: joinProof(invite.key, spaceScope(space), this.node.identity.author) } : {}) };
  }

  /** Ask to be let in with a link that needs the inviter's OK. */
  async #knock(text: string, note: string): Promise<SpaceInfo> {
    const link = decodeKnock(text);
    if (this.core.spaces.has(link.space.id)) throw new WeaveError('daemon.join.already', { space: link.space.name }, `you are already in ${link.space.name}`);
    if (link.inviter === this.node.identity.author) throw new WeaveError('daemon.join.own.link', undefined, "that's your own link");
    this.core.kernel.adoptBootstrap(link.entry);
    // The meeting point the link holds (links from before meeting points hold the inviter's DID instead).
    for (const topic of new Set(link.entry.topics)) await this.node.join(topic);
    this.node.replica.write(this.node.identity, this.core.kernel.sealForSelf({ kind: KIND_KNOCK_PENDING, body: { space: link.space.id, inviter: link.inviter, ...(link.entry.meet ? { meet: link.entry.meet } : {}) } }));
    this.node.replica.write(this.node.identity, knockFor(link, note.trim(), this.core.kernel.entryPoint()));
    return { id: link.space.id, kind: link.space.kind, name: link.space.name, founder: link.space.founder, founderName: this.node.nameOf(link.space.founder), members: 0, epoch: 0, history: 'all', waiting: true };
  }

  async knocks(): Promise<KnockInfo[]> {
    return this.#openKnocks().map(({ id, event, space, note, rights }) => ({
      id,
      space: { id: space.id, kind: space.kind, name: space.name },
      did: event.author,
      name: this.node.nameOf(event.author),
      note,
      time: event.time,
      access: rights,
    }));
  }

  async answerKnock(input: { knock: string; accept: boolean }): Promise<void> {
    const matches = this.#openKnocks().filter((k) => k.id.startsWith(input.knock));
    if (matches.length !== 1)
      throw matches.length
        ? new WeaveError('daemon.request.ambiguous', undefined, 'that id is ambiguous — use more characters')
        : new WeaveError('daemon.request.none', undefined, 'no such request (maybe already answered)');
    const { id, event, space, invite, rights } = matches[0];
    if (input.accept) {
      const member = event.author;
      this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ADMIT, body: { member, invite } }));
      const boardKeys = this.core.kernel.boardKeysFor(space, rights);
      this.node.replica.write(this.node.identity, gift({ ...this.core.kernel.keysForNewcomers(space), ...(boardKeys ? { boards: boardKeys } : {}) } as typeof space, [member], spaceScope(this.core.kernel.direct(member)), this.core.kernel.entryPoint(), this.core.encryptionKeyOf));
    }
    this.node.replica.write(this.node.identity, this.core.kernel.sealForSelf({ kind: KIND_KNOCK_HANDLED, body: { knock: id } }));
  }

  /** Knocks with my live links that I haven't answered and whose senders aren't in yet. */
  #openKnocks(): Array<{ id: string; event: WeaveRecord; space: StoredSpace; invite: string; note: string; rights: BoardRight[] }> {
    const handled = new Set(this.core.selfBodies(KIND_KNOCK_HANDLED).map((b) => b.knock));
    const out: Array<{ id: string; event: WeaveRecord; space: StoredSpace; invite: string; note: string; rights: BoardRight[] }> = [];
    for (const event of this.node.replica.events((e) => e.kind === KIND_KNOCK && e.author !== this.node.identity.author)) {
      const id = event.id;
      if (handled.has(id)) continue;
      const opened = this.core.tryOpen((me) => openKnock(event, me));
      const space = opened && this.core.spaces.get(opened.space);
      if (!opened || !space) continue;
      const state = this.core.kernel.state(space);
      if (state.members.has(event.author)) continue;
      const entries = this.core.kernel.entries(space);
      const live = entries.some((e) => e.kind === KIND_INVITE && e.event.author === this.node.identity.author && (e.body as { invite?: unknown; expires?: unknown; accept?: unknown })?.invite === opened.invite && (e.body as { accept?: unknown }).accept === true && String((e.body as { expires?: unknown }).expires) >= new Date().toISOString());
      if (!live) continue;
      out.push({ id, event, space, invite: opened.invite, note: opened.note, rights: inviteRightsOf(entries, state).get(opened.invite) ?? [] });
    }
    return out.sort((x, y) => x.event.time.localeCompare(y.event.time));
  }


  /** What people's agents and services may do in a space (those who manage it). Leaving one out keeps it as it is. */
  async setVisitors(input: { space: string; agents?: VisitorRule; services?: VisitorRule }): Promise<SpaceInfo> {
    const space = this.core.kernel.space(input.space);
    const state = this.core.kernel.state(space);
    if (space.kind === 'direct') throw new WeaveError('daemon.rules.direct', undefined, 'a direct chat has no rules for agents');
    if (!mayDo(state, this.node.identity.author, 'manage').ok) throw new WeaveError('daemon.rules.manage.only', { space: space.name }, `only those who manage ${space.name} decide what agents and services may do there`);
    const agents = input.agents ? parseVisitorRule(input.agents) : state.visitors?.agents;
    const services = input.services ? parseVisitorRule(input.services) : state.visitors?.services;
    if ((input.agents && !agents) || (input.services && !services)) throw new WeaveError('daemon.rules.who', undefined, 'a rule says who: everyone, approved or nobody (and optionally which kinds they may write)');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_VISITORS, body: { ...(agents ? { agents: agents as unknown as Json } : {}), ...(services ? { services: services as unknown as Json } : {}) } }));
    return this.core.kernel.spaceInfo(space);
  }
  async approveAgent(input: { space: string; agent: string; on?: boolean }): Promise<SpaceInfo> {
    const space = this.core.kernel.space(input.space);
    const state = this.core.kernel.state(space);
    if (space.kind === 'direct') throw new WeaveError('daemon.rules.direct', undefined, 'a direct chat has no rules for agents');
    if (!mayDo(state, this.node.identity.author, 'manage').ok) throw new WeaveError('daemon.approve.manage.only', { space: space.name }, `only those who manage ${space.name} approve agents and services there`);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_AGENT_APPROVE, body: { agent: this.#agentKey(input.agent), on: input.on !== false } }));
    return this.core.kernel.spaceInfo(space);
  }

  /** An agent key from `person/agent` (a person's name or id, the agent's name) or the key itself. */
  #agentKey(ref: string): Did {
    if (isDid(ref) && this.node.replica.authority.grant(ref)?.role === 'agent') return ref;
    const at = ref.lastIndexOf('/');
    if (at > 0) {
      const person = this.node.resolve(ref.slice(0, at));
      // An agent by its name, or a service by its own (its key is named service:<name>).
      const name = ref.slice(at + 1);
      const grant = this.node.replica.authority.grantsOf(person).find((g) => g.role === 'agent' && g.revokedAfter === undefined && (g.name === name || g.name === `${SERVICE_PREFIX}${name}`));
      if (grant) return grant.subject;
    }
    throw new Error(`no agent "${ref}": name it as person/agent (e.g. Lena/claude) or by its key`);
  }

  async agentBlocked(agent: string): Promise<Array<{ id: string; name: string }>> {
    const key = this.core.agents.find((a) => a.name === agent)?.did;
    if (!key) throw noAgentError(agent, this.core.agents.map((a) => a.name));
    // Where its key doesn't count at all (what it may write there is a matter of kinds).
    return [...this.core.spaces.values()]
      .filter((s) => {
        const state = this.core.kernel.state(s);
        if (state.managed) return !state.approvedAgents?.has(key);
        const who = state.visitors?.agents?.who ?? 'everyone';
        return !mayDo(state, this.node.identity.author, 'manage').ok && (who === 'nobody' || (who === 'approved' && !state.approvedAgents?.has(key)));
      })
      .map((s) => ({ id: s.id, name: s.name }));
  }

  async members(ref: string): Promise<MemberInfo[]> {
    const space = this.core.kernel.space(ref);
    const state = this.core.kernel.state(space);
    const lastActive = new Map<Did, string>();
    const agents = new Map<Did, Set<string>>();
    const attested = state.managed?.attestor ? this.core.companies.attestations(space, state.managed.attestor) : new Map();
    for (const entry of this.core.kernel.entries(space)) {
      const { author, signer, time } = entry.event;
      if (time > (lastActive.get(author) ?? '')) lastActive.set(author, time);
      const agent = this.core.agentName(signer, author);
      if (agent) agents.set(author, (agents.get(author) ?? new Set()).add(agent));
    }
    return [...state.members.values()].map((m) => ({
      did: m.did,
      name: this.node.nameOf(m.did),
      since: m.since,
      ...(m.invitedBy ? { invitedBy: m.invitedBy, invitedByName: this.node.nameOf(m.invitedBy) } : {}),
      ...(m.via ? { via: this.core.kernel.groupRef(m.via, state) } : {}),
      ...(space.kind === 'project' && state.maintainers.has(m.did) ? { maintainer: true as const } : {}),
      ...(lastActive.has(m.did) ? { lastActive: lastActive.get(m.did) } : {}),
      agents: [...(agents.get(m.did) ?? [])],
      ...(state.managed?.attestor && attested.get(m.did) ? { attested: (({ time: _time, ...a }) => a)(attested.get(m.did)!) } : {}),
      ...(this.core.companies.companyVouchedOf(m.did) ? { company: this.node.nameOf(this.core.companies.companyVouchedOf(m.did)!) ?? 'a company' } : {}),
    }));
  }

  async leave(ref: string): Promise<void> {
    const space = this.core.kernel.space(ref);
    if (space.kind === 'direct') throw new WeaveError('daemon.leave.direct', undefined, 'a direct chat has no leaving; unfollow or block the person instead');
    const state = this.core.kernel.state(space);
    if (mayDo(state, this.node.identity.author, 'own').ok) {
      const others = [...state.members.keys()].filter((did) => did !== this.node.identity.author);
      throw others.length
        ? new WeaveError('daemon.leave.owner', { space: space.name }, `you own ${space.name}: hand it over to someone first`)
        : new WeaveError('daemon.leave.last', { space: space.name }, `you're the only one in ${space.name}: close it instead`);
    }
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_LEAVE, body: { upTo: this.core.kernel.upTo(this.node.identity.author), at: this.core.kernel.anchor(this.node.identity.author, space) } }));
    // Our node stops following it: keys gone, topics left. The space's history in the logs stays unreadable here.
    this.core.spaces.delete(space.id);
    this.core.kernel.invalidateDecoded();
    removeSpace(this.node.home, space.id);
    this.core.kernel.announceNow();
    for (const topic of spaceTopics(space, 0)) await this.core.network?.leave(topic).catch(() => {});
  }

  async handOver(input: { space: string; to: string }): Promise<SpaceInfo> {
    const space = this.core.kernel.space(input.space);
    const state = this.core.kernel.state(space);
    if (space.kind === 'direct') throw new WeaveError('daemon.handover.direct', undefined, 'a direct chat has no owner');
    if (!mayDo(state, this.node.identity.author, 'own').ok) throw new WeaveError('daemon.handover.owner.only', { space: space.name }, `only the owner, ${this.node.nameOf(state.founder) ?? 'someone else'}, can hand ${space.name} over`);
    if (state.tier) throw new WeaveError('daemon.handover.tier', undefined, 'a membership tier stays with its creator; take it off your hub instead');
    const to = this.node.resolve(input.to);
    if (to === this.node.identity.author) throw new WeaveError('daemon.handover.self', undefined, "that's you");
    if (!state.members.has(to)) throw new WeaveError('daemon.handover.not.member', { who: input.to, space: space.name }, `${input.to} isn't in ${space.name}`);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_HANDOVER, body: { to, upTo: this.core.kernel.upTo(this.node.identity.author), at: this.core.kernel.anchor(this.node.identity.author, space) } }));
    return this.core.kernel.spaceInfo(space);
  }

  async setHistory(input: { space: string; history: HistorySetting }): Promise<SpaceInfo> {
    const space = this.core.kernel.space(input.space);
    const state = this.core.kernel.state(space);
    if (space.kind === 'direct') throw new WeaveError('daemon.history.direct', undefined, 'a direct chat is between two people: there are no newcomers');
    if (!HISTORIES.includes(input.history)) throw new WeaveError('daemon.history.values', undefined, 'history is all (everything), 30d (the last 30 days) or joining (from their invite on)');
    if (!mayDo(state, this.node.identity.author, 'manage').ok)
      throw new WeaveError('daemon.history.manage.only', { space: space.name, kind: space.kind }, space.kind === 'group' ? `only the owner of ${space.name} decides what newcomers read` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} decide what newcomers read`);
    if ((state.history?.value ?? 'all') !== input.history) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_HISTORY, body: { history: input.history } }));
    return this.core.kernel.spaceInfo(space);
  }

  async closeSpace(input: { space: string; closed: boolean }): Promise<SpaceInfo> {
    const space = this.core.kernel.space(input.space);
    const state = this.core.kernel.state(space);
    if (space.kind === 'direct') throw new WeaveError('daemon.close.direct', undefined, "a direct chat can't be closed");
    if (!mayDo(state, this.node.identity.author, 'manage').ok)
      throw new WeaveError('daemon.close.manage.only', { space: space.name, kind: space.kind }, space.kind === 'group' ? `only the owner of ${space.name} can close it` : `only the ${space.kind === 'community' ? 'moderators' : 'maintainers'} of ${space.name} can close it`);
    if (!!state.closed === input.closed) return this.core.kernel.spaceInfo(space);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_CLOSE, body: { closed: input.closed } }));
    return this.core.kernel.spaceInfo(space);
  }


  async removeMember(ref: string, who: string): Promise<void> {
    const space = this.core.kernel.space(ref);
    const state = this.core.kernel.state(space);
    if (!mayDo(state, this.node.identity.author, 'manage').ok) {
      throw new WeaveError('daemon.remove.manage.only', { kind: space.kind }, { project: 'only maintainers can remove people from a project', community: 'only moderators can remove people from a community', group: 'only the group founder can remove members', direct: 'nobody can be removed from a direct chat' }[space.kind]);
    }
    const member = this.node.resolve(who);
    if (!state.members.has(member)) throw new WeaveError('daemon.remove.not.member', { who, space: space.name }, `${who} is not in ${space.name}`);
    if (member === state.founder) throw new WeaveError('daemon.remove.owner', { space: space.name }, `the owner can't be removed from ${space.name}`);
    this.node.replica.write(this.node.identity, sealFor(await this.core.managed.cipherReady(space), { kind: KIND_REMOVE, body: { member, upTo: this.core.kernel.upTo(member), at: this.core.kernel.anchor(member, space) } }));
    const remaining = [...state.members.keys()].filter((did) => did !== member);
    const { fields, epoch, key } = rekey(space, remaining, this.core.encryptionKeyOf);
    space.keys[String(epoch)] = key;
    this.core.kernel.saveSpace(space);
    this.node.replica.write(this.node.identity, fields);
    this.core.managed.afterRekey(space, epoch, key);
  }
  // ---------------------------------------------------------------- communities

  async createCommunity(input: { name: string; description?: string }): Promise<CommunityInfo> {
    const community = await this.core.kernel.createSpace('community', input.name);
    if (input.description) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(community), { kind: KIND_PAGE, body: { description: input.description } }));
    return this.community(community.id);
  }

  async community(ref: string): Promise<CommunityInfo> {
    const community = this.core.kernel.space(ref, 'community');
    const state = this.core.kernel.state(community);
    return {
      ...this.core.kernel.spaceInfo(community),
      kind: 'community',
      description: this.core.kernel.page(community, state).description,
      moderators: [...state.maintainers].map((did) => this.core.kernel.actor(did, did)),
      moderator: state.maintainers.has(this.node.identity.author),
    };
  }

  async setCommunity(input: { community: string; description: string }): Promise<CommunityInfo> {
    const community = this.core.kernel.space(input.community, 'community');
    this.core.kernel.maintainerState(community);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(community), { kind: KIND_PAGE, body: { description: input.description ?? '' } }));
    return this.community(community.id);
  }

  async setModerator(input: { community: string; who: string; on: boolean }): Promise<void> {
    this.core.kernel.appoint(this.core.kernel.space(input.community, 'community'), input.who, input.on);
  }
  async setMaintainer(input: { project: string; who: string; on: boolean }): Promise<void> {
    this.core.kernel.appoint(this.core.kernel.project(input.project), input.who, input.on);
  }

  async inviteGroup(input: { project: string; group: string }): Promise<void> {
    const project = this.core.kernel.project(input.project);
    const state = this.core.kernel.maintainerState(project);
    const group = this.core.kernel.space(input.group, 'group');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: true } }));
    // Inviting the group is the consent for everyone in it right now.
    const newcomers = [...this.core.kernel.state(group).members.keys()].filter((did) => !state.members.has(did));
    this.core.kernel.admitAll(project, group, newcomers);
  }

  async uninviteGroup(input: { project: string; group: string }): Promise<void> {
    const project = this.core.kernel.project(input.project);
    this.core.kernel.maintainerState(project);
    const group = this.core.kernel.knownGroup(project, input.group);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_PROJECT_GROUP, body: { group: group.id, name: group.name, on: false } }));
  }

  async setRule(input: { project: string; group: string; auto: boolean }): Promise<void> {
    const project = this.core.kernel.project(input.project);
    this.core.kernel.maintainerState(project);
    const group = this.core.kernel.knownGroup(project, input.group);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_RULE, body: { group: group.id, auto: input.auto } }));
  }

  async admissions(ref?: string): Promise<Admission[]> {
    const projects = ref ? [this.core.kernel.project(ref)] : [...this.core.spaces.values()].filter((s) => s.kind === 'project');
    const out: Admission[] = [];
    for (const project of projects) {
      const state = this.core.kernel.state(project);
      if (!mayDo(state, this.node.identity.author, 'group').ok) continue;
      for (const change of this.core.kernel.changes(project, state)) out.push(change);
    }
    return out;
  }

  async admit(input: { project: string; who: string; group: string; always?: boolean }): Promise<void> {
    const project = this.core.kernel.project(input.project);
    const state = this.core.kernel.maintainerState(project);
    const group = this.core.kernel.space(input.group, 'group');
    if (!state.groups.has(group.id)) throw new Error(`${group.name} is not invited to ${project.name}`);
    // "Allow for all projects with this group": a standing rule in every project we maintain that invited it.
    if (input.always) {
      for (const other of [...this.core.spaces.values()].filter((s) => s.kind === 'project')) {
        const otherState = this.core.kernel.state(other);
        if (mayDo(otherState, this.node.identity.author, 'group').ok && otherState.groups.has(group.id) && !otherState.groups.get(group.id)!.auto) {
          this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(other), { kind: KIND_RULE, body: { group: group.id, auto: true } }));
        }
      }
    }
    const did = this.node.resolve(input.who);
    if (!state.members.has(did)) this.core.kernel.admitAll(project, group, [did]);
  }

  async decline(input: { project: string; who: string; group: string }): Promise<void> {
    const project = this.core.kernel.project(input.project);
    this.core.kernel.maintainerState(project);
    const group = this.core.kernel.knownGroup(project, input.group);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_DECLINE, body: { member: this.node.resolve(input.who), via: group.id } }));
  }

}
