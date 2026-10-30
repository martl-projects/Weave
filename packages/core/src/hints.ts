import type { Json } from './bytes.ts';

/*
 * Hint services (docs/v2-stage20.md): what your own state is, next to places ("3 unread") and on messages, from
 * services you chose. A hint service is a pure WebAssembly component of the marks world (packages/sdk/wit/service.wit),
 * as a mark service is, but what it says is never a claim about someone: a count, a tint, a sign, all from a fixed
 * vocabulary the app draws itself, deciding nothing, never signed or shared. It's yours only (your own domain): it folds what your node holds
 * of the kinds it reads, including what's sealed to you, and the notices your node works out for you
 * (weave.notice). The one Weave ships (Unread, packages/shipped/unread) counts those until you open the place.
 *
 *   weave.hints.mine  {service, origin, manifest, settings, on} or {service, shipped: true, settings?, on}
 *                     sealed for yourself: a hint service in your own domain, the release you said yes to (a newer
 *                     one only with another yes). The ones Weave ships are yours without one, until you turn one off;
 *                     their settings (Unread's rules) are kept the same way.
 *   weave.seen        {space, view: "all" | "channel" | "board" | "post", name?, time} or {all: true, time}
 *                     sealed for yourself: you opened a place (a whole chat or space, a channel, a board, a post) at
 *                     that time, on any of your devices. {all: true}: everything before then counts as seen (the
 *                     first start, so nothing old counts).
 *   weave.notice      not an event: what the node feeds hint services that read it, one per event that is a notice
 *                     for you: {type, category, from, space, board?, channel?, post?}, at the event's time.
 */
export const KIND_HINTS_MINE = 'weave.hints.mine';
export const KIND_SEEN = 'weave.seen';
export const KIND_NOTICE = 'weave.notice';

/** The places in the app that ask for hints: next to a place in Places, and on a message in a chat. */
export const HINT_SLOTS = ['place', 'message'] as const;
export type HintSlot = (typeof HINT_SLOTS)[number];
/** What a hint is about: a space (a chat, group, project or community), one of its boards or channels, or a message. */
export const HINT_SUBJECTS = ['space', 'board', 'channel', 'message'] as const;
export type HintSubjectKind = (typeof HINT_SUBJECTS)[number];
export type HintSubject =
  | { space: string }
  | { board: { space: string; name: string } }
  | { channel: { space: string; name: string } }
  | { message: { space: string; id: string } };

/**
 * The kinds of hint: a number (places only), a tint (the place's or message's background) and a sign (a small symbol
 * under the number, or next to the author). Tones and signs are names the app draws in its own look: a service never
 * picks a color or an image.
 */
export const HINT_KINDS = ['count', 'tint', 'sign'] as const;
export type HintKind = (typeof HINT_KINDS)[number];
export const HINT_TONES = ['yellow', 'green', 'blue', 'red', 'purple'] as const;
export type HintTone = (typeof HINT_TONES)[number];
export const HINT_SIGNS = ['heart', 'star', 'flag', 'bell'] as const;
export type HintSign = (typeof HINT_SIGNS)[number];

export interface Hint {
  kind: HintKind;
  count?: number;
  tone?: HintTone;
  sign?: HintSign;
  /** Plain text on hover, at most 200 characters. */
  tooltip?: string;
}

/** The views a seen event covers. */
export const SEEN_VIEWS = ['all', 'channel', 'board', 'post'] as const;
export type SeenView = (typeof SEEN_VIEWS)[number];
export type Seen = { space: string; view: SeenView; name?: string; time: string } | { all: true; time: string };

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const NAME = /^[A-Za-z0-9_.~-]{1,100}$/;

/** The key a subject is answered under: space:…, board:…/…, channel:…/…, message:…/…. */
export function hintKey(s: HintSubject): string {
  if ('space' in s) return `space:${s.space}`;
  if ('board' in s) return `board:${s.board.space}/${s.board.name}`;
  if ('channel' in s) return `channel:${s.channel.space}/${s.channel.name}`;
  return `message:${s.message.space}/${s.message.id}`;
}

/** Which kind of subject it is. */
export const hintSubjectKind = (s: HintSubject): HintSubjectKind => Object.keys(s)[0] as HintSubjectKind;

