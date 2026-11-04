import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join as joinPath, resolve as resolvePath } from 'node:path';
import { type AppImage, type Did, type Json, KIND_POST, KIND_ROUTINE, KIND_SESSION, MAX_ABOUT, MAX_DESCRIPTION, type Routine, SESSION_ROLES, type SessionRecord, type SessionRole, WeaveError, b64u, dayKey, delegation, dueOccurrence, nameProblem, nextRun, open, parseCreate, parseTrigger, permits, postRefsIn, postTargetOf, pushOnto, randomBytes, renderTitle, reorder, routinesOf, sameName, sealFor, sessionKey, sessionTitle, sessionsOf, takeOff } from '@weave/core';
import { sanitizeFigure } from './avatar.ts';
import { type AgentInfo, type AppOpen, type ClaudeCodeFollow, type DeskInfo, type FeedItem, type HarnessInfo, type MentionInfo, type Notice, type PermissionRequest, type PostInfo, type RoutineInfo, type SessionInfo, type SessionRef, type Status, type WorkTarget, noAgentError } from './backend.ts';
import { AppLogFollower, ArchivedSessions, type SessionText, TranscriptFollower, recentSessions, transcriptActive, transcriptTitle } from './claudecode.ts';
import { saveConfig } from './config.ts';
import { type McpLaunch, entryHome, entryState, harnessesIn, staleEntry, writeEntry } from './harnesses.ts';
import { readJson, resolveHome, writeJson } from './home.ts';
import { createAndSaveAgent } from './keystore.ts';
import { SHIPPED_DIR } from './shipped.ts';
import { type StoredSpace } from './spacestore.ts';
import { vaultOf } from './vault.ts';
import type { AgentKey } from './keystore.ts';
import type { Board, Entry, EventFields, Inner, PostTarget, SpaceKind, SpaceState } from '@weave/core';
import type { SwarmNode } from '@weave/net';
import type { Hints } from './hints.ts';
import type { Holding } from './holding.ts';
import type { Keyvaults } from './keyvaults.ts';
import type { ManagedKeys } from './managed.ts';
import type { Marks } from './marks.ts';
import { agentInfo, type Decoded, type WeaveNode } from './node.ts';

