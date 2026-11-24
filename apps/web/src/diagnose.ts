/*
 * What this browser said while Weave ran in it, kept for the person to send to themselves: on a phone nobody sees the
 * console, and a page that crashed took what it said with it. Off unless the person turns it on (Keys & devices): the
 * lines name their places and people.
 *
 * Every line is written to the browser's storage as it is said, so it is still there after the page died. A mark says
 * the page is open and where it was a few seconds ago; a page that finds the mark of the one before knows that one
 * ended without closing (it crashed, or the system took it), and says so. The lines go nowhere by themselves: sent, they
 * are messages in a group of the person's own (worker.ts, `diagnose`), which their other devices read.
 */

/** The part of the browser's storage this needs (localStorage; a map in tests). */
export interface DiagnoseStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DiagnoseSource = 'page' | 'node' | 'lens';

const ON = 'weave.diagnose';
const LOG = 'weave.diagnose.log';
const OPEN = 'weave.diagnose.open';
/** How much is kept, in characters: the oldest lines go first. A phone's storage holds a few million. */
export const DIAGNOSE_MAX = 60_000;
/** A line longer than this is cut: one line listing a hundred open calls must not push the others out. */
export const DIAGNOSE_LINE_MAX = 600;

export class Diagnose {
  readonly #store: DiagnoseStore;
  readonly #now: () => number;

  constructor(store: DiagnoseStore, now: () => number = Date.now) {
    this.#store = store;
    this.#now = now;
  }

  /** Storage may refuse (private mode, full): nothing is kept then, and nothing breaks. */
  #get(key: string): string | null {
    try {
      return this.#store.getItem(key);
    } catch {
      return null;
    }
  }

  #set(key: string, value: string | undefined): void {
    try {
      if (value === undefined) this.#store.removeItem(key);
      else this.#store.setItem(key, value);
    } catch {
      // full or refused: this line isn't kept
    }
  }

  get on(): boolean {
    return this.#get(ON) === '1';
  }

  /** Turned off, what was kept goes too. */
  set(on: boolean): void {
    this.#set(ON, on ? '1' : undefined);
    if (!on) {
      this.#set(LOG, undefined);
      this.#set(OPEN, undefined);
    }
  }

  /** One line, with when and who said it. */
  line(source: DiagnoseSource, level: string, text: string): void {
    if (!this.on) return;
    const said = text.replace(/\s+/g, ' ').trim();
    const cut = said.length > DIAGNOSE_LINE_MAX ? `${said.slice(0, DIAGNOSE_LINE_MAX)}… (${said.length} characters)` : said;
    let log = `${this.#get(LOG) ?? ''}${new Date(this.#now()).toISOString().slice(11, 23)} ${source} ${level} ${cut}\n`;
    // Whole lines from the front.
    if (log.length > DIAGNOSE_MAX) log = log.slice(log.indexOf('\n', log.length - DIAGNOSE_MAX) + 1);
    this.#set(LOG, log);
  }

  /**
   * The page opened. True when the one before ended without closing: its lines are still here, and a line says when
   * and where it was last alive.
   */
  started(about: string): boolean {
    if (!this.on) return false;
    const before = this.#get(OPEN);
    let ended = false;
    if (before) {
      const [at, ...where] = before.split(' ');
      this.line('page', 'error', `the page before ended without closing (it crashed, or the system took it): last alive ${new Date(Number(at)).toISOString()} at ${where.join(' ') || 'its start'}`);
      ended = true;
    }
    this.line('page', 'info', `opened ${new Date(this.#now()).toISOString()}: ${about}`);
    this.alive('');
    return ended;
  }

  /** Still open, and where: said every few seconds. */
  alive(where: string): void {
    if (this.on) this.#set(OPEN, `${this.#now()} ${where}`);
  }

  /** Closed as a page closes (or put away): not a crash. */
  closed(): void {
    this.#set(OPEN, undefined);
  }

  /** Everything kept, oldest first. */
  text(): string {
    return this.#get(LOG) ?? '';
  }

  /** Sent: these lines aren't sent again. Lines said since stay. */
  sent(text: string): void {
    const log = this.#get(LOG) ?? '';
    this.#set(LOG, log.startsWith(text) ? log.slice(text.length) || undefined : undefined);
  }
}

/** A text in pieces no longer than `max`, cut at line ends where it can be: one chat message each. */
export function diagnosePieces(text: string, max: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const line of text.split('\n')) {
    if (!line) continue;
    for (let rest = line; rest; rest = rest.slice(max)) {
      const part = rest.slice(0, max);
      if (piece && piece.length + part.length + 1 > max) {
        pieces.push(piece);
        piece = '';
      }
      piece += (piece ? '\n' : '') + part;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}