/** A subject from untrusted input. */
export function parseHintSubject(raw: unknown): HintSubject | undefined {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const place = (value: unknown) => {
    const p = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    return typeof p.space === 'string' && ID.test(p.space) && typeof p.name === 'string' && NAME.test(p.name) ? { space: p.space, name: p.name } : undefined;
  };
  if (typeof s.space === 'string' && ID.test(s.space)) return { space: s.space };
  const board = place(s.board);
  if (board) return { board };
  const channel = place(s.channel);
  if (channel) return { channel };
  const m = (s.message && typeof s.message === 'object' ? s.message : {}) as Record<string, unknown>;
  if (typeof m.space === 'string' && ID.test(m.space) && typeof m.id === 'string' && ID.test(m.id)) return { message: { space: m.space, id: m.id } };
  return undefined;
}

/** One hint from untrusted input, as the vocabulary allows it in this slot, or undefined. */
export function checkHint(raw: unknown, slot: HintSlot = 'place'): Hint | undefined {
  const h = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const tooltip = typeof h.tooltip === 'string' ? h.tooltip.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : '';
  const extra = tooltip ? { tooltip } : {};
  if (h.kind === 'count') {
    if (slot !== 'place') return undefined;
    const count = Number(h.count);
    // Zero says nothing: no hint.
    return Number.isInteger(count) && count > 0 && count <= 1e9 ? { kind: 'count', count, ...extra } : undefined;
  }
  if (h.kind === 'tint') return (HINT_TONES as readonly unknown[]).includes(h.tone) ? { kind: 'tint', tone: h.tone as HintTone, ...extra } : undefined;
  if (h.kind === 'sign') return (HINT_SIGNS as readonly unknown[]).includes(h.sign) ? { kind: 'sign', sign: h.sign as HintSign, ...extra } : undefined;
  return undefined;
}

/**
 * A service's answer from untrusted input: for each subject it was asked about (no others), its hints, at most one of
 * each kind. An entry is {subject, hint} or {subject, hints: [...]}.
 */
export function checkHintAnswer(raw: unknown, asked: HintSubject[], slot: HintSlot = 'place'): Map<string, Hint[]> {
  const keys = new Set(asked.map(hintKey));
  const out = new Map<string, Hint[]>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = (entry && typeof entry === 'object' ? entry : {}) as { subject?: unknown; hint?: unknown; hints?: unknown };
    const subject = parseHintSubject(e.subject);
    if (!subject) continue;
    const key = hintKey(subject);
    if (!keys.has(key)) continue;
    const hints = out.get(key) ?? [];
    for (const one of Array.isArray(e.hints) ? e.hints.slice(0, 10) : [e.hint]) {
      const hint = checkHint(one, slot);
      if (hint && !hints.some((h) => h.kind === hint.kind)) hints.push(hint);
    }
    if (hints.length) out.set(key, hints);
  }
  return out;
}

/** A seen event's body from untrusted input. */
export function parseSeen(body: Json, time: string): Seen | undefined {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const at = typeof b.time === 'string' && !Number.isNaN(Date.parse(b.time)) ? b.time : time;
  if (b.all === true) return { all: true, time: at };
  if (typeof b.space !== 'string' || !ID.test(b.space)) return undefined;
  const view = (SEEN_VIEWS as readonly string[]).includes(b.view as string) ? (b.view as SeenView) : 'all';
  const name = typeof b.name === 'string' && NAME.test(b.name) ? b.name : undefined;
  if (view !== 'all' && !name) return undefined;
  return { space: b.space, view, ...(view !== 'all' ? { name } : {}), time: at };
}

/** Where a hint service's component is in its package, what it reads, and where it answers. */
export interface AppHints {
  component: string;
  /** The kinds of events it folds: weave.notice and weave.seen too. */
  reads: string[];
  slots: HintSlot[];
  subjects: HintSubjectKind[];
}

const KIND = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

/** The hints part of a manifest from untrusted input: the part, or why not. */
export function parseAppHints(raw: unknown, component: string | undefined): { hints?: AppHints; problem?: string } {
  const m = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  const reads = [...new Set(list(m.reads).filter((k) => KIND.test(k)))].slice(0, 20);
  const slots = [...new Set(list(m.slots))].filter((s): s is HintSlot => (HINT_SLOTS as readonly string[]).includes(s));
  const subjects = [...new Set(list(m.subjects))].filter((s): s is HintSubjectKind => (HINT_SUBJECTS as readonly string[]).includes(s));
  if (!component || !/\.wasm$/i.test(component)) return { problem: '"hints.component" is where its component is in the package, like "hints.wasm"' };
  if (!slots.length) return { problem: `"hints.slots" names where it answers: ${HINT_SLOTS.join(', ')}` };
  if (!subjects.length) return { problem: `"hints.subjects" names what it counts: ${HINT_SUBJECTS.join(', ')}` };
  return { hints: { component, reads, slots, subjects } };
}
