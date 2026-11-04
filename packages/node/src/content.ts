import { type Attachment, BLOB_TYPES, type Badge, type BlobType, type BoardType, CHOICES, COMMUNITY_BOARD, type Choice, DEFAULT_CHANNEL, type Did, type Entry, type Grantee, ISSUE_STATUSES, type IssueStatus, type Json, KIND_BOARD, KIND_BOARD_ACCESS, KIND_CHANNEL, KIND_CURATE, KIND_ISSUE, KIND_ISSUE_CLAIM, KIND_ISSUE_STATUS, KIND_MSG, KIND_POST, KIND_POST_COAUTHOR, KIND_POST_DELETE, KIND_POST_EDIT, KIND_PROPOSAL, KIND_PROPOSAL_CLOSE, KIND_REACT, KIND_REPLY, KIND_SAVE, KIND_THREAD, KIND_UPVOTE, KIND_VOTE, KIND_VOTE_DELEGATE, type KeyFacts, MAX_COAUTHORS, POST_SORTS, type Post, type PostSort, SAVE_MODES, type SaveMode, type SpaceState, TEXT_LIMITS, WeaveError, attachmentOf, blobRefsIn, boardName, boardRulesOf, channelName, channelsOf, closingUpTo, coauthorsOf, decryptBlob, encryptBlob, fileName, formatBlobRef, isDid, isMediaType, issuesOf, mayDo, mayUse, messagesOf, parseBlobRef, postRefOf, postTargetOf, postsOf, proposalsOf, rank, sceneOf, sealFor, threadsOf, tooLong } from '@weave/core';
import { type Actor, type BoardInfo, type ChannelInfo, type CoauthorRequest, type GranteeInfo, HOME_SOURCES, type InProject, type InSpace, type IssueInfo, type MessageInfo, PROJECT_STATUSES, type PostInfo, type PostsQuery, type ProjectInfo, type ProjectPage, type ProposalInfo, type ReplyInfo, type SessionRef, type ThreadInfo, noAgentError } from './backend.ts';
import type { StoredSpace } from './spacestore.ts';
import type { Access, Board, BoardRule, EventFields, Inner, Issue, Message, PostTarget, Proposal, SessionStamp, SpaceKind, Thread } from '@weave/core';
import type { HomeSource, SpaceInfo } from './backend.ts';
import type { AgentKey } from './keystore.ts';
import type { Holding } from './holding.ts';
import type { ManagedKeys } from './managed.ts';
import type { Payments } from './payments.ts';
import type { Sessions } from './sessions.ts';
import type { SwarmNode } from '@weave/net';
import type { Decoded, WeaveNode } from './node.ts';
import { summary, KIND_PAGE, KIND_PUBLIC_PROJECT } from './shared.ts';
/*
 * Content: posts and their boards, co-authors, upvotes, saves and shares,
 * project pages, images and files, chat, threads, issues, proposals and
 * votes. It sees the node's internals only through ContentCore; the node
 * delegates the Backend methods to it.
 */

/** What Content needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface ContentCore {
  access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access;
  actor(author: Did, signer: Did, session?: SessionStamp): Actor;
  agentMay(name: string, kind: string): void;
  readonly agents: AgentKey[];
  allPosts(): PostInfo[];
  board(space: StoredSpace, boards: Board[], ref: string): Board;
  chatOf(ref: string): Promise<{ space: StoredSpace; post?: string }>;
  decodeAll(): Decoded[];
  readonly directs: Map<string, { space: StoredSpace; peer: Did }>;
  entries(space: StoredSpace): Entry[];
  find(ref: string, kinds: string[]): Decoded & { id: string };
  follows(space: string, board: string, said?: Map<string, boolean>): boolean;
  friends(): Did[];
  readonly holding: Holding;
  homePosts(from?: HomeSource): PostInfo[];
  issueById(issue: Decoded & { id: string }): Promise<IssueInfo>;
  issueInfo(i: Issue): IssueInfo;
  knownGroup(project: StoredSpace, ref: string): { id: string; name: string };
  maintainerState(project: StoredSpace): SpaceState;
  readonly managed: ManagedKeys;
  managers(state: SpaceState): Set<Did>;
  messageInfo(m: Message, byId: Map<string, Message>): MessageInfo;
  page(project: StoredSpace, state: SpaceState): ProjectPage;
  readonly payments: Payments;
  postAt(target: PostTarget): PostInfo;
  /** Blob hashes already asked for from peers this run. */
  readonly prefetched: Set<string>;
  project(ref: string): StoredSpace;
  projectPost(project: StoredSpace): PostInfo | undefined;
  proposalInfo(p: Proposal): ProposalInfo;
  reconcileBoards(project: StoredSpace): Promise<number>;
  ruleInfo(rule: BoardRule): NonNullable<BoardInfo['rule']>;
  sealForSelf(inner: Inner): EventFields;
  /** When this node first saw an event (kept in the home). */
  readonly seenAt: (entry: { id: string }) => string;
  readonly sessions: Sessions;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  spaceInfo(space: StoredSpace): SpaceInfo;
  spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] };
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
  readonly swarm: SwarmNode | undefined;
  threadInfo(t: Thread): ThreadInfo;
  voters(project: StoredSpace): (proposal: Entry) => Set<Did>;
}

export class Content {
  private readonly node: WeaveNode;
  private readonly core: ContentCore;

