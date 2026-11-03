import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/** What an agent said in a Claude Code session, as it was written down. */
export interface SessionText {
  text: string;
  session: string;
  /** The folder the session works in. */
  cwd?: string;
}

/** Where Claude Code keeps its session transcripts on this computer. */
export const claudeProjectsDir = (): string => join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');

/**
 * Follows Claude Code's session transcripts (projects/<folder>/<session>.jsonl)
 * and hands over what the agent writes from now on: its answers' text, nothing
 * of yours, no tool output, nothing from before it started. Transcripts are
 * Claude Code's own format and may change; lines it can't read are skipped.
 */
export class TranscriptFollower {
  readonly dir: string;
  readonly #onText: (text: SessionText) => void;
  /** Transcript file → how much of it has been read. */
  readonly #read = new Map<string, number>();
  readonly #pending = new Map<string, ReturnType<typeof setTimeout>>();
  #watcher?: FSWatcher;

  constructor(onText: (text: SessionText) => void, dir = claudeProjectsDir()) {
    this.#onText = onText;
    this.dir = dir;
  }

  /** Start at the end of every transcript there is: only what's written from now on counts. */
  start(): void {
    if (this.#watcher || !existsSync(this.dir)) return;
    for (const folder of readdirSync(this.dir, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      for (const file of readdirSync(join(this.dir, folder.name))) {
        if (file.endsWith('.jsonl')) this.#read.set(join(this.dir, folder.name, file), statSync(join(this.dir, folder.name, file)).size);
      }
    }
    this.#watcher = watch(this.dir, { recursive: true }, (_event, name) => {
      if (!name?.toString().endsWith('.jsonl')) return;
      const file = join(this.dir, name.toString());
      // Writes come in bursts: read once they settle.
      clearTimeout(this.#pending.get(file));
      this.#pending.set(file, setTimeout(() => this.#readNew(file), 250));
    });
    this.#watcher.on('error', () => this.stop());
  }

  stop(): void {
    this.#watcher?.close();
    this.#watcher = undefined;
    for (const timer of this.#pending.values()) clearTimeout(timer);
    this.#pending.clear();
  }

  get running(): boolean {
    return !!this.#watcher;
  }

  /** Read what was appended since last time (a new session's transcript from its start). */
  #readNew(file: string): void {
    this.#pending.delete(file);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return;
    }
    const from = this.#read.get(file) ?? 0;
    if (size <= from) return void this.#read.set(file, size);
    const fd = openSync(file, 'r');
    const buffer = Buffer.alloc(size - from);
    try {
      readSync(fd, buffer, 0, buffer.length, from);
    } finally {
      closeSync(fd);
    }
    // Only whole lines: a line still being written is read next time.
    const text = buffer.toString('utf8');
    const end = text.lastIndexOf('\n');
    if (end < 0) return;
    this.#read.set(file, from + Buffer.byteLength(text.slice(0, end + 1)));
    for (const line of text.slice(0, end).split('\n')) {
      const said = answerOf(line);
      if (said) this.#onText({ ...said, session: said.session || basename(file, '.jsonl') });
    }
  }
}

/** The text of one transcript line, if it is the agent answering. */
export function answerOf(line: string): SessionText | undefined {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return undefined;
  }
  const e = entry as { type?: unknown; isSidechain?: unknown; sessionId?: unknown; cwd?: unknown; message?: { role?: unknown; content?: unknown } };
  if (e?.type !== 'assistant' || e.isSidechain === true || e.message?.role !== 'assistant' || !Array.isArray(e.message.content)) return undefined;
  const text = (e.message.content as Array<{ type?: unknown; text?: unknown }>)
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
  if (!text) return undefined;
  return { text, session: typeof e.sessionId === 'string' ? e.sessionId : '', ...(typeof e.cwd === 'string' ? { cwd: e.cwd } : {}) };
}

