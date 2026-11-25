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
const DEVICE = 'weave.diagnose.device';
const ANSWERED = 'weave.diagnose.answered';
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

  /**
   * This browser's name among its person's devices: what it is and four characters of its own ("iPhone k3f9"), made
   * once and kept, turned off too. It heads what is sent, and a message that asks for the lines can name it.
   */
  device(userAgent: string, random: () => string = fourCharacters): string {
    let own = this.#get(DEVICE);
    if (!own || !/^[a-z0-9]{4}$/.test(own)) {
      own = random();
      this.#set(DEVICE, own);
    }
    return `${deviceKind(userAgent)} ${own}`;
  }

  /** A message asked for the lines: true the first time it is seen here, so it is answered once (the last 30 are remembered). */
  answers(id: string): boolean {
    let answered: string[] = [];
    try {
      const kept = JSON.parse(this.#get(ANSWERED) ?? '[]') as unknown;
      if (Array.isArray(kept)) answered = kept.filter((x): x is string => typeof x === 'string');
    } catch {
      // not a list: none remembered
    }
    if (answered.includes(id)) return false;
    this.#set(ANSWERED, JSON.stringify([...answered, id].slice(-30)));
    return true;
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

const fourCharacters = (): string => [...crypto.getRandomValues(new Uint8Array(4))].map((byte) => (byte % 36).toString(36)).join('');

/** What a browser says it runs on (its user agent), in a word. */
export function deviceKind(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac';
  if (/Linux|CrOS/.test(userAgent)) return 'Linux';
  return 'Browser';
}

/**
 * A message that asks a browser for its lines: it starts with "diagnose?", and what follows names the device (words
 * of its name), or nothing: every device with this turned on answers. Written by the person or one of their agents in
 * their own group, where the lines go. `undefined`: not such a message.
 */
export function diagnoseAsked(text: string): { device: string } | undefined {
  const asked = /^\s*diagnose\?(.*)$/is.exec(text);
  return asked ? { device: asked[1].replace(/\s+/g, ' ').trim() } : undefined;
}

/** Is it this device that was asked: every word asked for is in its name (none asked for: yes). */
export function deviceAsked(name: string, wanted: string): boolean {
  const mine = name.toLowerCase();
  return wanted.toLowerCase().split(/[\s,.;:!]+/).filter(Boolean).every((word) => mine.includes(word));
}

/**
 * How smoothly something draws: told of every frame (requestAnimationFrame's time), it says every `every` ms how many
 * frames there were and how long the longest pause between two was, when that was bad: fewer than 40 a second, or a
 * pause of 200 ms and more. A pause longer than `away` isn't one: the page was put away. Safari tells of no long tasks,
 * so this is what says there how a view stutters. The same counting is in the frame of a view (lens-frame.html).
 */
export function frameMeter(say: (text: string) => void, every = 5000, away = 4000): (now: number) => void {
  let began: number | undefined;
  let last = 0;
  let frames = 0;
  let longest = 0;
  let pauses = 0;
  return (now) => {
    if (began === undefined || now - last > away) {
      began = now;
      last = now;
      frames = 0;
      longest = 0;
      pauses = 0;
      return;
    }
    const gap = now - last;
    last = now;
    frames++;
    if (gap > longest) longest = gap;
    if (gap >= 100) pauses++;
    if (now - began < every) return;
    const fps = Math.round((frames * 1000) / (now - began));
    if (fps < 40 || longest >= 200) say(`${fps} frames a second over ${Math.round((now - began) / 1000)} s, the longest pause ${Math.round(longest)} ms, ${pauses} of 100 ms and more`);
    began = now;
    frames = 0;
    longest = 0;
    pauses = 0;
  };
}
