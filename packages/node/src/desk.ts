import { type BoardInfo, type DeskInfo, type GranteeInfo, type PermissionRequest, type PostInfo, type ProjectPage, type RoutineInfo, type SessionInfo, type SessionRef, type WorkTarget } from './backend.ts';
import { AppLogFollower, recentSessions, transcriptActive, transcriptTitle } from './claudecode.ts';
import { type StoredSpace } from './spacestore.ts';
import { type Access, type Board, boardName, type BoardRule, boardRulesOf, type BoardType, COMMUNITY_BOARD, dayKey, type Did, dueOccurrence, type Entry, type EventFields, type Grantee, type Inner, isDid, type Json, type KeyFacts, KIND_BOARD, KIND_BOARD_ACCESS, KIND_CURATE, KIND_POST, KIND_POST_DELETE, KIND_POST_EDIT, KIND_ROUTINE, KIND_SAVE, KIND_SESSION, KIND_UPVOTE, MAX_COAUTHORS, mayAct, mayUse, nextRun, parseBlobRef, parseCreate, parseTrigger, type Post, POST_SORTS, postsOf, type PostSort, pushOnto, renderTitle, reorder, type Routine, routinesOf, SAVE_MODES, type SaveMode, sealFor, sessionKey, type SessionRecord, sessionsOf, type SpaceKind, type SpaceState, type StackItem, takeOff, TEXT_LIMITS, tooLong } from '@weave/core';
import { ManagedKeys } from './managed.ts';
import { Services } from './services.ts';
import { type AgentKey } from './keystore.ts';
import { saveConfig } from './config.ts';
import { isAbsolute, join as joinPath, resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { writeJson } from './home.ts';
import { type WeaveNode, type Decoded } from './node.ts';

/*
 * Agent sessions and their stacks of work items, and your desk: the private
 * project its daily journal and ideas live in, the daily driver session, and
 * routines that make work items on time. It sees the node's internals only
 * through DeskCore.
 */



/**
 * One person's node: their keys, their replica of the logs they know, the
 * groups and projects they belong to, and optionally a live connection to
 * peers. The CLI uses it directly when no daemon runs; the daemon wraps it
 * with networking and the HTTP API.
 */
/** The routines a new desk starts with. */
const DESK_ROUTINES: Array<{ id: string; name: string; trigger: RoutineInfo['trigger']; create: RoutineInfo['create'] }> = [
  {
    id: 'journal',
    name: 'Journal entry',
    trigger: { type: 'schedule', days: [1, 2, 3, 4, 5], time: '08:00' },
    create: {
      board: 'journal',
      title: '{date}',
      text: '## Plan\n\n- \n\n## Notes\n\n## Done\n',
      prompt:
        "This is today's journal entry, and our planning for the day. Start by reading yesterday's entry, my open work items and what's hot in my projects, then propose a plan for today and keep it in this entry's text (weave_edit_post). Listen and ask while I journal; when something deserves work, create a work item in the project it belongs to, with a clear starting prompt, and tell me where you put it.",
    },
  },
  {
    id: 'setup',
    name: 'Set up your desk',
    trigger: { type: 'first-start' },
    create: {
      board: 'ideas',
      title: 'Set up your desk',
      text: 'Your desk is new: a Journal (one entry per weekday, from the Journal entry routine) and Ideas. Ctrl+click this item to set it up with your daily driver.',
      prompt:
        "Help me set up my Weave desk; this session is my daily driver from now on. If you can, name this session \"Daily driver\" and put it in a sidebar group \"Desk\" in the Claude app. Then look at who I am and my projects (weave_whoami), ask how I like to plan my days, suggest routines that would help (a time for the journal entry, a standup, a backlog check), and write what you learn about how I work into this folder's CLAUDE.md.",
    },
  },
];

/** The CLAUDE.md a new desk folder starts with: who the daily driver works for and how. */
function deskInstructions(person: string, desk: string): string {
  return `# Weave desk

This folder is where my daily driver works: the Claude Code sessions where we
plan, journal and hand out work, with Weave. (Weave wrote this file once; it's
mine now, change it as you learn how I work.)

## Who and where

- I'm ${person}. In Weave you act as my agent; your tools are the weave_* ones.
- My desk is the private project "${desk}": Journal (one entry per weekday) and
  Ideas. My other projects are where the real work lives.

## How we work

- A work item is a Weave post with a starting prompt (what to do with it).
  Your session has a stack of work items (weave_session): the top one is what
  we're on. Items I start from Weave arrive as "Weave work item: …" messages.
- Today's journal entry is our planning: keep the plan in its text, and turn
  what deserves it into work items in the right project, each with a clear
  starting prompt. Say where you put them, as links.
- When something interrupts, put it on top of the stack (weave_work_on); when
  it's done, weave_done, and tell me what we're back to.
- Folders and projects aren't one to one. To start work elsewhere, use a
  folder Weave knows for that project; if none fits, ask me, or ask to create
  one. Never guess a folder you haven't seen used for that project.
- When you mention a post, link it with its url.
`;
}

/** What Desk needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface DeskCore {
  allPosts(): PostInfo[];
  readonly appLog: AppLogFollower | undefined;
  readonly spaces: Map<string, StoredSpace>;
  spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] };
  maintainerState(project: StoredSpace): SpaceState;
  board(space: StoredSpace, boards: Board[], ref: string): Board;
  readonly managed: ManagedKeys;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  entries(space: StoredSpace): Entry[];
  state(space: StoredSpace): SpaceState;
  readonly services: Services;
  decodeAll(): Decoded[];
  sealForSelf(inner: Inner): EventFields;
  requests(): PermissionRequest[];
  readonly agents: AgentKey[];
  readonly requestsFile: string;
  page(project: StoredSpace, state: SpaceState): ProjectPage;
  access(space: StoredSpace, state: SpaceState, entries: Entry[]): Access;
  managers(state: SpaceState): Set<Did>;
  readonly seenAt: (entry: { id: string }) => string;
  follows(space: string, board: string, said?: Map<string, boolean>): boolean;
  ruleInfo(rule: BoardRule): NonNullable<BoardInfo['rule']>;
  project(ref: string): StoredSpace;
  knownGroup(project: StoredSpace, ref: string): { id: string; name: string };
  reconcileBoards(project: StoredSpace): Promise<number>;
}

export class Desk {
  private readonly node: WeaveNode;
  private readonly core: DeskCore;

  constructor(node: WeaveNode, core: DeskCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- sessions and their stacks

  /** A session Ctrl+click is opening for an item (see expectSession). */
  expected?: { post: string; folder?: string; until: number };

  async sessions(): Promise<SessionInfo[]> {
    const posts = new Map(this.core.allPosts().map((p) => [p.id, p]));
    return [...this.sessionRecords().values()].sort((a, b) => b.time.localeCompare(a.time)).map((r) => this.sessionInfo(r, posts));
  }

  async activeSessions(input: { hours?: number } = {}): Promise<SessionInfo[]> {
    const hours = Math.min(Math.max(input.hours ?? 12, 1), 24 * 14);
    const posts = new Map(this.core.allPosts().map((p) => [p.id, p]));
    const records = this.sessionRecords();
    const out = new Map([...records.values()].map((r) => [sessionKey(r.provider, r.id), this.sessionInfo(r, posts)]));
    for (const recent of recentSessions(Date.now() - hours * 3600 * 1000)) {
      const key = sessionKey('claude-code', recent.id);
      if (out.has(key)) continue;
      out.set(key, this.sessionInfo({ provider: 'claude-code', id: recent.id, ...(recent.folder ? { folder: recent.folder } : {}), stack: [], time: recent.active }, posts));
    }
    const when = (s: SessionInfo) => s.active ?? s.time;
    return [...out.values()].sort((a, b) => when(b).localeCompare(when(a)));
  }

  async focusedSession(): Promise<SessionInfo | null> {
    const focus = this.core.appLog?.current;
    if (!focus) return null;
    // Before the app has said which Claude Code session it is, it's known by the app's id alone.
    return this.session({ provider: 'claude-code', id: focus.id ?? focus.host, host: focus.host });
  }

  async session(input: SessionRef): Promise<SessionInfo> {
    return this.sessionInfo(this.sessionRecord(input), new Map(this.core.allPosts().map((p) => [p.id, p])));
  }

  async workOn(input: { session: SessionRef; post?: string; create?: { space: string; board?: string; title: string; text?: string; prompt?: string }; as?: string }): Promise<SessionInfo> {
    if (!input.post === !input.create) throw new Error('name a post to work on, or create one (not both)');
    const post = input.post ? await this.node.post(input.post) : await this.node.submit({ ...input.create!, as: input.as });
    const record = this.sessionRecord(input.session);
    // The first session that takes on a desk item becomes your daily driver: the desk's items go to it from then on.
    const desk = this.node.config.desk;
    if (desk && !desk.driver && post.space?.id === desk.space) {
      this.node.config = { ...this.node.config, desk: { ...desk, driver: { provider: record.provider, id: record.id, ...(record.host ? { host: record.host } : {}), ...(record.folder ? { folder: record.folder } : {}) } } };
      saveConfig(this.node.home, this.node.config);
    }
    return this.saveSession({ ...record, stack: pushOnto(record.stack, post.id, new Date().toISOString()) });
  }

  async doneWith(input: { session: SessionRef; post?: string; close?: boolean; as?: string }): Promise<SessionInfo> {
    const record = this.sessionRecord(input.session);
    const id = input.post ? (await this.node.post(input.post)).id : record.stack[0]?.post;
    if (!id) throw new Error('this session has no work items');
    if (!record.stack.some((s) => s.post === id)) throw new Error("that post isn't on this session's stack");
    if (input.close) {
      const post = await this.node.post(id);
      if (post.type === 'issue' && post.issue?.status !== 'done') await this.node.setIssueStatus({ issue: id, status: 'done', as: input.as });
    }
    return this.saveSession({ ...record, stack: takeOff(record.stack, id, new Date().toISOString()) });
  }

  async restack(input: { session: SessionRef; posts?: string[]; remove?: string[] }): Promise<SessionInfo> {
    const record = this.sessionRecord(input.session);
    const ids = async (refs: string[] = []) => Promise.all(refs.map(async (ref) => (await this.node.post(ref)).id));
    const remove = new Set(await ids(input.remove));
    const stack = reorder(record.stack, await ids(input.posts)).filter((s) => !remove.has(s.post));
    return this.saveSession({ ...record, stack });
  }

  // ---------------------------------------------------------------- your desk and its routines

  async desk(): Promise<DeskInfo | null> {
    const desk = this.node.config.desk;
    const space = desk && this.core.spaces.get(desk.space);
    return space ? { space: { id: space.id, kind: space.kind, name: space.name }, ...(desk.folder ? { folder: desk.folder } : {}), ...(desk.driver ? { driver: desk.driver } : {}) } : null;
  }

  /** Where your desk's folder is, or goes by default. */
  async deskFolder(): Promise<string> {
    return this.node.config.desk?.folder ?? joinPath(homedir(), 'Weave Desk');
  }

  async setupDesk(input: { name?: string; folder?: string } = {}): Promise<DeskInfo> {
    let desk = await this.desk();
    if (!desk) {
      const project = await this.node.createProject({ name: input.name?.trim() || 'Desk', description: 'My desk: journal, ideas and routines. Private.' });
      await this.setBoard({ project: project.id, name: 'journal', title: 'Journal', type: 'posts', sort: 'new', position: 0 });
      await this.setBoard({ project: project.id, name: 'releases', on: false });
      await this.setBoard({ project: project.id, name: 'proposals', on: false });
      this.node.config = { ...this.node.config, desk: { space: project.id } };
      saveConfig(this.node.home, this.node.config);
      desk = (await this.desk())!;
      for (const routine of DESK_ROUTINES) await this.setRoutine({ space: project.id, ...routine });
    }
    // The folder where the daily driver works, with its instructions (yours to change: never overwritten).
    // A bare name is a folder in your user folder, not wherever the daemon happens to run.
    const asked = input.folder?.trim();
    const folder = asked ? (isAbsolute(asked) ? resolvePath(asked) : joinPath(homedir(), asked)) : (desk.folder ?? joinPath(homedir(), 'Weave Desk'));
    const previous = desk.folder;
    mkdirSync(folder, { recursive: true });
    const instructions = joinPath(folder, 'CLAUDE.md');
    if (!existsSync(instructions)) writeFileSync(instructions, deskInstructions(this.node.nameOf(this.node.identity.author) ?? 'me', desk.space.name));
    // A desk that moved: the old folder isn't suggested for it any more.
    const known = (this.node.config.spaceFolders?.[desk.space.id] ?? []).filter((f) => f !== previous || f === folder);
    this.node.config = { ...this.node.config, desk: { ...this.node.config.desk, space: desk.space.id, folder }, spaceFolders: { ...this.node.config.spaceFolders, [desk.space.id]: known } };
    saveConfig(this.node.home, this.node.config);
    await this.rememberFolder({ space: desk.space.id, folder });
    // First start: the routines that run once, now.
    for (const routine of (await this.routines({ space: desk.space.id })).filter((r) => r.on && r.trigger.type === 'first-start')) await this.runRoutine({ space: desk.space.id, id: routine.id });
    return (await this.desk())!;
  }

  async routines(input: { space?: string } = {}): Promise<RoutineInfo[]> {
    const space = this.routineSpace(input.space);
    const posts = this.core.spacePosts(space).posts.filter((p) => p.routine);
    const now = new Date();
    return this.routineRecords(space).map((r) => {
      const last = posts.filter((p) => p.routine!.id === r.id).sort((a, b) => b.time.localeCompare(a.time))[0];
      const next = nextRun(r, now);
      return {
        id: r.id,
        name: r.name,
        on: r.on,
        trigger: r.trigger,
        create: r.create,
        space: { id: space.id, kind: space.kind, name: space.name },
        ...(last ? { last: { post: last.id, occurrence: last.routine!.occurrence, time: last.time } } : {}),
        ...(next ? { next: next.toISOString() } : {}),
      };
    });
  }

  async setRoutine(input: { space?: string; id?: string; name: string; on?: boolean; trigger: RoutineInfo['trigger']; create: RoutineInfo['create'] }): Promise<RoutineInfo> {
    const space = this.routineSpace(input.space);
    this.core.maintainerState(space);
    const name = input.name?.trim();
    if (!name || name.length > 100) throw new Error('a routine needs a name (up to 100 characters)');
    const trigger = parseTrigger(input.trigger);
    if (!trigger) throw new Error('a routine runs on a schedule (days 0-6, Sunday is 0, and a time like 08:00) or at first start');
    const create = parseCreate(input.create);
    if (!create) throw new Error('say what the routine creates: a board and a title pattern ({date}, {day}, {weekday})');
    this.core.board(space, this.core.spacePosts(space).boards, create.board);
    const id = input.id?.trim() || randomUUID().slice(0, 8);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ROUTINE, body: { id, name, on: input.on !== false, trigger, create } as unknown as Json }));
    return (await this.routines({ space: space.id })).find((r) => r.id === id)!;
  }

  async removeRoutine(input: { space?: string; id: string }): Promise<void> {
    const space = this.routineSpace(input.space);
    this.core.maintainerState(space);
    if (!this.routineRecords(space).some((r) => r.id === input.id)) throw new Error('no such routine');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ROUTINE, body: { id: input.id, removed: true } }));
  }

  async runRoutine(input: { space?: string; id: string }): Promise<PostInfo> {
    const space = this.routineSpace(input.space);
    const routine = this.routineRecords(space).find((r) => r.id === input.id);
    if (!routine) throw new Error('no such routine');
    const now = new Date();
    return this.runOccurrence(space, routine, routine.trigger.type === 'first-start' ? 'first-start' : dayKey(now), now);
  }

  /**
   * Create what's due: today's item of every scheduled routine whose time has come and that you made
   * (in a shared project, only its author's Weave runs it). The daemon calls this every minute.
   */
  async tickRoutines(now = new Date()): Promise<PostInfo[]> {
    const made: PostInfo[] = [];
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'project') continue;
      for (const routine of this.routineRecords(space)) {
        if (routine.by !== this.node.identity.author) continue;
        const occurrence = dueOccurrence(routine, now);
        if (!occurrence || this.occurrence(space, routine.id, occurrence)) continue;
        made.push(await this.runOccurrence(space, routine, occurrence, now));
      }
    }
    return made;
  }

  routineSpace(ref?: string): StoredSpace {
    const id = ref ?? this.node.config.desk?.space;
    if (!id) throw new Error('set up your desk first, or say which project');
    const space = this.core.space(id);
    if (space.kind !== 'project') throw new Error('routines live in projects');
    return space;
  }

  routineRecords(space: StoredSpace): Routine[] {
    return routinesOf(this.core.entries(space), this.core.state(space).maintainers);
  }

  occurrence(space: StoredSpace, id: string, occurrence: string): PostInfo | undefined {
    return this.core.spacePosts(space).posts.find((p) => p.routine?.id === id && p.routine.occurrence === occurrence);
  }

  async runOccurrence(space: StoredSpace, routine: Routine, occurrence: string, now: Date): Promise<PostInfo> {
    const existing = this.occurrence(space, routine.id, occurrence);
    if (existing) return existing;
    const { create } = routine;
    const body: Record<string, Json> = { title: renderTitle(create.title, now), text: create.text ?? '', board: create.board, routine: { id: routine.id, occurrence } };
    if (create.prompt) body.prompt = create.prompt;
    const { id } = await this.node.publish({ kind: KIND_POST, body, space: space.id });
    const post = await this.node.post(id);
    this.core.services.emitLive({ type: 'routine', category: 'activity', title: routine.name, text: `${post.title} is ready`, open: { post: post.id } });
    return post;
  }

  async expectSession(input: { post: string; folder?: string }): Promise<void> {
    const post = await this.node.post(input.post);
    this.expected = { post: post.id, ...(input.folder ? { folder: input.folder } : {}), until: Date.now() + 15 * 60 * 1000 };
  }

  /** The session Ctrl+click opened has shown up in the Claude app, with its id: give it its item. */
  async attachExpected(): Promise<void> {
    const expected = this.expected;
    const focus = this.core.appLog?.current;
    if (!expected || !focus?.id) return;
    if (Date.now() > expected.until) return void (this.expected = undefined);
    // Only a session with nothing on it yet: not one you switched to on the way.
    if (this.sessionRecords().get(sessionKey('claude-code', focus.id))?.stack.length) return;
    this.expected = undefined;
    await this.workOn({ session: { provider: 'claude-code', id: focus.id, host: focus.host, ...(expected.folder ? { folder: expected.folder } : {}) }, post: expected.post });
  }

  async workTarget(input: { post: string }): Promise<WorkTarget> {
    const post = await this.node.post(input.post);
    const records = [...this.sessionRecords().values()].sort((a, b) => b.time.localeCompare(a.time));
    // Your desk's items go to your daily driver; others to their latest session.
    const driver = this.node.config.desk?.driver;
    const latest =
      driver && post.space?.id === this.node.config.desk?.space ? this.sessionRecord(driver) : records.find((r) => r.stack.some((s) => s.post === post.id));
    const posts = new Map(this.core.allPosts().map((p) => [p.id, p]));
    // Folders for the item's space: the ones you chose, then the ones its sessions ran in.
    const space = post.space?.id;
    const used = space ? records.filter((r) => r.folder && r.stack.some((s) => posts.get(s.post)?.space?.id === space)).map((r) => r.folder!) : [];
    const folders = [...new Set([...(space ? (this.node.config.spaceFolders?.[space] ?? []) : []), ...used])];
    const lines = [
      `Weave work item: ${post.title}`,
      post.url,
      '',
      post.prompt ?? "Let's work on this.",
      ...(latest ? [] : ['', `(This is a new session: first put the item on your stack with weave_work_on, post ${post.url}.)`]),
    ];
    return { post, ...(latest ? { session: this.sessionInfo(latest, posts) } : {}), folders, text: lines.join('\n') };
  }

  async rememberFolder(input: { space: string; folder: string }): Promise<string[]> {
    const space = this.core.space(input.space);
    const folder = input.folder?.trim();
    if (!folder || folder.length > 1000) throw new Error('say which folder');
    const list = [folder, ...(this.node.config.spaceFolders?.[space.id] ?? []).filter((f) => f !== folder)].slice(0, 10);
    this.node.config = { ...this.node.config, spaceFolders: { ...this.node.config.spaceFolders, [space.id]: list } };
    saveConfig(this.node.home, this.node.config);
    return list;
  }

  sessionRecords(): Map<string, SessionRecord> {
    const mine = this.core.decodeAll()
      .filter((d) => d.private && d.inner.kind === KIND_SESSION)
      .map((d) => ({ id: d.id, event: d.event, kind: d.inner.kind, body: d.inner.body }));
    return sessionsOf(mine);
  }

  /** A session's record, with what the caller now knows about it (host id, folder) filled in. */
  sessionRecord(ref: SessionRef): SessionRecord {
    const provider = ref.provider?.trim() || 'claude-code';
    const id = ref.id?.trim();
    if (!id || id.length > 200) throw new Error('say which session (its id)');
    const known = this.sessionRecords().get(sessionKey(provider, id));
    return {
      provider,
      id,
      ...((ref.host ?? known?.host) ? { host: ref.host ?? known?.host } : {}),
      ...((ref.folder ?? known?.folder) ? { folder: ref.folder ?? known?.folder } : {}),
      ...(known?.title ? { title: known.title } : {}),
      stack: known?.stack ?? [],
      time: known?.time ?? new Date().toISOString(),
    };
  }

  saveSession(record: SessionRecord): SessionInfo {
    const title = (record.provider === 'claude-code' ? transcriptTitle(record.id) : undefined) ?? record.title;
    const body: Record<string, Json> = {
      provider: record.provider,
      id: record.id,
      ...(record.host ? { host: record.host } : {}),
      ...(record.folder ? { folder: record.folder } : {}),
      ...(title ? { title } : {}),
      stack: record.stack.map((s) => ({ post: s.post, since: s.since })),
    };
    const event = this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_SESSION, body }));
    return this.sessionInfo({ ...record, ...(title ? { title } : {}), time: event.time }, new Map(this.core.allPosts().map((p) => [p.id, p])));
  }

  sessionInfo(record: SessionRecord, posts: Map<string, PostInfo>): SessionInfo {
    const brief = (item: StackItem): SessionInfo['stack'][number]['post'] => {
      const p = posts.get(item.post);
      return p ?? { id: item.post, missing: true };
    };
    const title = (record.provider === 'claude-code' ? transcriptTitle(record.id) : undefined) ?? record.title;
    const active = record.provider === 'claude-code' ? transcriptActive(record.id) : undefined;
    const host = record.host ?? (record.provider === 'claude-code' ? this.core.appLog?.hostOf(record.id) : undefined);
    return {
      provider: record.provider,
      id: record.id,
      ...(active ? { active } : {}),
      ...(host ? { host } : {}),
      ...(record.folder ? { folder: record.folder } : {}),
      ...(title ? { title } : {}),
      stack: record.stack.map((s) => ({ post: brief(s), since: s.since })),
      time: record.time,
    };
  }

  async permissionRequests(): Promise<PermissionRequest[]> {
    return this.core.requests().filter((r) => r.state === 'pending' && this.core.agents.some((a) => a.name === r.agent));
  }

  async answerPermission(input: { id: string; allow: boolean }): Promise<PermissionRequest> {
    const requests = this.core.requests();
    const request = requests.find((r) => r.id === input.id);
    if (!request) throw new Error('no such request (it may have been answered already)');
    if (request.state !== 'pending') return request;
    if (input.allow) {
      const agent = this.core.agents.find((a) => a.name === request.agent);
      if (!agent) throw new Error(`the agent ${request.agent} is gone`);
      await this.node.updateAgent({ name: agent.name, permissions: [...agent.permissions, ...request.kinds] });
    }
    request.state = input.allow ? 'allowed' : 'declined';
    writeJson(this.core.requestsFile, requests);
    this.core.services.emitLive();
    return request;
  }

  /** What co-authorship needs to know about keys. */
  keyFacts: KeyFacts = {
    personOf: (key) => this.node.replica.authority.personOf(key),
    isAgent: (key) => this.node.replica.authority.grant(key)?.role === 'agent',
  };

  /** A co-author by name, did:key, your agent's name, or someone's agent as "person·agent". */
  /** Co-authors to name in a space: resolved, each one a member who can confirm. */
  coauthorList(space: StoredSpace, refs: string[]): Did[] {
    if (refs.length > MAX_COAUTHORS) throw new Error(`name at most ${MAX_COAUTHORS} co-authors`);
    const state = this.core.state(space);
    const named = [...new Set(refs.map((ref) => this.resolveCoauthor(ref)))];
    for (const did of named) {
      const person = this.node.replica.authority.personOf(did);
      if (!state.members.has(person)) throw new Error(`${this.node.nameOf(person) ?? did} isn't in ${space.name}, so they can't confirm`);
    }
    return named;
  }

  resolveCoauthor(ref: string): Did {
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
  namedIn(postId: string): Did[] | undefined {
    for (const { posts } of this.postSources()) {
      const post = posts.find((p) => p.id === postId);
      if (post) return post.with;
    }
    return undefined;
  }

  /** Every post this node can read, with the entries around it: per project and community, and the public ones. */
  postSources(): Array<{ posts: Post[]; entries: Entry[]; space?: StoredSpace }> {
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

  async editPost(input: { post: string; title?: string; text?: string; link?: string; image?: string; with?: string[]; prompt?: string; as?: string }): Promise<PostInfo> {
    const post = await this.ownPost(input.post, 'edit');
    const body: Record<string, Json> = { target: post.id };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error('a post needs a title');
      if (title.length > TEXT_LIMITS.title) throw tooLong('The title', title.length, TEXT_LIMITS.title);
      body.title = title;
    }
    if (input.text !== undefined) body.text = input.text;
    if (input.link !== undefined) {
      const link = input.link.trim();
      if (link && !/^https?:\/\//.test(link)) throw new Error('links start with http:// or https://');
      body.link = link;
    }
    if (input.prompt !== undefined) body.prompt = input.prompt.trim();
    if (input.image !== undefined) {
      const image = input.image.trim();
      if (image && !parseBlobRef(image)) throw new Error('attach an uploaded image (a wblob: reference)');
      body.image = image;
    }
    if (input.with !== undefined) {
      const space = post.space && this.core.spaces.get(post.space.id);
      if (!space) throw new Error("co-authors are named in the space a post is in, and you aren't in it");
      body.with = this.coauthorList(space, input.with);
    }
    if (Object.keys(body).length === 1) throw new Error('nothing to change: give a new title, text, link, image or co-authors');
    await this.node.publish({ kind: KIND_POST_EDIT, body, space: post.space?.id, as: input.as });
    return this.node.post(post.id);
  }

  async deletePost(input: { post: string; as?: string }): Promise<void> {
    const post = await this.ownPost(input.post, 'delete');
    await this.node.publish({ kind: KIND_POST_DELETE, body: { target: post.id }, space: post.space?.id, as: input.as });
  }

  /** A post you may edit (yours) or delete (yours, or any in a space you maintain or moderate). */
  async ownPost(ref: string, action: 'edit' | 'delete'): Promise<PostInfo> {
    const post = await this.node.post(ref);
    if (post.type !== 'post') throw new Error(`only posts can be changed this way; this is a ${post.type}`);
    // Old ideas threads show up as posts too, but are weave.thread events.
    if (!this.core.decodeAll().some((d) => d.inner.kind === KIND_POST && d.id === post.id)) throw new Error('only posts can be changed this way; this is an older thread');
    if (post.by.did === this.node.identity.author) return post;
    const space = post.space && this.core.spaces.get(post.space.id);
    if (action === 'delete' && space && mayAct(this.core.state(space), this.node.identity.author, 'curate').ok) return post;
    throw new Error(action === 'edit' ? 'only its author can edit a post' : `only its author${space ? ` or the ${space.kind === 'community' ? 'moderators' : 'maintainers'}` : ''} can delete a post`);
  }

  async upvote(input: { target: string; value: number; as?: string }): Promise<PostInfo> {
    if (![1, 0, -1].includes(input.value)) throw new Error('upvote with 1, -1, or 0 to take it back');
    const post = await this.node.post(input.target);
    await this.node.publish({ kind: KIND_UPVOTE, body: { target: post.id, value: input.value }, space: post.space?.id, as: input.as });
    return this.node.post(post.id);
  }

  async save(input: { target: string; mode: SaveMode | null }): Promise<void> {
    if (input.mode !== null && !SAVE_MODES.includes(input.mode)) throw new Error(`save as ${SAVE_MODES.join(' or ')}, or null to forget`);
    const post = await this.node.post(input.target);
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_SAVE, body: { target: post.id, mode: input.mode } }));
  }

  async share(input: { post: string; to: string; text?: string }): Promise<PostInfo> {
    const post = await this.node.post(input.post);
    const project = post.project ? { id: post.project.id, name: post.project.name, description: post.project.description, status: post.project.status, ...(post.project.icon ? { icon: post.project.icon } : {}) } : undefined;
    const text = input.text?.trim() || post.text;
    if (input.to === 'followers') {
      const page = project && this.core.spaces.has(project.id) ? this.core.page(this.core.spaces.get(project.id)!, this.core.state(this.core.spaces.get(project.id)!)) : undefined;
      if (!project || !page?.public) throw new Error('only projects with a public page can be shared with your followers; share other posts into a community');
      const { id } = await this.node.publish({ kind: KIND_POST, body: { title: post.title, text, share: { post: post.id, project } } });
      return this.node.post(id);
    }
    const target = this.core.space(input.to);
    if (target.kind !== 'community') throw new Error(`share into a community (or "followers"); ${target.name} is a ${target.kind}`);
    const share: Record<string, Json> = { post: post.id, ...(post.space ? { space: { ...post.space } } : {}), ...(project ? { project } : {}) };
    const body: Record<string, Json> = { title: post.title, text, share };
    if (post.link) body.link = post.link;
    if (post.image) body.image = post.image;
    const { id } = await this.node.publish({ kind: KIND_POST, body, space: target.id });
    return this.node.post(id);
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
      .map((b) => {
        const inBoard = posts.filter((p) => p.board === b.name);
        const active = inBoard.reduce<string | undefined>((latest, p) => (!latest || p.active > latest ? p.active : latest), undefined);
        const rules = access?.rules.get(b.name);
        const info = (list?: Grantee[]) => list?.map((g) => this.granteeInfo(g, state));
        return {
          ...b,
          count: inBoard.length,
          ...(active ? { active } : {}),
          access: { ...(rules?.read ? { read: info(rules.read) } : {}), ...(rules?.write ? { write: info(rules.write) } : {}) },
          canWrite: !access || !rules?.write || mayUse('write', b.name, me, state, access),
          ...(space.kind === 'project' ? { following: this.core.follows(space.id, b.name) } : {}),
          ...(forgetting.get(b.name) ? { rule: this.core.ruleInfo(forgetting.get(b.name)!) } : {}),
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

  granteeInfo(g: Grantee, state: SpaceState): GranteeInfo {
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
}