/*
 * Agents and their sessions: agent keys and their harnesses (Claude Code and
 * others), what agents ask permission for, the Claude app's sessions and
 * their stacks of work items, mentions, and your desk with its routines. It
 * sees the node's internals only through SessionsCore; the node delegates
 * the Backend methods to it.
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
- I keep a pool of worker sessions (weave_workers: what each takes, is on and
  finished last). While planning, hand items to them with weave_assign, only
  to workers that take the item's project, and tell me whom you gave what.
- When something interrupts, put it on top of the stack (weave_work_on); when
  it's done, weave_done, and tell me what we're back to.
- Folders and projects aren't one to one. To start work elsewhere, use a
  folder Weave knows for that project; if none fits, ask me, or ask to create
  one. Never guess a folder you haven't seen used for that project.
- When you mention a post, link it with its url.
`;
}

/** What Sessions needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface SessionsCore {
  readonly agents: AgentKey[];
  allPosts(): PostInfo[];
  board(space: StoredSpace, boards: Board[], ref: string): Board;
  contacts(): Map<Did, string | undefined>;
  decodeAll(): Decoded[];
  emitLive(notice?: Notice): void;
  entries(space: StoredSpace): Entry[];
  hiddenAuthors(): Set<Did>;
  readonly hints: Hints;
  hintsChanged(): void;
  readonly hintsListeners: Set<() => void>;
  readonly holding: Holding;
  readonly keyvaults: Keyvaults;
  readonly liveListeners: Set<(notice?: Notice) => void>;
  looksOnly(topic: string): boolean;
  maintainerState(project: StoredSpace): SpaceState;
  readonly managed: ManagedKeys;
  readonly marks: Marks;
  marksChanged(): void;
  readonly marksListeners: Set<() => void>;
  noticeFor(item: FeedItem, anyAge?: boolean): Promise<Notice | undefined>;
  postAt(target: PostTarget): PostInfo;
  project(ref: string): StoredSpace;
  sealForSelf(inner: Inner): EventFields;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  spacePosts(space: StoredSpace): { posts: PostInfo[]; boards: Board[] };
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
  readonly swarm: SwarmNode | undefined;
}

export class Sessions {
  private readonly node: WeaveNode;
  private readonly core: SessionsCore;

  constructor(node: WeaveNode, core: SessionsCore) {
    this.node = node;
    this.core = core;
  }

  /** Posts agents pointed to, newest first (the Mentions panel), and who's watching for more. */
  #mentions: MentionInfo[] = [];
  readonly #mentionListeners = new Set<(mention: MentionInfo) => void>();
  /** Claude Code sessions followed for links to posts, while that's on (see followClaudeCode). */
  follower?: TranscriptFollower;
  /** The Claude app's log, for the session you're looking at, while that's on too. */
  appLog?: AppLogFollower;
  /** The sessions you archived in the Claude app (read from its files, never written). */
  readonly #archived = new ArchivedSessions();
  readonly #focusListeners = new Set<(session: SessionInfo | null) => void>();
  /** A session Ctrl+click or the Sessions page is opening: its item, its job (see expectSession). */
  #expected?: { post?: string; folder?: string; role?: SessionRole; projects?: string[]; until: number };
  /** Watchers told where the app should take its person (see openInApp). */
  #openListeners = new Set<(open: AppOpen) => void>();
  /** Where harness configs live (your user folder; tests use a temporary one). */
  harnessHome = homedir();
  /** How a harness starts this installation's CLI: this process's own program and script (Electron's Node in the packaged app). */
  mcpLaunch: () => McpLaunch = () => ({
    command: process.execPath,
    args: [resolvePath(process.argv[1] ?? ''), ...(this.node.home.dir === resolveHome().dir ? [] : ['--home', this.node.home.dir])],
    env: process.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : ({} as Record<string, string>),
  });
  // ---------------------------------------------------------------- agent harnesses

  /** Harnesses, looked for under harnessHome only (on Windows, Claude Desktop's %APPDATA% too, unless it's a test folder). */
  #harnessList() {
    return harnessesIn(this.harnessHome, process.platform, this.harnessHome === homedir() ? process.env.APPDATA : joinPath(this.harnessHome, 'AppData', 'Roaming'));
  }

  async harnesses(): Promise<{ offered: boolean; harnesses: HarnessInfo[] }> {
    const launch = this.mcpLaunch();
    return {
      offered: this.node.config.agentsOffered === true,
      harnesses: this.#harnessList()
        .filter((h) => h.found)
        .map((h) => ({ id: h.id, name: h.name, agent: h.agent, file: h.file, state: entryState(h, launch), restart: h.restart, restartText: h.restartText, ...(this.#repaired.has(h.id) ? { repaired: true } : {}) })),
    };
  }

  /** Harnesses whose entry this daemon pointed back at itself, until the person has seen it. */
  #repaired = new Set<string>();

  /**
   * At the daemon's start: Weave's entries that point to a Weave no longer there (an uninstalled app, a moved checkout)
   * start this one instead, for the same home and an agent it has. An entry for another Weave that's still there stays:
   * the person switches in Keys & devices, or every start would flip it.
   */
  repairHarnesses(): string[] {
    if (process.env.APPIMAGE) return [];
    const launch = this.mcpLaunch();
    const home = (dir: string | undefined) => resolvePath(dir ?? resolveHome().dir);
    const own = launch.args.indexOf('--home');
    const ownHome = home(own >= 0 ? launch.args[own + 1] : undefined);
    const fixed: string[] = [];
    for (const h of this.#harnessList().filter((x) => x.found)) {
      if (entryState(h, launch) !== 'other' || !staleEntry(h)) continue;
      if (home(entryHome(h)) !== ownHome || !this.core.agents.some((a) => a.name === h.agent)) continue;
      try {
        writeEntry(h, launch);
      } catch {
        continue; // a file Weave can't read stays as it is
      }
      this.#repaired.add(h.id);
      fixed.push(h.name);
    }
    return fixed;
  }

  async connectHarness(input: { harness: string; on: boolean }): Promise<{ offered: boolean; harnesses: HarnessInfo[] }> {
    const h = this.#harnessList().find((x) => x.id === input.harness && x.found);
    if (!h) throw new Error(`${input.harness} isn't installed on this computer`);
    // An AppImage runs from a mount that moves every start: an entry pointing there would break.
    if (input.on && process.env.APPIMAGE) throw new Error(`the AppImage can't be started by ${h.name} yet: add Weave from a source checkout (see the README's Agents section)`);
    if (input.on && !this.core.agents.some((a) => a.name === h.agent)) await this.addAgent(h.agent, ['weave.post', 'weave.reply', 'weave.msg', 'weave.react']);
    writeEntry(h, input.on ? this.mcpLaunch() : null);
    await this.dismissHarnesses();
    return this.harnesses();
  }

  async dismissHarnesses(): Promise<void> {
    this.#repaired.clear();
    if (this.node.config.agentsOffered) return;
    this.node.config = { ...this.node.config, agentsOffered: true };
    saveConfig(this.node.home, this.node.config);
  }

  async addAgent(name: string, permissions: string[]): Promise<AgentInfo> {
    const agent = createAndSaveAgent(this.node.home, this.node.identity.author, name, permissions);
    this.node.replica.write(this.node.identity, delegation(agent.did, 'agent', permissions, name));
    this.core.agents.push(agent);
    return agentInfo(agent);
  }

  async join(topic: string): Promise<void> {
    if (!this.node.config.topics.includes(topic)) {
      this.node.config = { ...this.node.config, topics: [...this.node.config.topics, topic] };
      saveConfig(this.node.home, this.node.config);
    }
    await this.core.swarm?.join(topic, { announce: !this.core.looksOnly(topic) });
  }

  async status(): Promise<Status> {
    const signers = this.node.replica.signers();
    const spaces = [...this.core.spaces.values()];
    return {
      did: this.node.identity.author,
      name: this.node.nameOf(this.node.identity.author),
      online: this.node.online,
      topics: this.node.config.topics,
      groups: spaces.filter((s) => s.kind === 'group').length,
      projects: spaces.filter((s) => s.kind === 'project').length,
      communities: spaces.filter((s) => s.kind === 'community').length,
      peers: this.core.swarm?.sessions.size ?? 0,
      olderPeers: [...(this.core.swarm?.sessions ?? [])].filter((s) => s.peerStanding === 'older').length,
      newerPeers: [...(this.core.swarm?.sessions ?? [])].filter((s) => s.peerStanding === 'newer').length,
      logs: signers.length,
      events: signers.reduce((sum, signer) => sum + this.node.replica.number(signer), 0),
      pending: this.node.replica.pendingCount,
      heldBack: this.core.holding.heldBack,
      keystore: vaultOf(this.node.home).keystore,
      ...(vaultOf(this.node.home).warning ? { keystoreWarning: vaultOf(this.node.home).warning } : {}),
      ...(this.shippedMissing ? { shippedMissing: true as const } : {}),
    };
  }

  /** No services Weave ships next to this daemon: a checkout whose packages/shipped/dist isn't built. Everything from Unread to Websites is missing then. */
  get shippedMissing(): boolean {
    const dir = this.node.wasmSetup.shippedDir ?? SHIPPED_DIR;
    return !dir || !existsSync(joinPath(dir, 'shipped.json'));
  }

  async watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void> {
    // In order, one at a time: working out a notice may need to read the Inbox.
    let queue = Promise.resolve();
    const unsubscribe = this.node.replica.onAppend((event) => {
      const item = this.node.itemFor(event);
      if (item && this.core.marks.reads(item.kind)) this.core.marksChanged();
      if (item && this.core.hints.reads(item.kind)) this.core.hintsChanged();
      if (!item || this.core.hiddenAuthors().has(item.author)) return;
      queue = queue.then(async () => {
        const notice = await this.core.noticeFor(item).catch(() => undefined);
        // A notice counts (Unread folds them): what the hint services say may have changed.
        if (notice) this.core.hintsChanged();
        onItem(notice ? { ...item, notice } : item);
      });
    });
    // Rooms change without events (people come and go, room chat): a notice with no content, so views refresh.
    const me = this.node.identity.author;
    const onLive = (notice?: Notice) => onItem({ id: `live-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.live', scope: 'live', body: null, author: me, signer: me, seq: 0, ...(notice ? { notice } : {}) });
    this.core.liveListeners.add(onLive);
    // Not an event either: the app comes to the front there; other watchers see no text and leave it.
    const onOpen = (open: AppOpen) => onItem({ id: `open-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.open', scope: 'live', body: open as unknown as Json, author: me, signer: me, seq: 0 });
    this.#openListeners.add(onOpen);
    // Neither: a post an agent pointed to, for the Mentions panel.
    const onMention = (mention: MentionInfo) => onItem({ id: mention.id, time: mention.time, kind: 'weave.mention', scope: 'live', body: mention as unknown as Json, author: me, signer: me, seq: 0 });
    this.#mentionListeners.add(onMention);
    // You switched sessions in the Claude app: the panel follows.
    const onFocus = (session: SessionInfo | null) => onItem({ id: `focus-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.focus', scope: 'live', body: session as unknown as Json, author: me, signer: me, seq: 0 });
    this.#focusListeners.add(onFocus);
    // What the mark services say may have changed: views showing marks ask again (and only then).
    const onMarks = () => onItem({ id: `marks-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.marks', scope: 'live', body: null, author: me, signer: me, seq: 0 });
    this.core.marksListeners.add(onMarks);
    // And what the hint services say (unread counts): views showing them ask again.
    const onHints = () => onItem({ id: `hints-${Date.now()}`, time: new Date().toISOString(), kind: 'weave.hints', scope: 'live', body: null, author: me, signer: me, seq: 0 });
    this.core.hintsListeners.add(onHints);
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    this.core.marksListeners.delete(onMarks);
    this.core.hintsListeners.delete(onHints);
    this.core.liveListeners.delete(onLive);
    this.#openListeners.delete(onOpen);
    this.#mentionListeners.delete(onMention);
    this.#focusListeners.delete(onFocus);
    unsubscribe();
  }

  // ---------------------------------------------------------------- agents asking for more

  get #requestsFile(): string {
    return joinPath(this.node.home.dir, 'agent-requests.json');
  }

  #requests(): PermissionRequest[] {
    return readJson<PermissionRequest[]>(this.#requestsFile) ?? [];
  }

  async requestPermission(input: { as: string; kinds: string[]; reason?: string }): Promise<PermissionRequest> {
    const agent = this.core.agents.find((a) => a.name === input.as);
    if (!agent) throw noAgentError(input.as, this.core.agents.map((a) => a.name));
    const kinds = [...new Set(input.kinds.map((k) => k.trim()))].filter((k) => /^weave\.[a-z0-9.*-]{1,60}$/.test(k));
    if (!kinds.length) throw new Error('name the kinds to ask for, like weave.app');
    const missing = kinds.filter((k) => !permits(agent.permissions, k));
    const now = new Date(this.node.clock()).toISOString();
    if (!missing.length) return { id: '', agent: agent.name, kinds, reason: '', time: now, state: 'allowed' };
    const requests = this.#requests();
    // Asking again for the same while waiting doesn't make a second request.
    const open = requests.find((r) => r.state === 'pending' && r.agent === agent.name && missing.every((k) => r.kinds.includes(k)));
    if (open) return open;
    const request: PermissionRequest = { id: b64u.encode(randomBytes(9)), agent: agent.name, kinds: missing, reason: (input.reason ?? '').trim().slice(0, 300), time: now, state: 'pending' };
    // Keep what's pending, and the last few answers.
    writeJson(this.#requestsFile, [...requests.filter((r) => r.state === 'pending'), ...requests.filter((r) => r.state !== 'pending').slice(-20), request]);
    this.core.emitLive({
      type: 'permission',
      category: 'requests',
      title: `Your agent ${agent.name} asks for a permission`,
      text: `To sign ${missing.join(', ')}${request.reason ? `: “${request.reason}”` : ''}`,
      name: 'daemon.notice.permission',
      values: { agent: agent.name, kinds: missing.join(', '), hasReason: request.reason ? 'yes' : 'no', reason: request.reason },
      open: { inbox: true },
    });
    return request;
  }

  async requestHand(input: { as: string; project: string; resources: string[]; platform?: string; reason?: string }): Promise<PermissionRequest> {
    const agent = this.core.agents.find((a) => a.name === input.as);
    if (!agent) throw noAgentError(input.as, this.core.agents.map((a) => a.name));
    const platform = input.platform ?? 'github';
    const resources = [...new Set(input.resources.map((r) => String(r).trim()).filter((r) => r && r.length <= 200))].slice(0, 20);
    if (!resources.length) throw new Error('name the repositories, like owner/name');
    const project = this.core.project(input.project);
    const vault = this.core.keyvaults.forPlatform(platform);
    if (!vault) throw new Error(`your person has no ${platform} keyvault yet: they add one in Keys & devices`);
    const keys = Object.keys(vault.apps);
    if (!keys.length) throw new Error(`your person's ${platform} keyvault has no app yet: they make one in Keys & devices`);
    // The app that reaches them all: asking for what none reaches would be allowed for nothing.
    let app: string | undefined;
    const problems: string[] = [];
    for (const key of keys) {
      try {
        const reach = new Set((await this.core.keyvaults.reachable(vault.name, key)).map((r) => r.value.toLowerCase()));
        if (resources.every((r) => reach.has(r.toLowerCase()))) {
          app = key;
          break;
        }
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    if (!app) throw new Error(`your person's ${platform} App doesn't reach ${resources.join(', ')}${problems.length ? ` (${problems.join('; ')})` : ''}: they install it there on ${platform} first`);
    const handed = new Set(vault.apps[app].handed[project.id] ?? []);
    const now = new Date(this.node.clock()).toISOString();
    const title = this.core.keyvaults.state(vault).title;
    const hand = { keyvault: vault.name, title, platform, app, project: { id: project.id, name: project.name }, resources: resources.filter((r) => !handed.has(r)) };
    if (!hand.resources.length) return { id: '', agent: agent.name, kinds: [], hand: { ...hand, resources }, reason: '', time: now, state: 'allowed' };
    const requests = this.#requests();
    const open = requests.find((r) => r.state === 'pending' && r.agent === agent.name && r.hand?.project.id === project.id && hand.resources.every((x) => r.hand!.resources.includes(x)));
    if (open) return open;
    const request: PermissionRequest = { id: b64u.encode(randomBytes(9)), agent: agent.name, kinds: [], hand, reason: (input.reason ?? '').trim().slice(0, 300), time: now, state: 'pending' };
    writeJson(this.#requestsFile, [...requests.filter((r) => r.state === 'pending'), ...requests.filter((r) => r.state !== 'pending').slice(-20), request]);
    this.core.emitLive({
      type: 'permission',
      category: 'requests',
      title: `Your agent ${agent.name} asks for ${hand.resources.length === 1 ? 'a repository' : 'repositories'}`,
      text: `To give ${project.name} ${hand.resources.join(', ')} from your ${title}${request.reason ? `: “${request.reason}”` : ''}`,
      name: 'daemon.notice.hand',
      values: { agent: agent.name, n: hand.resources.length, project: project.name, resources: hand.resources.join(', '), keyvault: title, hasReason: request.reason ? 'yes' : 'no', reason: request.reason },
      open: { inbox: true },
    });
    return request;
  }

  async openInApp(input: { what: AppOpen['what']; space?: string; repo?: string; post?: string; who?: string; keyvault?: string; service?: string; as?: string }): Promise<AppOpen> {
    if (!['space', 'inbox', 'post', 'person', 'keyvault', 'service'].includes(input.what)) throw new Error('what is space, inbox, post, person, keyvault or service');
    // Which agent asked, for the dialog to say (an agent of theirs: it signs as one).
    const askedBy = input.as && this.core.agents.some((a) => a.name === input.as) ? { askedBy: input.as } : {};
    if (input.what === 'service') {
      // A project's services: one it runs, or its Add a service catalog with something picked (the person adds it).
      if (!input.space) throw new Error('say which project');
      const project = this.core.project(input.space);
      const service = input.service?.trim();
      const open: AppOpen = { what: 'service', space: { id: project.id, kind: 'project', name: project.name }, ...(service ? { service } : {}), ...askedBy };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    if (input.what === 'keyvault') {
      // A keyvault in Keys & devices (GitHub's by default): the person makes their app there, or hands a project a repository.
      const vaults = await this.node.keyvaults();
      const wanted = (input.keyvault ?? 'github').toLowerCase();
      const k = vaults.find((v) => v.name.toLowerCase() === wanted || v.title.toLowerCase() === wanted || v.platform.toLowerCase() === wanted);
      if (!k) throw new Error(vaults.length ? `no keyvault ${input.keyvault ?? 'github'} here (${vaults.map((v) => v.name).join(', ')})` : 'no keyvaults here');
      const project = input.space ? this.core.project(input.space) : undefined;
      const open: AppOpen = { what: 'keyvault', keyvault: { name: k.name, title: k.title }, ...(project ? { space: { id: project.id, kind: 'project', name: project.name } } : {}), ...askedBy };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    if (input.what === 'person') {
      if (!input.who) throw new Error('say who');
      const did = this.node.resolve(input.who);
      const name = this.node.nameOf(did);
      const open: AppOpen = { what: 'person', person: { did, ...(name ? { name } : {}) } };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    if (input.what === 'post') {
      if (!input.post) throw new Error('say which post');
      const post = await this.node.post(input.post);
      const open: AppOpen = { what: 'post', post: { id: post.id, title: post.title }, ...(post.space ? { space: post.space } : {}) };
      for (const listener of this.#openListeners) listener(open);
      return open;
    }
    const space = input.space ? this.core.space(input.space) : undefined;
    if (input.what !== 'inbox' && !space) throw new Error('say which space');
    const open: AppOpen = { what: input.what, ...(space ? { space: { id: space.id, kind: space.kind, name: space.name } } : {}) };
    for (const listener of this.#openListeners) listener(open);
    return open;
  }

  async showPosts(input: { posts: string[]; note?: string; as?: string }): Promise<MentionInfo[]> {
    if (input.as && !this.core.agents.some((a) => a.name === input.as)) throw noAgentError(input.as, this.core.agents.map((a) => a.name));
    if (!input.posts?.length) throw new Error('say which posts to show');
    const note = input.note?.trim().slice(0, 500) || undefined;
    const shown: MentionInfo[] = [];
    for (const ref of input.posts.slice(0, 20)) {
      const post = await this.node.post(ref);
      shown.push(this.#mention(post, { source: 'agent', ...(input.as ? { agent: input.as } : {}), ...(note ? { note } : {}) }));
    }
    return shown;
  }

  async mentions(): Promise<MentionInfo[]> {
    return this.#mentions;
  }

  async followClaudeCode(input: { on: boolean }): Promise<ClaudeCodeFollow> {
    this.node.config = { ...this.node.config, followClaudeCode: input.on || undefined };
    saveConfig(this.node.home, this.node.config);
    if (input.on) this.startFollowing();
    else {
      this.follower?.stop();
      this.follower = undefined;
      this.appLog?.stop();
      this.appLog = undefined;
    }
    return this.claudeCode();
  }

  async claudeCode(): Promise<ClaudeCodeFollow> {
    const follower = this.follower ?? new TranscriptFollower(() => {});
    return { on: !!this.node.config.followClaudeCode, dir: follower.dir, found: existsSync(follower.dir) };
  }

  /** Follow Claude Code sessions if the person turned that on (the daemon calls this when it starts). */
  startFollowing(): void {
    if (!this.node.config.followClaudeCode || this.follower?.running) return;
    this.follower = new TranscriptFollower((said) => this.#mentionsIn(said));
    this.follower.start();
    this.appLog = new AppLogFollower(() => {
      void this.#attachExpected()
        .catch(() => {})
        .then(() => this.focusedSession())
        .then((session) => {
          for (const listener of this.#focusListeners) listener(session);
        });
    });
    this.appLog.start();
  }

  /** Links to posts in what an agent said in a Claude Code session: each post once per session and hour. */
  #mentionsIn(said: SessionText): void {
    for (const ref of postRefsIn(said.text)) {
      let post: PostInfo;
      try {
        post = postTargetOf(ref) ? this.core.postAt(postTargetOf(ref)!) : this.core.allPosts().find((p) => p.id.startsWith(ref))!;
      } catch {
        continue; // not a post you can see here
      }
      if (!post) continue;
      const hour = Date.now() - 60 * 60 * 1000;
      if (this.#mentions.some((m) => m.post.id === post.id && m.session?.id === said.session && Date.parse(m.time) > hour)) continue;
      const name = this.#sessionRecords().get(sessionKey('claude-code', said.session))?.name;
      this.#mention(post, { source: 'claude-code', session: { id: said.session, ...(name ? { name } : {}), ...(said.cwd ? { folder: basename(said.cwd) } : {}) } });
    }
  }

  #mention(post: PostInfo, how: Pick<MentionInfo, 'source'> & Partial<Pick<MentionInfo, 'agent' | 'session' | 'note'>>): MentionInfo {
    const mention: MentionInfo = {
      id: `mention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      post,
      ...how,
    };
    this.#mentions = [mention, ...this.#mentions].slice(0, 100);
    for (const listener of this.#mentionListeners) listener(mention);
    return mention;
  }

  // ---------------------------------------------------------------- sessions and their stacks

  async sessions(): Promise<SessionInfo[]> {
    const posts = new Map(this.core.allPosts().map((p) => [p.id, p]));
    return [...this.#sessionRecords().values()].sort((a, b) => b.time.localeCompare(a.time)).map((r) => this.#sessionInfo(r, posts));
  }

  async activeSessions(input: { hours?: number } = {}): Promise<SessionInfo[]> {
    const hours = Math.min(Math.max(input.hours ?? 12, 1), 24 * 14);
    const posts = new Map(this.core.allPosts().map((p) => [p.id, p]));
    const records = this.#sessionRecords();
    const out = new Map([...records.values()].map((r) => [sessionKey(r.provider, r.id), this.#sessionInfo(r, posts)]));
    for (const recent of recentSessions(Date.now() - hours * 3600 * 1000)) {
      const key = sessionKey('claude-code', recent.id);
      if (out.has(key)) continue;
      out.set(key, this.#sessionInfo({ provider: 'claude-code', id: recent.id, ...(recent.folder ? { folder: recent.folder } : {}), stack: [], time: recent.active }, posts));
    }
    const when = (s: SessionInfo) => s.active ?? s.time;
    return [...out.values()].sort((a, b) => when(b).localeCompare(when(a)));
  }

  async focusedSession(): Promise<SessionInfo | null> {
    const focus = this.appLog?.current;
    if (!focus) return null;
    // Before the app has said which Claude Code session it is, it's known by the app's id alone.
    return this.session({ provider: 'claude-code', id: focus.id ?? focus.host, host: focus.host });
  }

  async session(input: SessionRef): Promise<SessionInfo> {
    return this.#sessionInfo(this.sessionRecord(input), new Map(this.core.allPosts().map((p) => [p.id, p])));
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
    return this.#saveSession({ ...record, stack: pushOnto(record.stack, post.id, new Date().toISOString()) });
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
    const now = new Date().toISOString();
    return this.#saveSession({ ...record, stack: takeOff(record.stack, id, now), last: { post: id, time: now } });
  }

  async restack(input: { session: SessionRef; posts?: string[]; remove?: string[] }): Promise<SessionInfo> {
    const record = this.sessionRecord(input.session);
    const ids = async (refs: string[] = []) => Promise.all(refs.map(async (ref) => (await this.node.post(ref)).id));
    const remove = new Set(await ids(input.remove));
    const stack = reorder(record.stack, await ids(input.posts)).filter((s) => !remove.has(s.post));
    return this.#saveSession({ ...record, stack });
  }

  async setSessionRole(input: { session: SessionRef; role?: SessionRole | null; projects?: string[]; available?: boolean }): Promise<SessionInfo> {
    const record = this.sessionRecord(input.session);
    if (input.role !== undefined && input.role !== null && !SESSION_ROLES.includes(input.role)) throw new Error('a session is your driver or a worker');
    const role = input.role === undefined ? record.role : (input.role ?? undefined);
    const projects = input.projects === undefined ? record.projects : [...new Set(input.projects.map((p) => this.core.space(p).id))];
    const available = input.available ?? (input.role && !record.role ? true : record.available);
    const desk = this.node.config.desk;
    const isDriver = (r: { provider?: string; id: string } | undefined) => !!r && (r.provider ?? 'claude-code') === record.provider && r.id === record.id;
    if (role === 'driver') {
      // One driver: the one before goes back to being a worker.
      for (const other of this.#sessionRecords().values())
        if (other.role === 'driver' && !isDriver(other)) this.#saveSession({ ...other, role: 'worker' });
      if (desk) {
        this.node.config = { ...this.node.config, desk: { ...desk, driver: { provider: record.provider, id: record.id, ...(record.host ? { host: record.host } : {}), ...(record.folder ? { folder: record.folder } : {}) } } };
        saveConfig(this.node.home, this.node.config);
      }
    } else if (desk?.driver && isDriver(desk.driver)) {
      const { driver: _, ...rest } = desk;
      this.node.config = { ...this.node.config, desk: rest };
      saveConfig(this.node.home, this.node.config);
    }
    return this.#saveSession({ ...record, role, projects: projects?.length ? projects : undefined, available: role ? !!available : undefined });
  }

  async workers(input: { post?: string; space?: string } = {}): Promise<SessionInfo[]> {
    const space = input.post ? (await this.node.post(input.post)).space?.id : input.space ? this.core.space(input.space).id : undefined;
    const posts = new Map(this.core.allPosts().map((p) => [p.id, p]));
    const takes = (r: SessionRecord) =>
      r.role === 'driver' ? r.available !== false || space === this.node.config.desk?.space : r.role === 'worker' && !!r.available && (!space || !r.projects?.length || r.projects.includes(space));
    const when = (s: SessionInfo) => s.active ?? s.time;
    return [...this.#sessionRecords().values()]
      .filter(takes)
      .map((r) => this.#sessionInfo(r, posts))
      .filter((s) => !s.archived && !s.hidden)
      .sort((a, b) => Number(a.stack.length > 0) - Number(b.stack.length > 0) || when(b).localeCompare(when(a)));
  }

  async hideSession(input: { session: SessionRef; hidden: boolean }): Promise<SessionInfo> {
    const { hidden: _, ...record } = this.sessionRecord(input.session);
    return this.#saveSession({ ...record, ...(input.hidden ? { hidden: true as const } : {}) });
  }

  async unhideSessions(): Promise<SessionInfo[]> {
    return [...this.#sessionRecords().values()].filter((r) => r.hidden).map(({ hidden: _, ...r }) => this.#saveSession(r));
  }

  async assign(input: { post: string; session: SessionRef; as?: string }): Promise<SessionInfo> {
    const post = await this.node.post(input.post);
    const record = this.sessionRecord(input.session);
    if (!(await this.workers({ post: post.id })).some((w) => w.provider === record.provider && w.id === record.id))
      throw new Error(`that session doesn't take ${post.title} now: it isn't an available worker for its project`);
    return this.workOn({ session: input.session, post: post.id, as: input.as });
  }

  async nameSession(input: { session: SessionRef; name?: string; about?: string; description?: string; rename?: boolean }): Promise<SessionInfo> {
    const record = this.sessionRecord(input.session);
    const name = input.name?.trim();
    const about = input.about === undefined ? record.about : input.about.trim() || undefined;
    const description = input.description === undefined ? record.description : input.description.trim() || undefined;
    if (about && about.length > MAX_ABOUT) throw new Error(`about is one line, up to ${MAX_ABOUT} characters`);
    if (description && description.length > MAX_DESCRIPTION) throw new Error(`a description is up to ${MAX_DESCRIPTION} characters`);
    if (name === undefined && !record.name) throw new Error('this session has no name yet: name it first (name, with about: one line on what it specializes in)');
    if (name === '' && !input.rename) throw new Error('a session name is permanent');
    if (name && !sameName(name, record.name)) {
      // A name is for good: the session picks it once; from then on only its person changes it.
      if (record.name && !input.rename) throw new Error(`this session is ${record.name}: a name is permanent, only your person renames a session (in Weave's Sessions view)`);
      const taken = this.#takenNames(record);
      const problem = nameProblem(name, taken);
      if (problem) throw new Error(`${problem}; names around you: ${[...new Set(taken.filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b)).join(', ') || 'none yet'}`);
    }
    return this.#saveSession({ ...record, name: name === '' ? undefined : (name ?? record.name), about, description });
  }

  /** A session's avatar (Weave avatar), so you know it again; null: the one its name makes. Only you set it. */
  async setSessionAvatar(input: { session: SessionRef; avatar: Record<string, number> | null }): Promise<SessionInfo> {
    const record = this.sessionRecord(input.session);
    const avatar = input.avatar === null ? undefined : sanitizeFigure(input.avatar);
    if (input.avatar !== null && !avatar) throw new Error('an avatar is parts with whole numbers, like { "head": 1, "screen": 2 }');
    const { avatar: _old, ...rest } = record;
    return this.#saveSession({ ...rest, ...(avatar ? { avatar } : {}) });
  }

  /** Names a session can't take (except `own`'s): your other sessions', people's around you, your agents' and yours. */
  #takenNames(own: SessionRecord): Array<string | undefined> {
    const names: Array<string | undefined> = [this.node.nameOf(this.node.identity.author), ...this.core.agents.map((a) => a.name)];
    for (const r of this.#sessionRecords().values()) if (!(r.provider === own.provider && r.id === own.id)) names.push(r.name);
    const people = new Set<Did>(this.core.contacts().keys());
    for (const space of this.core.spaces.values()) for (const did of this.core.state(space).members.keys()) people.add(did);
    for (const did of people) if (did !== this.node.identity.author) names.push(this.node.nameOf(did));
    return names;
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
      await this.node.setBoard({ project: project.id, name: 'journal', title: 'Journal', type: 'posts', sort: 'new', position: 0 });
      await this.node.setBoard({ project: project.id, name: 'releases', on: false });
      await this.node.setBoard({ project: project.id, name: 'proposals', on: false });
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
    const space = this.#routineSpace(input.space);
    const posts = this.core.spacePosts(space).posts.filter((p) => p.routine);
    const now = new Date();
    return this.#routineRecords(space).map((r) => {
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
    const space = this.#routineSpace(input.space);
    this.core.maintainerState(space);
    const name = input.name?.trim();
    if (!name || name.length > 100) throw new WeaveError('daemon.routine.name', undefined, 'a routine needs a name (up to 100 characters)');
    const trigger = parseTrigger(input.trigger);
    if (!trigger) throw new WeaveError('daemon.routine.trigger', undefined, 'a routine runs on a schedule (days 0-6, Sunday is 0, and a time like 08:00) or at first start');
    const create = parseCreate(input.create);
    if (!create) throw new Error('say what the routine creates: a board and a title pattern ({date}, {day}, {weekday})');
    this.core.board(space, this.core.spacePosts(space).boards, create.board);
    const id = input.id?.trim() || randomUUID().slice(0, 8);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ROUTINE, body: { id, name, on: input.on !== false, trigger, create } as unknown as Json }));
    return (await this.routines({ space: space.id })).find((r) => r.id === id)!;
  }

  async removeRoutine(input: { space?: string; id: string }): Promise<void> {
    const space = this.#routineSpace(input.space);
    this.core.maintainerState(space);
    if (!this.#routineRecords(space).some((r) => r.id === input.id)) throw new Error('no such routine');
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_ROUTINE, body: { id: input.id, removed: true } }));
  }

  async runRoutine(input: { space?: string; id: string }): Promise<PostInfo> {
    const space = this.#routineSpace(input.space);
    const routine = this.#routineRecords(space).find((r) => r.id === input.id);
    if (!routine) throw new Error('no such routine');
    const now = new Date();
    return this.#runOccurrence(space, routine, routine.trigger.type === 'first-start' ? 'first-start' : dayKey(now), now);
  }

  /**
   * Create what's due: today's item of every scheduled routine whose time has come and that you made
   * (in a shared project, only its author's Weave runs it). The daemon calls this every minute.
   */
  async tickRoutines(now = new Date()): Promise<PostInfo[]> {
    const made: PostInfo[] = [];
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'project') continue;
      for (const routine of this.#routineRecords(space)) {
        if (routine.by !== this.node.identity.author) continue;
        const occurrence = dueOccurrence(routine, now);
        if (!occurrence || this.#occurrence(space, routine.id, occurrence)) continue;
        made.push(await this.#runOccurrence(space, routine, occurrence, now));
      }
    }
    return made;
  }

  #routineSpace(ref?: string): StoredSpace {
    const id = ref ?? this.node.config.desk?.space;
    if (!id) throw new Error('set up your desk first, or say which project');
    const space = this.core.space(id);
    if (space.kind !== 'project') throw new Error('routines live in projects');
    return space;
  }

  #routineRecords(space: StoredSpace): Routine[] {
    return routinesOf(this.core.entries(space), this.core.state(space).maintainers);
  }

  #occurrence(space: StoredSpace, id: string, occurrence: string): PostInfo | undefined {
    return this.core.spacePosts(space).posts.find((p) => p.routine?.id === id && p.routine.occurrence === occurrence);
  }

  async #runOccurrence(space: StoredSpace, routine: Routine, occurrence: string, now: Date): Promise<PostInfo> {
    const existing = this.#occurrence(space, routine.id, occurrence);
    if (existing) return existing;
    const { create } = routine;
    const body: Record<string, Json> = { title: renderTitle(create.title, now), text: create.text ?? '', board: create.board, routine: { id: routine.id, occurrence } };
    if (create.prompt) body.prompt = create.prompt;
    const { id } = await this.node.publish({ kind: KIND_POST, body, space: space.id });
    const post = await this.node.post(id);
    this.core.emitLive({ type: 'routine', category: 'activity', title: routine.name, text: `${post.title} is ready`, name: 'daemon.notice.routine', values: { routine: routine.name, title: post.title }, open: { post: post.id } });
    return post;
  }

  async expectSession(input: { post?: string; folder?: string; role?: SessionRole; projects?: string[] }): Promise<void> {
    if (input.role !== undefined && !SESSION_ROLES.includes(input.role)) throw new Error('a session is your driver or a worker');
    const post = input.post ? (await this.node.post(input.post)).id : undefined;
    const projects = input.projects?.map((p) => this.core.space(p).id);
    if (!post && !input.role) throw new Error('say what the new session gets: an item, a job or both');
    this.#expected = {
      ...(post ? { post } : {}),
      ...(input.folder ? { folder: input.folder } : {}),
      ...(input.role ? { role: input.role, ...(projects?.length ? { projects } : {}) } : {}),
      until: Date.now() + 15 * 60 * 1000,
    };
  }

  folders(input: { space: string }): Promise<string[]> {
    return Promise.resolve(this.node.config.spaceFolders?.[this.core.space(input.space).id] ?? []);
  }

  /** The session Ctrl+click or the Sessions page opened has shown up in the Claude app, with its id: give it its item and its job. */
  async #attachExpected(): Promise<void> {
    const expected = this.#expected;
    const focus = this.appLog?.current;
    if (!expected || !focus?.id) return;
    if (Date.now() > expected.until) return void (this.#expected = undefined);
    // Only a session with nothing on it yet: not one you switched to on the way.
    const known = this.#sessionRecords().get(sessionKey('claude-code', focus.id));
    if (known?.stack.length || known?.role) return;
    this.#expected = undefined;
    const session = { provider: 'claude-code', id: focus.id, host: focus.host, ...(expected.folder ? { folder: expected.folder } : {}) };
    if (expected.post) await this.workOn({ session, post: expected.post });
    if (expected.role) await this.setSessionRole({ session, role: expected.role, ...(expected.projects ? { projects: expected.projects } : {}) });
  }

  async workTarget(input: { post: string; session?: SessionRef }): Promise<WorkTarget> {
    const post = await this.node.post(input.post);
    const records = [...this.#sessionRecords().values()].sort((a, b) => b.time.localeCompare(a.time));
    // The session you picked; else your desk's items go to your daily driver, others to their latest session.
    const driver = this.node.config.desk?.driver;
    const latest = input.session
      ? this.sessionRecord(input.session)
      : driver && post.space?.id === this.node.config.desk?.space
        ? this.sessionRecord(driver)
        : records.find((r) => r.stack.some((s) => s.post === post.id));
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
    return { post, ...(latest ? { session: this.#sessionInfo(latest, posts) } : {}), folders, text: lines.join('\n') };
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

  #sessionRecords(): Map<string, SessionRecord> {
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
    const records = this.#sessionRecords();
    // "Give that to Skala": a name does where no session has that id.
    const known = records.get(sessionKey(provider, id)) ?? [...records.values()].find((r) => r.provider === provider && sameName(r.name, id));
    return {
      provider,
      id: known?.id ?? id,
      ...((ref.host ?? known?.host) ? { host: ref.host ?? known?.host } : {}),
      ...((ref.folder ?? known?.folder) ? { folder: ref.folder ?? known?.folder } : {}),
      ...(known?.title ? { title: known.title } : {}),
      ...(known?.name ? { name: known.name } : {}),
      ...(known?.about ? { about: known.about } : {}),
      ...(known?.description ? { description: known.description } : {}),
      stack: known?.stack ?? [],
      ...(known?.role ? { role: known.role } : {}),
      ...(known?.projects ? { projects: known.projects } : {}),
      ...(known?.available ? { available: true } : {}),
      ...(known?.avatar ? { avatar: known.avatar } : {}),
      ...(known?.last ? { last: known.last } : {}),
      ...(known?.hidden ? { hidden: true as const } : {}),
      time: known?.time ?? new Date().toISOString(),
    };
  }

  #saveSession(record: SessionRecord): SessionInfo {
    const title = (record.provider === 'claude-code' ? transcriptTitle(record.id) : undefined) ?? record.title;
    const body: Record<string, Json> = {
      provider: record.provider,
      id: record.id,
      ...(record.host ? { host: record.host } : {}),
      ...(record.folder ? { folder: record.folder } : {}),
      ...(title ? { title } : {}),
      ...(record.name ? { name: record.name } : {}),
      ...(record.about ? { about: record.about } : {}),
      ...(record.description ? { description: record.description } : {}),
      stack: record.stack.map((s) => ({ post: s.post, since: s.since })),
      ...(record.role ? { role: record.role } : {}),
      ...(record.projects?.length ? { projects: record.projects } : {}),
      ...(record.available ? { available: true } : {}),
      ...(record.avatar ? { avatar: record.avatar as unknown as Json } : {}),
      ...(record.last ? { last: { post: record.last.post, time: record.last.time } } : {}),
      ...(record.hidden ? { hidden: true } : {}),
    };
    const event = this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_SESSION, body }));
    return this.#sessionInfo({ ...record, ...(title ? { title } : {}), time: event.time }, new Map(this.core.allPosts().map((p) => [p.id, p])));
  }

  #sessionInfo(record: SessionRecord, posts: Map<string, PostInfo>): SessionInfo {
    const brief = (item: { post: string }): SessionInfo['stack'][number]['post'] => {
      const p = posts.get(item.post);
      return p ?? { id: item.post, missing: true };
    };
    const providerTitle = (record.provider === 'claude-code' ? transcriptTitle(record.id) : undefined) ?? record.title;
    const title = sessionTitle({ ...record, title: providerTitle });
    const active = record.provider === 'claude-code' ? transcriptActive(record.id) : undefined;
    const host = record.host ?? (record.provider === 'claude-code' ? this.appLog?.hostOf(record.id) : undefined);
    return {
      provider: record.provider,
      id: record.id,
      ...(active ? { active } : {}),
      ...(host ? { host } : {}),
      ...(record.folder ? { folder: record.folder } : {}),
      ...(title ? { title } : {}),
      ...(record.name ? { name: record.name } : {}),
      ...(record.about ? { about: record.about } : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(providerTitle ? { providerTitle } : {}),
      stack: record.stack.map((s) => ({ post: brief(s), since: s.since })),
      ...(record.role ? { role: record.role } : {}),
      ...(record.projects?.length
        ? { projects: record.projects.map((id) => this.core.spaces.get(id)).filter((s): s is StoredSpace => !!s).map((s) => ({ id: s.id, kind: s.kind, name: s.name })) }
        : {}),
      ...(record.available ? { available: true } : {}),
      ...(record.avatar ? { avatar: record.avatar } : {}),
      ...(record.last ? { last: { post: brief(record.last), time: record.last.time } } : {}),
      ...(record.provider === 'claude-code' && this.#archived.ids.has(record.id) ? { archived: true as const } : {}),
      ...(record.hidden ? { hidden: true as const } : {}),
      time: record.time,
    };
  }

  async permissionRequests(): Promise<PermissionRequest[]> {
    return this.#requests().filter((r) => r.state === 'pending' && this.core.agents.some((a) => a.name === r.agent));
  }

  async answerPermission(input: { id: string; allow: boolean }): Promise<PermissionRequest> {
    const requests = this.#requests();
    const request = requests.find((r) => r.id === input.id);
    if (!request) throw new Error('no such request (it may have been answered already)');
    if (request.state !== 'pending') return request;
    if (input.allow && request.hand) {
      // Added to what the project has from that app: handing replaces it.
      const { keyvault, app, project, resources } = request.hand;
      const had = this.core.keyvaults.list().find((k) => k.name === keyvault)?.apps.find((a) => a.key === app)?.handed[project.id] ?? [];
      await this.node.handKeyvault({ name: keyvault, app, project: project.id, resources: [...new Set([...had, ...resources])] });
    } else if (input.allow) {
      const agent = this.core.agents.find((a) => a.name === request.agent);
      if (!agent) throw new Error(`the agent ${request.agent} is gone`);
      await this.node.updateAgent({ name: agent.name, permissions: [...agent.permissions, ...request.kinds] });
    }
    request.state = input.allow ? 'allowed' : 'declined';
    writeJson(this.#requestsFile, requests);
    this.core.emitLive();
    return request;
  }
}
