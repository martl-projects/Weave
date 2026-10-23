import { closeSync, existsSync, openSync, readdirSync, readSync, statSync, watch, type FSWatcher } from 'node:fs';
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