/** A Claude Code session's transcript file, if it's on this computer. */
export function transcriptOf(session: string, dir = claudeProjectsDir()): string | undefined {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(session) || !existsSync(dir)) return undefined;
  for (const folder of readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const file = join(dir, folder.name, `${session}.jsonl`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** A Claude Code session seen in its transcript: when it last wrote, and the folder it works in. */
export interface RecentSession {
  id: string;
  /** When its transcript was last written: when it last did something. */
  active: string;
  folder?: string;
}

/** Claude Code sessions whose transcripts were written since `since` (ms), the latest first. */
export function recentSessions(since: number, dir = claudeProjectsDir()): RecentSession[] {
  if (!existsSync(dir)) return [];
  const out: RecentSession[] = [];
  for (const folder of readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const name of readdirSync(join(dir, folder.name))) {
      if (!name.endsWith('.jsonl')) continue;
      const file = join(dir, folder.name, name);
      const { mtimeMs } = statSync(file);
      if (mtimeMs < since) continue;
      out.push({ id: basename(name, '.jsonl'), active: new Date(mtimeMs).toISOString(), ...folderOf(file) });
    }
  }
  return out.sort((a, b) => b.active.localeCompare(a.active));
}

/** The folder a session works in: the cwd of its first lines. */
function folderOf(file: string): { folder?: string } {
  const length = Math.min(statSync(file).size, 64 * 1024);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, length, 0);
  } finally {
    closeSync(fd);
  }
  const cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buffer.toString('utf8'));
  if (!cwd) return {};
  try {
    return { folder: JSON.parse(`"${cwd[1]}"`) as string };
  } catch {
    return {};
  }
}

/** When a Claude Code session last wrote to its transcript. */
export function transcriptActive(session: string, dir = claudeProjectsDir()): string | undefined {
  const file = transcriptOf(session, dir);
  return file ? statSync(file).mtime.toISOString() : undefined;
}

/** The title a Claude Code session goes by (the Claude app's sidebar name): its latest custom-title line. */
export function transcriptTitle(session: string, dir = claudeProjectsDir()): string | undefined {
  const file = transcriptOf(session, dir);
  if (!file) return undefined;
  // Titles are written again and again; the end of the file has the latest.
  const size = statSync(file).size;
  const length = Math.min(size, 256 * 1024);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  let title: string | undefined;
  for (const line of buffer.toString('utf8').split('\n')) {
    if (!line.includes('"custom-title"')) continue;
    try {
      const entry = JSON.parse(line) as { type?: unknown; customTitle?: unknown };
      if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') title = entry.customTitle.slice(0, 200);
    } catch {
      // a line cut at the start of the window
    }
  }
  return title;
}