  constructor(node: WeaveNode, core: ContentCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- posts, boards and upvotes

  async posts(query: PostsQuery = {}): Promise<PostInfo[]> {
    const sort = query.sort ?? 'hot';
    if (!POST_SORTS.includes(sort)) throw new Error(`sort by ${POST_SORTS.join(', ')}`);
    let posts: PostInfo[];
    let pinned: string[] = [];
    if (query.space) {
      const space = this.core.space(query.space);
      if (space.kind === 'group') throw new WeaveError('daemon.posts.group', { space: space.name }, `${space.name} is a group: groups have chat, posts live in projects and communities`);
      const { posts: all, boards } = this.core.spacePosts(space);
      const board = query.board ? this.core.board(space, boards, query.board) : undefined;
      posts = board ? all.filter((p) => p.board === board.name) : all;
      pinned = board?.pinned ?? boards.flatMap((b) => b.pinned);
      if (board && !query.sort) return rank(posts, board.sort, pinned).slice(0, query.limit ?? 200);
    } else if (query.saved) {
      posts = this.core.allPosts().filter((p) => p.saved);
    } else {
      const from = query.from ?? 'all';
      if (!HOME_SOURCES.includes(from)) throw new Error(`show posts from ${HOME_SOURCES.join(', ')}`);
      posts = this.core.homePosts(from);
      pinned = posts.filter((p) => p.saved === 'pinned').map((p) => p.id);
    }
    if (query.saved) posts = posts.filter((p) => p.saved);
    return rank(posts, sort, pinned).slice(0, query.limit ?? 200);
  }

  async post(ref: string): Promise<PostInfo> {
    const target = postTargetOf(ref ?? '');
    if (target) return this.core.postAt(target);
    ref = postRefOf(ref ?? '');
    if (!ref || ref.length < 6) throw new Error('use at least 6 characters of the id');
    const matches = this.core.allPosts().filter((p) => p.id.startsWith(ref));
    if (matches.length === 0) throw new WeaveError('daemon.post.not.found', { id: ref }, `no post found with id ${ref}`);
    if (matches.length > 1) throw new WeaveError('daemon.post.ambiguous', { id: ref }, `id ${ref} is ambiguous — use more characters`);
    const space = matches[0].space && this.core.spaces.get(matches[0].space.id);
    if (space && this.core.holding.pulled(space)) {
      // Opened: kept for 30 days, like anything you read.
      this.core.holding.kept.ids[matches[0].id] = new Date(this.node.clock()).toISOString();
      this.core.holding.saveKept();
    }
    return matches[0];
  }

  /** What an agent writes in a session says which one (by its name, once it has one); the session itself stays yours. */
  #sessionStamp(session: SessionRef | undefined, as: string | undefined): Json | undefined {
    if (!session || !as) return undefined;
    const record = this.core.sessions.sessionRecord(session);
    return record.name ? { name: record.name } : undefined;
  }