/** Where the Claude desktop app writes its log (Windows, macOS). */
export const claudeAppLog = (): string =>
  process.env.WEAVE_CLAUDE_APP_LOG ??
  (process.platform === 'darwin' ? join(homedir(), 'Library', 'Logs', 'Claude', 'main.log') : join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Claude', 'logs', 'main.log'));

/**
 * Where the Claude desktop app keeps a file per Code session (claude-code-sessions/<account>/<org>/local_….json):
 * on Windows under %LOCALAPPDATA%\Claude-Data\<install>\ (newer) or %APPDATA%\Claude\, on macOS in Application
 * Support, on Linux in ~/.config. Only the folders that exist.
 */
export function claudeAppSessionDirs(): string[] {
  if (process.env.WEAVE_CLAUDE_APP_SESSIONS) return [process.env.WEAVE_CLAUDE_APP_SESSIONS];
  const home = homedir();
  const dirs: string[] = [];
  if (process.platform === 'win32') {
    const local = join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Claude-Data');
    try {
      for (const install of readdirSync(local, { withFileTypes: true })) if (install.isDirectory()) dirs.push(join(local, install.name, 'claude-code-sessions'));
    } catch {
      // no newer install
    }
    dirs.push(join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Claude', 'claude-code-sessions'));
  } else if (process.platform === 'darwin') dirs.push(join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions'));
  else dirs.push(join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Claude', 'claude-code-sessions'));
  return dirs.filter((d) => existsSync(d));
}

/**
 * Which Claude Code sessions you archived in the Claude app, read from its session files (`cliSessionId`,
 * `isArchived`; the app's own, undocumented format: files it can't read count as not archived). Read only, never
 * written. A file is read again only when it changed. Plain Claude Code has no archive, so its sessions never are.
 */
export class ArchivedSessions {
  readonly #dirs: () => string[];
  /** File → when it was read, and the session it says is archived (if it does). */
  readonly #files = new Map<string, { mtime: number; archived?: string }>();
  #at = 0;
  #set = new Set<string>();

  constructor(dirs: () => string[] = claudeAppSessionDirs) {
    this.#dirs = dirs;
  }

  /** The archived sessions' Claude Code ids; looked at again at most once a second. */
  get ids(): Set<string> {
    if (Date.now() - this.#at < 1000) return this.#set;
    this.#at = Date.now();
    const seen = new Set<string>();
    const walk = (dir: string, depth: number) => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const file = join(dir, e.name);
        if (e.isDirectory() && depth < 3) walk(file, depth + 1);
        else if (e.isFile() && e.name.startsWith('local_') && e.name.endsWith('.json')) {
          seen.add(file);
          this.#read(file);
        }
      }
    };
    for (const dir of this.#dirs()) walk(dir, 0);
    for (const file of this.#files.keys()) if (!seen.has(file)) this.#files.delete(file);
    this.#set = new Set([...this.#files.values()].map((f) => f.archived).filter((id): id is string => !!id));
    return this.#set;
  }

  #read(file: string): void {
    let mtime: number;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      return;
    }
    if (this.#files.get(file)?.mtime === mtime) return;
    let archived: string | undefined;
    try {
      const json = JSON.parse(readFileSync(file, 'utf8')) as { cliSessionId?: unknown; isArchived?: unknown };
      if (json.isArchived === true && typeof json.cliSessionId === 'string') archived = json.cliSessionId;
    } catch {
      // being written, or not the format we know
    }
    this.#files.set(file, { mtime, ...(archived ? { archived } : {}) });
  }
}

/** The session the Claude app shows: its own id, and the Claude Code session (transcript) it is, once known. */
export interface FocusedSession {
  host: string;
  id?: string;
}

/**
 * Follows the Claude desktop app's log for the session you're looking at. It
 * notes every switch (`LocalSessions.setFocusedSession: sessionId=local_…`),
 * and, when you send a message, which Claude Code session that is (`Mapping
 * internal session local_… to CLI session <id>`). The log is the app's own and
 * undocumented: lines it doesn't recognize are ignored, and if the format
 * changes the panel simply stops following.
 */
export class AppLogFollower {
  readonly file: string;
  readonly #onFocus: (focus: FocusedSession | undefined) => void;
  /** The app's id → the Claude Code session id. */
  readonly #ids = new Map<string, string>();
  #read = 0;
  #focus?: string;
  #timer?: ReturnType<typeof setInterval>;

  constructor(onFocus: (focus: FocusedSession | undefined) => void, file = claudeAppLog()) {
    this.#onFocus = onFocus;
    this.file = file;
  }

  /** Start from the recent past (to know the current session and its id), then follow. */
  start(): void {
    if (this.#timer) return;
    try {
      this.#read = Math.max(0, statSync(this.file).size - 2 * 1024 * 1024);
    } catch {
      this.#read = 0;
    }
    this.#poll();
    this.#timer = setInterval(() => this.#poll(), 1000);
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  get current(): FocusedSession | undefined {
    return this.#focus ? this.#resolve(this.#focus) : undefined;
  }

  /** The Claude app's own id for a Claude Code session, once its log has said. */
  hostOf(id: string): string | undefined {
    for (const [host, cli] of this.#ids) if (cli === id) return host;
    return undefined;
  }

  #resolve(host: string): FocusedSession {
    // Until a message maps it, the app's id often is the session's id with a prefix.
    const guess = host.replace(/^local_/, '');
    const id = this.#ids.get(host) ?? (transcriptOf(guess) ? guess : undefined);
    return { host, ...(id ? { id } : {}) };
  }

  #poll(): void {
    let size: number;
    try {
      size = statSync(this.file).size;
    } catch {
      return;
    }
    if (size < this.#read) this.#read = 0; // the app started a new log
    if (size === this.#read) return;
    const fd = openSync(this.file, 'r');
    const buffer = Buffer.alloc(size - this.#read);
    try {
      readSync(fd, buffer, 0, buffer.length, this.#read);
    } finally {
      closeSync(fd);
    }
    const text = buffer.toString('utf8');
    const end = text.lastIndexOf('\n');
    if (end < 0) return;
    this.#read += Buffer.byteLength(text.slice(0, end + 1));
    const before = JSON.stringify(this.current);
    for (const line of text.slice(0, end).split('\n')) {
      const mapped = /Mapping internal session (local_[\w-]+) to CLI session ([\w-]+)/.exec(line);
      if (mapped) this.#ids.set(mapped[1], mapped[2]);
      // null comes between two sessions; only a real one counts
      const focused = /setFocusedSession: sessionId=(local_[\w-]+|null)/.exec(line);
      if (focused && focused[1] !== 'null') this.#focus = focused[1];
    }
    if (JSON.stringify(this.current) !== before) this.#onFocus(this.current);
  }
}