  async submit(input: { space: string; board?: string; title: string; text?: string; link?: string; image?: string; scene?: string; with?: string[]; prompt?: string; as?: string; session?: SessionRef }): Promise<PostInfo> {
    const title = input.title?.trim();
    if (!title) throw new WeaveError('daemon.post.title', undefined, 'a post needs a title');
    if (title.length > TEXT_LIMITS.title) throw tooLong('The title', title.length, TEXT_LIMITS.title);
    const link = input.link?.trim();
    if (link && !/^https?:\/\//.test(link)) throw new WeaveError('daemon.post.link', undefined, 'links start with http:// or https://');
    const image = input.image?.trim();
    if (image && !parseBlobRef(image)) throw new WeaveError('daemon.post.image', undefined, 'attach an uploaded image (a wblob: reference)');
    const scene = input.scene?.trim();
    if (scene && !sceneOf(scene)) throw new Error('a scene is its id, like idea or celebrate');
    const space = this.core.space(input.space);
    if (space.kind === 'group') throw new WeaveError('daemon.posts.group', { space: space.name }, `${space.name} is a group: groups have chat, posts live in projects and communities`);
    const body: Record<string, Json> = { title, text: input.text ?? '' };
    if (link) body.link = link;
    if (image) body.image = image;
    if (scene) body.scene = scene;
    const stamp = this.#sessionStamp(input.session, input.as);
    if (stamp) body.session = stamp;
    if (input.with?.length) body.with = this.#coauthorList(space, input.with);
    const prompt = input.prompt?.trim();
    if (prompt && prompt.length > TEXT_LIMITS.prompt) throw tooLong('The starting prompt', prompt.length, TEXT_LIMITS.prompt);
    if (prompt) body.prompt = prompt;
    if (space.kind === 'project') {
      const board = this.core.board(space, this.core.spacePosts(space).boards, input.board ?? 'ideas');
      if (board.type === 'issues') return this.post((await this.openIssue({ project: space.id, title, text: input.text, as: input.as, board: board.name, prompt })).id);
      if (board.type === 'proposals') return this.post((await this.propose({ project: space.id, title, text: input.text, as: input.as, board: board.name })).id);
      body.board = board.name;
    }
    const { id } = await this.node.publish({ kind: KIND_POST, body, space: space.id, as: input.as });
    return this.post(id);
  }

  async confirmCoauthor(input: { post: string; on: boolean; as?: string }): Promise<PostInfo> {
    const post = await this.post(input.post);
    const agent = input.as ? this.core.agents.find((a) => a.name === input.as) : undefined;
    if (input.as && !agent) throw noAgentError(input.as, this.core.agents.map((a) => a.name));
    const me = agent?.did ?? this.node.identity.author;
    const named = this.#namedIn(post.id);
    if (!named) throw new WeaveError('daemon.coauthor.none', undefined, "that post doesn't name any co-authors");
    if (!named.includes(me) && !named.some((did) => this.node.replica.authority.personOf(did) === this.node.identity.author && !agent)) {
      throw agent
        ? new WeaveError('daemon.coauthor.not.agent', { agent: agent.name }, `that post doesn't name ${agent.name} as a co-author`)
        : new WeaveError('daemon.coauthor.not.you', undefined, "that post doesn't name you as a co-author");
    }
    await this.node.publish({ kind: KIND_POST_COAUTHOR, body: { target: post.id, on: input.on }, space: post.space?.id, as: input.as });
    return this.post(post.id);
  }

  async coauthorRequests(): Promise<CoauthorRequest[]> {
    const me = this.node.identity.author;
    const mine = new Map(this.core.agents.map((a) => [a.did, a.name]));
    const out: CoauthorRequest[] = [];
    for (const { posts, entries, space } of this.#postSources()) {
      for (const p of posts) {
        if (!p.with || p.author === me) continue;
        for (const c of coauthorsOf(p, entries, this.keyFacts)) {
          if (c.state !== 'asked' || (c.did !== me && !mine.has(c.did))) continue;
          out.push({
            post: { id: p.id, short: p.id.slice(0, 8), title: p.title, ...(space ? { space: { id: space.id, kind: space.kind, name: space.name } } : {}) },
            by: this.core.actor(p.author, p.signer),
            ...(mine.has(c.did) ? { agent: mine.get(c.did)! } : {}),
            time: p.time,
          });
        }
      }
    }
    return out.sort((a, b) => b.time.localeCompare(a.time));
  }

  keyFacts: KeyFacts = {
    personOf: (key) => this.node.replica.authority.personOf(key),
    isAgent: (key) => this.node.replica.authority.grant(key)?.role === 'agent',
  };

  /** A co-author by name, did:key, your agent's name, or someone's agent as "person·agent". */
  /** Co-authors to name in a space: resolved, each one a member who can confirm. */
  #coauthorList(space: StoredSpace, refs: string[]): Did[] {
    if (refs.length > MAX_COAUTHORS) throw new Error(`name at most ${MAX_COAUTHORS} co-authors`);
    const state = this.core.state(space);
    const named = [...new Set(refs.map((ref) => this.#resolveCoauthor(ref)))];
    for (const did of named) {
      const person = this.node.replica.authority.personOf(did);
      if (!state.members.has(person)) throw new Error(`${this.node.nameOf(person) ?? did} isn't in ${space.name}, so they can't confirm`);
    }
    return named;
  }

  #resolveCoauthor(ref: string): Did {
    const text = ref.trim();
    if (isDid(text)) return text;
    const split = /^(.+?)\s*[·/]\s*([a-z0-9-]+)$/.exec(text);
    if (split) {
      const person = this.node.resolve(split[1]);
      const grant = this.node.replica.authority.grantsOf(person).find((g) => g.role === 'agent' && g.name === split[2] && g.revokedAfter === undefined);
      if (!grant) throw new Error(`${split[1]} has no agent named "${split[2]}"`);
      return grant.subject;
    }
    const mine = this.core.agents.find((a) => a.name === text);
    return mine ? mine.did : this.node.resolve(text);
  }

  /** A key as an actor: an agent shows with its person. */
  keyActor(did: Did) {
    const grant = this.node.replica.authority.grant(did);
    if (grant?.role === 'agent') return { did: grant.author, ...(this.node.nameOf(grant.author) ? { name: this.node.nameOf(grant.author) } : {}), ...(grant.name ? { agent: grant.name } : {}) };
    return { did, ...(this.node.nameOf(did) ? { name: this.node.nameOf(did) } : {}) };
  }

  /** The co-authors a post names, wherever it is. */
  #namedIn(postId: string): Did[] | undefined {
    for (const { posts } of this.#postSources()) {
      const post = posts.find((p) => p.id === postId);
      if (post) return post.with;
    }
    return undefined;
  }

  /** Every post this node can read, with the entries around it: per project and community, and the public ones. */
  #postSources(): Array<{ posts: Post[]; entries: Entry[]; space?: StoredSpace }> {
    const out: Array<{ posts: Post[]; entries: Entry[]; space?: StoredSpace }> = [];
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const entries = this.core.entries(space);
      out.push({ posts: postsOf(space.kind, entries, this.core.state(space).maintainers), entries, space });
    }
    const entries = this.core.decodeAll()
      .filter((d) => !d.space && !d.private)
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    out.push({ posts: postsOf(undefined, entries), entries });
    return out;
  }

  async editPost(input: { post: string; title?: string; text?: string; link?: string; image?: string; scene?: string; with?: string[]; prompt?: string; as?: string }): Promise<PostInfo> {
    const post = await this.#ownPost(input.post, 'edit');
    const body: Record<string, Json> = { target: post.id };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new WeaveError('daemon.post.title', undefined, 'a post needs a title');
      if (title.length > TEXT_LIMITS.title) throw tooLong('The title', title.length, TEXT_LIMITS.title);
      body.title = title;
    }
    if (input.text !== undefined) body.text = input.text;
    if (input.link !== undefined) {
      const link = input.link.trim();
      if (link && !/^https?:\/\//.test(link)) throw new WeaveError('daemon.post.link', undefined, 'links start with http:// or https://');
      body.link = link;
    }
    if (input.prompt !== undefined) body.prompt = input.prompt.trim();
    if (input.image !== undefined) {
      const image = input.image.trim();
      if (image && !parseBlobRef(image)) throw new WeaveError('daemon.post.image', undefined, 'attach an uploaded image (a wblob: reference)');
      body.image = image;
    }
    if (input.scene !== undefined) {
      const scene = input.scene.trim();
      if (scene && !sceneOf(scene)) throw new Error('a scene is its id, like idea or celebrate');
      body.scene = scene;
    }
    if (input.with !== undefined) {
      const space = post.space && this.core.spaces.get(post.space.id);
      if (!space) throw new Error("co-authors are named in the space a post is in, and you aren't in it");
      body.with = this.#coauthorList(space, input.with);
    }
    if (Object.keys(body).length === 1) throw new Error('nothing to change: give a new title, text, link, image, scene or co-authors');
    await this.node.publish({ kind: KIND_POST_EDIT, body, space: post.space?.id, as: input.as });
    return this.post(post.id);
  }

  async deletePost(input: { post: string; as?: string }): Promise<void> {
    const post = await this.#ownPost(input.post, 'delete');
    await this.node.publish({ kind: KIND_POST_DELETE, body: { target: post.id }, space: post.space?.id, as: input.as });
  }

  /** A post you may edit (yours) or delete (yours, or any in a space you maintain or moderate). */
  async #ownPost(ref: string, action: 'edit' | 'delete'): Promise<PostInfo> {
    const post = await this.post(ref);
    if (post.type !== 'post') throw new Error(`only posts can be changed this way; this is a ${post.type}`);
    // Old ideas threads show up as posts too, but are weave.thread events.
    if (!this.core.decodeAll().some((d) => d.inner.kind === KIND_POST && d.id === post.id)) throw new Error('only posts can be changed this way; this is an older thread');
    if (post.by.did === this.node.identity.author) return post;
    const space = post.space && this.core.spaces.get(post.space.id);
    if (action === 'delete' && space && mayDo(this.core.state(space), this.node.identity.author, 'curate').ok) return post;
    throw new Error(action === 'edit' ? 'only its author can edit a post' : `only its author${space ? ` or the ${space.kind === 'community' ? 'moderators' : 'maintainers'}` : ''} can delete a post`);
  }

  async upvote(input: { target: string; value: number; as?: string }): Promise<PostInfo> {
    if (![1, 0, -1].includes(input.value)) throw new Error('upvote with 1, -1, or 0 to take it back');
    const post = await this.post(input.target);
    await this.node.publish({ kind: KIND_UPVOTE, body: { target: post.id, value: input.value }, space: post.space?.id, as: input.as });
    return this.post(post.id);
  }

  async save(input: { target: string; mode: SaveMode | null }): Promise<void> {
    if (input.mode !== null && !SAVE_MODES.includes(input.mode)) throw new Error(`save as ${SAVE_MODES.join(' or ')}, or null to forget`);
    const post = await this.post(input.target);
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_SAVE, body: { target: post.id, mode: input.mode } }));
  }

  async share(input: { post: string; to: string; text?: string }): Promise<PostInfo> {
    const post = await this.post(input.post);
    const project = post.project ? { id: post.project.id, name: post.project.name, description: post.project.description, status: post.project.status, ...(post.project.icon ? { icon: post.project.icon } : {}) } : undefined;
    const text = input.text?.trim() || post.text;
    if (input.to === 'followers') {
      const page = project && this.core.spaces.has(project.id) ? this.core.page(this.core.spaces.get(project.id)!, this.core.state(this.core.spaces.get(project.id)!)) : undefined;
      if (!project || !page?.public) throw new Error('only projects with a public page can be shared with your followers; share other posts into a community');
      const { id } = await this.node.publish({ kind: KIND_POST, body: { title: post.title, text, share: { post: post.id, project } } });
      return this.post(id);
    }
    const target = this.core.space(input.to);
    if (target.kind !== 'community') throw new Error(`share into a community (or "followers"); ${target.name} is a ${target.kind}`);
    const share: Record<string, Json> = { post: post.id, ...(post.space ? { space: { ...post.space } } : {}), ...(project ? { project } : {}) };
    const body: Record<string, Json> = { title: post.title, text, share };
    if (post.link) body.link = post.link;
    if (post.image) body.image = post.image;
    const { id } = await this.node.publish({ kind: KIND_POST, body, space: target.id });
    return this.post(id);
  }

  async boards(ref: string): Promise<BoardInfo[]> {
    const space = this.core.space(ref);
    const { posts, boards } = this.core.spacePosts(space);
    const state = this.core.state(space);
    const access = space.kind === 'project' ? this.core.access(space, state, this.core.entries(space)) : undefined;
    const me = this.node.identity.author;
    const forgetting = boardRulesOf(this.core.entries(space), this.core.managers(state), this.core.seenAt);
    return boards
      .filter((b) => !access || mayUse('read', b.name, me, state, access) || !state.members.has(me))
      .map(({ lens, ...b }) => {
        const inBoard = posts.filter((p) => p.board === b.name);
        const active = inBoard.reduce<string | undefined>((latest, p) => (!latest || p.active > latest ? p.active : latest), undefined);
        const rules = access?.rules.get(b.name);
        const info = (list?: Grantee[]) => list?.map((g) => this.#granteeInfo(g, state));
        return {
          ...b,
          count: inBoard.length,
          ...(active ? { active } : {}),
          access: { ...(rules?.read ? { read: info(rules.read) } : {}), ...(rules?.write ? { write: info(rules.write) } : {}) },
          canWrite: !access || !rules?.write || mayUse('write', b.name, me, state, access),
          ...(space.kind === 'project' ? { following: this.core.follows(space.id, b.name) } : {}),
          ...(forgetting.get(b.name) ? { rule: this.core.ruleInfo(forgetting.get(b.name)!) } : {}),
          ...(lens ? { lens: { name: lens.name, tag: lens.tag, mode: lens.mode, release: lens.origin.release } } : {}),
        };
      });
  }

  async setBoardAccess(input: { project: string; board: string; read?: string[] | null; write?: string[] | null }): Promise<BoardInfo[]> {
    const project = this.core.project(input.project);
    const state = this.core.maintainerState(project);
    const board = this.core.board(project, this.core.spacePosts(project).boards, input.board);
    const before = this.core.access(project, state, this.core.entries(project)).rules.get(board.name) ?? {};
    const grantees = (list: string[] | null | undefined, keep?: Grantee[]): Grantee[] | null => {
      if (list === null) return null;
      if (list === undefined) return keep ?? null;
      return list.map((ref) => {
        if (ref.startsWith('group:')) return { group: this.core.knownGroup(project, ref.slice(6)).id };
        const did = this.node.resolve(ref);
        if (!state.members.has(did)) throw new Error(`${ref} isn't in ${project.name}`);
        return { person: did };
      });
    };
    const read = grantees(input.read, before.read);
    const write = grantees(input.write, before.write);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_BOARD_ACCESS, body: { board: board.name, read: read as unknown as Json, write: write as unknown as Json } }));
    await this.core.reconcileBoards(project);
    return this.boards(project.id);
  }

  #granteeInfo(g: Grantee, state: SpaceState): GranteeInfo {
    if ('person' in g) return { person: g.person, ...(this.node.nameOf(g.person) ? { name: this.node.nameOf(g.person) } : {}) };
    return { group: g.group, name: this.core.spaces.get(g.group)?.name ?? state.groups.get(g.group)?.name ?? 'group' };
  }

  async setBoard(input: { project: string; name: string; title?: string; type?: BoardType; sort?: PostSort; position?: number; on?: boolean }): Promise<BoardInfo[]> {
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    const name = boardName(input.name);
    if (!name) throw new Error('board names use letters, digits and dashes');
    if (input.sort !== undefined && !POST_SORTS.includes(input.sort)) throw new Error(`sort by ${POST_SORTS.join(', ')}`);
    const body: Record<string, Json> = { name };
    const isNew = !(await this.boards(project.id)).some((b) => b.name === name);
    const title = input.title ?? (isNew ? input.name : undefined);
    if (title !== undefined) body.title = title.trim().slice(0, 40);
    if (input.type !== undefined) body.type = input.type;
    if (input.sort !== undefined) body.sort = input.sort;
    if (input.position !== undefined) body.position = input.position;
    if (input.on === false) body.on = false;
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), { kind: KIND_BOARD, body }));
    return this.boards(project.id);
  }

  async curate(input: { space: string; board?: string; pinned: string[] }): Promise<BoardInfo[]> {
    const space = this.core.space(input.space);
    this.core.maintainerState(space);
    const { posts, boards } = this.core.spacePosts(space);
    const board = this.core.board(space, boards, input.board ?? (space.kind === 'community' ? COMMUNITY_BOARD : ''));
    const pinned = (input.pinned ?? []).map((ref) => {
      const match = posts.filter((p) => p.board === board.name && p.id.startsWith(ref));
      if (match.length !== 1) throw new Error(`no single post ${ref} in ${board.title}`);
      return match[0].id;
    });
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_CURATE, body: { board: board.name, pinned } }));
    return this.boards(space.id);
  }

  // ---------------------------------------------------------------- projects

  async project(ref: string): Promise<ProjectInfo> {
    const project = this.core.project(ref);
    const state = this.core.state(project);
    const post = this.core.projectPost(project);
    return {
      ...this.core.spaceInfo(project),
      kind: 'project',
      page: this.core.page(project, state),
      maintainers: [...state.maintainers].map((did) => this.core.actor(did, did)),
      groups: [...state.groups.values()].map((g) => ({ id: g.id, name: this.core.spaces.get(g.id)?.name ?? g.name, auto: g.auto })),
      maintainer: state.maintainers.has(this.node.identity.author),
      ...(post ? { post } : {}),
    };
  }

  async setProjectPage(input: { project: string; as?: string } & Partial<ProjectPage>): Promise<ProjectInfo> {
    const project = this.core.project(input.project);
    const state = this.core.maintainerState(project);
    if (input.as) this.core.agentMay(input.as, KIND_PAGE);
    if (input.status !== undefined && !PROJECT_STATUSES.includes(input.status)) throw new Error(`status is one of ${PROJECT_STATUSES.join(', ')}`);
    for (const image of [input.icon, input.banner]) if (image && !parseBlobRef(image)) throw new Error('icons and banners are uploaded images (wblob: references)');
    const before = this.core.page(project, state);
    // Older callers set only the description: that is the body.
    const pageBody = input.body ?? (input.description !== undefined && input.subtitle === undefined ? input.description : before.body);
    const subtitle = (input.subtitle ?? before.subtitle).trim();
    const pageTitle = (input.title ?? before.title).trim();
    if (pageBody.length > TEXT_LIMITS.page) throw tooLong('The page', pageBody.length, TEXT_LIMITS.page);
    if (subtitle.length > TEXT_LIMITS.pageSubtitle) throw tooLong('The subtitle', subtitle.length, TEXT_LIMITS.pageSubtitle);
    if (pageTitle.length > TEXT_LIMITS.pageTitle) throw tooLong('The title', pageTitle.length, TEXT_LIMITS.pageTitle);
    // An empty string removes an image; undefined keeps it.
    const icon = input.icon === undefined ? before.icon : input.icon || undefined;
    const banner = input.banner === undefined ? before.banner : input.banner || undefined;
    const page: ProjectPage = {
      title: pageTitle,
      subtitle,
      body: pageBody,
      ...(icon ? { icon } : {}),
      ...(banner ? { banner } : {}),
      description: subtitle || summary(pageBody),
      status: input.status ?? before.status,
      public: input.public ?? before.public,
    };
    if (input.as && (page.public || before.public)) this.core.agentMay(input.as, KIND_PUBLIC_PROJECT);
    await this.node.publish({ kind: KIND_PAGE, body: { ...page }, space: project.id, as: input.as });
    // Public projects keep a public copy of their page; making it private publishes a withdrawal.
    if (page.public || before.public) {
      const body: Record<string, Json> = page.public
        ? { project: project.id, name: project.name, title: page.title, subtitle: page.subtitle, ...(page.icon ? { icon: page.icon } : {}), description: page.description, status: page.status, public: true }
        : { project: project.id, public: false };
      await this.node.publish({ kind: KIND_PUBLIC_PROJECT, body, as: input.as });
    }
    return this.project(project.id);
  }

  // ---------------------------------------------------------------- images

  async putBlob(input: { data: string; type: string }): Promise<string> {
    if (!BLOB_TYPES.includes(input.type as BlobType)) throw new Error(`images are ${BLOB_TYPES.map((t) => t.slice(6).toUpperCase()).join(', ')}`);
    const { data, ref } = encryptBlob(new Uint8Array(Buffer.from(input.data, 'base64')), input.type as BlobType);
    this.node.blobs.put(data);
    return `wblob:${ref.hash}.${ref.key}`;
  }

  /** A file of any type, to attach to a chat message: encrypted and stored here, where the others fetch it from. */
  async putFile(input: { data: string; name: string; type: string }): Promise<Attachment> {
    const name = fileName(input.name);
    if (!name) throw new Error('a file needs a name (no path, at most 200 characters)');
    if (!isMediaType(input.type)) throw new Error('a file needs a media type, like image/png or application/pdf');
    const bytes = new Uint8Array(Buffer.from(input.data, 'base64'));
    const { data, ref } = encryptBlob(bytes, input.type);
    this.node.blobs.put(data);
    return { ref: formatBlobRef(ref), name, size: bytes.length, type: input.type };
  }

  async blob(text: string): Promise<{ data: string; type: string }> {
    const ref = parseBlobRef(text);
    if (!ref) throw new Error('not a file reference (wblob:…)');
    const stored = await this.node.blobs.fetch(ref.hash, (hashes) => this.core.swarm?.want(hashes));
    const { bytes, type } = decryptBlob(stored, ref.key);
    return { data: Buffer.from(bytes).toString('base64'), type };
  }

  /** Ask peers ahead of time for images in what we can read, so they show at once and we can pass them on. */
  prefetchBlobs(): void {
    if (!this.core.swarm) return;
    const missing: string[] = [];
    for (const d of this.core.decodeAll()) {
      if (!d.space) continue;
      for (const ref of blobRefsIn(JSON.stringify(d.inner.body ?? ''))) {
        if (this.core.prefetched.has(ref.hash) || this.node.blobs.has(ref.hash)) continue;
        this.core.prefetched.add(ref.hash);
        missing.push(ref.hash);
      }
    }
    // Badge pictures are public: holders show them next to their name.
    for (const series of this.core.payments.allBadges().series) {
      const ref = parseBlobRef(series.image);
      if (!ref || this.core.prefetched.has(ref.hash) || this.node.blobs.has(ref.hash)) continue;
      this.core.prefetched.add(ref.hash);
      missing.push(ref.hash);
    }
    for (const hash of missing.slice(0, 64)) {
      this.node.blobs.fetch(hash, (hashes) => this.core.swarm?.want(hashes), 120_000).catch(() => this.core.prefetched.delete(hash));
    }
  }
  // ---------------------------------------------------------------- chat

  async channels(ref: string): Promise<ChannelInfo[]> {
    return channelsOf(this.core.entries(this.core.space(ref)));
  }

  async createChannel(input: InSpace & { name: string; topic?: string }): Promise<ChannelInfo> {
    const name = channelName(input.name);
    if (!name) throw new Error('channel names use letters, digits and dashes');
    if ((await this.channels(input.space)).some((c) => c.name === name)) throw new Error(`#${name} already exists`);
    await this.node.publish({ kind: KIND_CHANNEL, body: { name, topic: input.topic ?? '' }, space: input.space, as: input.as });
    return (await this.channels(input.space)).find((c) => c.name === name)!;
  }

  async messages(ref: string | undefined, options: { channel?: string; post?: string; limit?: number; since?: string; until?: string; people?: boolean } = {}): Promise<MessageInfo[]> {
    const chat = options.post ? await this.core.chatOf(options.post) : undefined;
    const space = chat?.space ?? this.core.space(ref ?? '');
    const entries = this.core.entries(space);
    const maintainers = this.core.state(space).maintainers;
    const byId = new Map(messagesOf(entries, {}, maintainers).concat(chat?.post ? messagesOf(entries, { post: chat.post }, maintainers) : []).map((m) => [m.id, m]));
    const channel = options.channel ? (channelName(options.channel) ?? DEFAULT_CHANNEL) : undefined;
    const time = (what: string, value: string | undefined) => {
      if (value === undefined) return undefined;
      const at = Date.parse(value);
      if (Number.isNaN(at)) throw new Error(`${what} is a time, like 2026-11-02T12:00:00Z`);
      return new Date(at).toISOString();
    };
    const [since, until] = [time('since', options.since), time('until', options.until)];
    return messagesOf(entries, chat?.post ? { post: chat.post } : { channel }, maintainers)
      .filter((m) => (!since || m.time >= since) && (!until || m.time <= until))
      .map((m) => this.core.messageInfo(m, byId))
      // What people wrote themselves: not their agents (nor their services, which sign as agents too).
      .filter((m) => !options.people || !m.by.agent)
      .slice(-(options.limit ?? 200));
  }

  async say(input: { space?: string; as?: string; text?: string; channel?: string; post?: string; replyTo?: string; file?: Attachment; session?: SessionRef }): Promise<MessageInfo> {
    const text = input.text?.trim() ?? '';
    const file = input.file ? attachmentOf({ file: input.file }) : undefined;
    if (input.file && !file) throw new Error('a file goes with its wblob: reference, a name, its size in bytes and a media type (use putFile)');
    if (!text && !file) throw new Error('a message needs text or a file');
    // The sender holds the blob: that's where the others fetch it from.
    if (file && !this.node.blobs.has(parseBlobRef(file.ref)!.hash)) throw new Error("that file isn't stored here: upload it first (putFile)");
    const body: Record<string, Json> = { text };
    if (file) body.file = { ...file };
    const chat = input.post ? await this.core.chatOf(input.post) : undefined;
    const space = chat?.space ?? this.core.space(input.space ?? '');
    const peer = this.core.directs.get(space.id)?.peer;
    if (peer && !this.core.friends().includes(peer)) throw new Error(`${this.node.nameOf(peer) ?? 'they'} and you aren't friends any more, so this chat is read-only`);
    if (chat?.post) body.post = chat.post;
    else {
      const channel = input.channel ? channelName(input.channel) : undefined;
      if (input.channel && !channel) throw new Error('channel names use letters, digits and dashes');
      if (channel && channel !== DEFAULT_CHANNEL) body.channel = channel;
    }
    if (input.replyTo) body.replyTo = this.core.find(input.replyTo, [KIND_MSG, KIND_REPLY]).id;
    const stamp = this.#sessionStamp(input.session, input.as);
    if (stamp) body.session = stamp;
    const { id } = await this.node.publish({ kind: KIND_MSG, body, space: space.id, as: input.as });
    return (await this.messages(space.id, chat?.post ? { post: chat.post } : { channel: input.channel })).find((m) => m.id === id)!;
  }

  /** Take a chat message down: yours, or any in a space you maintain or moderate. It stays in the logs, out of sight. */
  async deleteMessage(input: { message: string; as?: string }): Promise<void> {
    const message = this.core.find(input.message, [KIND_MSG, KIND_REPLY]);
    const space = message.space && this.core.spaces.get(message.space.id);
    const mine = message.event.author === this.node.identity.author;
    if (!mine && !(space && mayDo(this.core.state(space), this.node.identity.author, 'curate').ok))
      throw new Error(`only its author${space && space.kind !== 'direct' ? ` or the ${space.kind === 'community' ? 'moderators' : space.kind === 'project' ? 'maintainers' : 'owner'}` : ''} can delete a message`);
    await this.node.publish({ kind: KIND_POST_DELETE, body: { target: message.id }, space: space?.id, as: input.as });
  }

  async react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void> {
    const emoji = input.emoji?.trim();
    if (!emoji || emoji.length > 16) throw new Error('react with one emoji');
    const target = this.core.find(input.target, [KIND_MSG, KIND_POST, KIND_THREAD, KIND_REPLY, KIND_ISSUE, KIND_PROPOSAL]);
    await this.node.publish({ kind: KIND_REACT, body: { target: target.id, emoji, on: input.on ?? true }, space: target.space?.id, as: input.as });
  }

  // ---------------------------------------------------------------- working together, in projects

  async threads(ref: string): Promise<ThreadInfo[]> {
    return threadsOf(this.core.entries(this.core.project(ref))).map((t) => this.core.threadInfo(t));
  }

  async startThread(input: InProject & { title: string; text?: string }): Promise<ThreadInfo> {
    if (!input.title?.trim()) throw new Error('a thread needs a title');
    const project = this.core.project(input.project);
    const { id } = await this.node.publish({ kind: KIND_THREAD, body: { title: input.title.trim(), text: input.text ?? '' }, space: project.id, as: input.as });
    return (await this.threads(project.id)).find((t) => t.id === id)!;
  }

  async reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo> {
    if (!input.text?.trim()) throw new Error('a reply needs text');
    const target = this.core.find(input.target, [KIND_THREAD, KIND_ISSUE, KIND_PROPOSAL]);
    const item = await this.node.publish({ kind: KIND_REPLY, body: { target: target.id, text: input.text.trim() }, space: target.space?.id, as: input.as });
    return { id: item.id, by: this.core.actor(item.author, item.signer), text: input.text.trim(), time: item.time };
  }

  async issues(ref: string): Promise<IssueInfo[]> {
    return issuesOf(this.core.entries(this.core.project(ref))).map((i) => this.core.issueInfo(i));
  }

  async openIssue(input: InProject & { title: string; text?: string; labels?: string[]; board?: string; prompt?: string }): Promise<IssueInfo> {
    if (!input.title?.trim()) throw new Error('an issue needs a title');
    const project = this.core.project(input.project);
    const body: Record<string, Json> = { title: input.title.trim(), text: input.text ?? '', labels: input.labels ?? [] };
    if (input.board) body.board = input.board;
    if (input.prompt?.trim()) body.prompt = input.prompt.trim();
    const { id } = await this.node.publish({ kind: KIND_ISSUE, body, space: project.id, as: input.as });
    return (await this.issues(project.id)).find((i) => i.id === id)!;
  }

  async claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo> {
    const issue = this.core.find(input.issue, [KIND_ISSUE]);
    await this.node.publish({ kind: KIND_ISSUE_CLAIM, body: { issue: issue.id }, space: issue.space?.id, as: input.as });
    return this.core.issueById(issue);
  }

  async setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo> {
    if (!ISSUE_STATUSES.includes(input.status)) throw new Error(`status must be one of ${ISSUE_STATUSES.join(', ')}`);
    const issue = this.core.find(input.issue, [KIND_ISSUE]);
    await this.node.publish({ kind: KIND_ISSUE_STATUS, body: { issue: issue.id, status: input.status }, space: issue.space?.id, as: input.as });
    return this.core.issueById(issue);
  }

  async proposals(ref: string): Promise<ProposalInfo[]> {
    const project = this.core.project(ref);
    return proposalsOf(this.core.entries(project), this.core.voters(project)).map((p) => this.core.proposalInfo(p));
  }

  async propose(input: InProject & { title: string; text?: string; hours?: number; quorum?: number; board?: string }): Promise<ProposalInfo> {
    if (!input.title?.trim()) throw new Error('a proposal needs a title');
    const project = this.core.project(input.project);
    const deadline = new Date(Date.now() + (input.hours ?? 72) * 3600_000).toISOString();
    const body: Record<string, Json> = { title: input.title.trim(), text: input.text ?? '', deadline };
    if (input.quorum) body.quorum = input.quorum;
    if (input.board) body.board = input.board;
    const { id } = await this.node.publish({ kind: KIND_PROPOSAL, body, space: project.id, as: input.as });
    return (await this.proposals(project.id)).find((p) => p.id === id)!;
  }

  async vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo> {
    if (!CHOICES.includes(input.choice)) throw new Error(`vote ${CHOICES.join(', ')}`);
    const proposal = this.core.find(input.proposal, [KIND_PROPOSAL]);
    if (proposal.space?.kind !== 'project') throw new Error('votes happen inside projects');
    await this.node.publish({ kind: KIND_VOTE, body: { proposal: proposal.id, choice: input.choice }, space: proposal.space.id, as: input.as });
    return (await this.proposals(proposal.space.id)).find((p) => p.id === proposal.id)!;
  }
  /**
   * Close our proposals whose deadline passed: name the last number of each
   * voting key we hold, so votes signed later don't count, whatever date they
   * claim. Votes still on their way when we close don't count either.
   */
  async closeProposals(): Promise<number> {
    const now = new Date(this.node.clock()).toISOString();
    let closed = 0;
    for (const space of [...this.core.spaces.values()]) {
      if (space.kind !== 'project') continue;
      const entries = this.core.entries(space);
      for (const p of entries) {
        if (p.kind !== KIND_PROPOSAL || p.event.author !== this.node.identity.author) continue;
        const deadline = typeof (p.body as { deadline?: unknown } | null)?.deadline === 'string' ? (p.body as { deadline: string }).deadline : '';
        if (!deadline || deadline > now) continue;
        if (entries.some((e) => e.kind === KIND_PROPOSAL_CLOSE && e.event.author === this.node.identity.author && (e.body as { proposal?: unknown } | null)?.proposal === p.id)) continue;
        await this.node.publish({ kind: KIND_PROPOSAL_CLOSE, body: { proposal: p.id, upTo: closingUpTo(p, entries) }, space: space.id });
        closed++;
      }
    }
    return closed;
  }

  async delegateVote(input: { project: string; who?: string }): Promise<void> {
    const project = this.core.project(input.project);
    const to = input.who ? this.node.resolve(input.who) : null;
    if (to === this.node.identity.author) throw new Error('you cannot delegate to yourself');
    await this.node.publish({ kind: KIND_VOTE_DELEGATE, body: { to }, space: project.id });
  }

  async votingDelegate(ref: string): Promise<Actor | null> {
    let to: unknown = null;
    for (const entry of this.core.entries(this.core.project(ref))) {
      if (entry.kind === KIND_VOTE_DELEGATE && entry.event.author === this.node.identity.author) to = (entry.body as { to?: unknown } | null)?.to ?? null;
    }
    return isDid(to) ? this.core.actor(to, to) : null;
  }
}
