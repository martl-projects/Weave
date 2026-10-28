import { parseBlobRef } from './blobs.ts';
import type { Json } from './bytes.ts';
import { isDid, type Did } from './keys.ts';
import { parseManifest, type AppManifest } from './rooms.ts';

/*
 * Mark services (docs/v2-stage19.md): what shows next to a name, from an issuer you or a space chose. A mark service
 * is a pure WebAssembly component (the marks world of packages/sdk/wit/service.wit) every node runs over what it
 * holds: no key, no network, so the same events give the same marks. Its domain decides where it shows.
 *
 *   weave.marks.pin   {service, origin: {project, release}, manifest, settings, gate, on}
 *                     in a project or community, by its maintainers: the space's own mark service, shown only in
 *                     its views; `gate`: the one its gates ask (stage 18). The latest per service counts.
 *   weave.marks.mine  {service, origin, manifest, settings, follow, via, on}
 *                     sealed for yourself: a service in your own domain, shown everywhere you look. `follow`: the
 *                     newest release of its project runs; `via: "bundle"`: your app's bundle brought it (Weave's own).
 *   weave.official    {subject, on, note}
 *                     in the From Weave project, by its maintainers: something that really comes from Weave
 *                     (a person, a project, a service). From Weave folds them; the latest per subject counts.
 */
export const KIND_MARKS_PIN = 'weave.marks.pin';
export const KIND_MARKS_MINE = 'weave.marks.mine';
export const KIND_OFFICIAL = 'weave.official';

/** The places in the app that ask for marks; `gate` is asked of a space's gate service only. */
export const MARK_SLOTS = ['member', 'author', 'chat', 'profile', 'gate'] as const;
export type MarkSlot = (typeof MARK_SLOTS)[number];
/** What a mark is about: a person, a space, or a post. */
export const MARK_SUBJECTS = ['did', 'space', 'post'] as const;
export type MarkSubjectKind = (typeof MARK_SUBJECTS)[number];
export type MarkSubject = { did: Did } | { space: string } | { post: string };

/** The kinds of mark: the whole vocabulary. Anything else a service answers is dropped. */
export const MARK_KINDS = ['check', 'label', 'count', 'symbol', 'image'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export const MARK_LIMITS = {
  label: 16,
  tooltip: 200,
  /** Marks one service gives one subject. */
  perSubject: 3,
  /** Subjects one ask may name. */
  subjects: 200,
  /** The largest state a service may keep, in characters of JSON. */
  state: 1_000_000,
} as const;

/** A mark as the vocabulary allows it. */
export interface Mark {
  kind: MarkKind;
  /** A label's text (at most 16 characters). */
  text?: string;
  /** A count's number. */
  count?: number;
  /** An emoji. */
  symbol?: string;
  /** A picture: a wblob: reference, served by the node. */
  image?: string;
  /** Plain text on hover, at most 200 characters. */
  tooltip?: string;
  /** An event the mark is about (a badge), which a click opens in the app's own view of it. */
  ref?: string;
}

/** Where a mark service's component is in its package, what it reads, and where it answers. */
export interface AppMarks {
  component: string;
  /** The kinds of events it folds. */
  reads: string[];
  slots: MarkSlot[];
  subjects: MarkSubjectKind[];
}

/** A mark service in a domain: a release, and its settings there. */
export interface MarkService {
  /** Its app id: one per domain. */
  service: string;
  name: string;
  tag: string;
  origin: { project: string; release: string };
  manifest: AppManifest;
  settings: Json;
  /** A space's gate service (stage 18). */
  gate?: true;
  /** Yours only: the newest release of its project runs. */
  follow?: true;
  /** Yours only: your app's bundle brought it. */
  via?: 'bundle';
  by: Did;
  time: string;
}

const KIND = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
/** An emoji or a sign (a badge's ★): no letters, digits, spaces or controls, and never a check (that's From Weave's). */
const SYMBOL = /^(?!.*[✓✔☑✅√])[^\p{L}\p{N}\p{Z}\p{Cc}\s]{1,8}$/u;

/** The marks part of a manifest from untrusted input: the part, or why not. */
export function parseAppMarks(raw: unknown, component: string | undefined): { marks?: AppMarks; problem?: string } {
  const m = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  const reads = [...new Set(list(m.reads).filter((k) => KIND.test(k)))].slice(0, 20);
  const slots = [...new Set(list(m.slots))].filter((s): s is MarkSlot => (MARK_SLOTS as readonly string[]).includes(s));
  const subjects = [...new Set(list(m.subjects))].filter((s): s is MarkSubjectKind => (MARK_SUBJECTS as readonly string[]).includes(s));
  if (!component || !/\.wasm$/i.test(component)) return { problem: '"marks.component" is where its component is in the package, like "marks.wasm"' };
  if (!slots.length) return { problem: `"marks.slots" names where it answers: ${MARK_SLOTS.join(', ')}` };
  if (!subjects.length) return { problem: `"marks.subjects" names what it marks: ${MARK_SUBJECTS.join(', ')}` };
  return { marks: { component, reads, slots, subjects } };
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);

/** A mark service from a pin's (or your own) body, or undefined when it isn't one (a released mark service). */
export function parseMarkService(body: Json, by: Did, time: string): MarkService | undefined {
  const origin = field(body, 'origin') as Record<string, unknown> | undefined;
  const project = typeof origin?.project === 'string' ? origin.project : '';
  const release = typeof origin?.release === 'string' ? origin.release : '';
  if (!ID.test(project) || !ID.test(release)) return undefined;
  let manifest: AppManifest;
  try {
    manifest = parseManifest(field(body, 'manifest'));
  } catch {
    return undefined;
  }
  if (!manifest.marks || !manifest.install?.tag || !(manifest.install.image || manifest.install.assets?.wasm)) return undefined;
  const settings = field(body, 'settings');
  return {
    service: manifest.app,
    name: manifest.name,
    tag: manifest.install.tag,
    origin: { project, release },
    manifest,
    settings: settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Json) : {},
    ...(field(body, 'gate') === true ? { gate: true as const } : {}),
    ...(field(body, 'follow') === true ? { follow: true as const } : {}),
    ...(field(body, 'via') === 'bundle' ? { via: 'bundle' as const } : {}),
    by,
    time,
  };
}

/**
 * The mark services in a list of events (a space's pins, by its maintainers; or your own): the latest per service
 * counts, and `on: false` takes it away. In time order.
 */
export function markServicesOf(entries: Array<{ kind: string; body: Json; event: { author: Did; time: string; signer?: string; seq?: number } }>, kind: string, by?: Set<Did>): MarkService[] {
  const out = new Map<string, MarkService>();
  const sorted = entries.filter((e) => e.kind === kind && (!by || by.has(e.event.author))).sort((a, b) => a.event.time.localeCompare(b.event.time) || (a.event.seq ?? 0) - (b.event.seq ?? 0));
  for (const e of sorted) {
    const service = field(e.body, 'service');
    if (typeof service !== 'string') continue;
    if (field(e.body, 'on') === false) {
      out.delete(service);
      continue;
    }
    const parsed = parseMarkService(e.body, e.event.author, e.event.time);
    if (parsed && parsed.service === service) out.set(service, parsed);
  }
  return [...out.values()];
}

/** The key a subject is answered under: did:…, space:…, post:…. */
export function subjectKey(s: MarkSubject): string {
  return 'did' in s ? s.did : 'space' in s ? `space:${s.space}` : `post:${s.post}`;
}

/** A subject from untrusted input, of a kind this list allows. */
export function parseSubject(raw: unknown): MarkSubject | undefined {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (isDid(s.did)) return { did: s.did };
  if (typeof s.space === 'string' && ID.test(s.space)) return { space: s.space };
  if (typeof s.post === 'string' && ID.test(s.post)) return { post: s.post };
  return undefined;
}

/** One mark from untrusted input, as the vocabulary allows it, or undefined. */
export function checkMark(raw: unknown): Mark | undefined {
  const m = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const kind = m.kind as MarkKind;
  if (!(MARK_KINDS as readonly string[]).includes(kind)) return undefined;
  const plain = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
  const tooltip = plain(m.tooltip, MARK_LIMITS.tooltip);
  const ref = typeof m.ref === 'string' && ID.test(m.ref) ? m.ref : undefined;
  const extra = { ...(tooltip ? { tooltip } : {}), ...(ref ? { ref } : {}) };
  const symbol = typeof m.symbol === 'string' && SYMBOL.test(m.symbol) ? m.symbol : undefined;
  switch (kind) {
    case 'check':
      return { kind, ...extra };
    case 'label': {
      const text = plain(m.text, MARK_LIMITS.label);
      return text ? { kind, text, ...extra } : undefined;
    }
    case 'count': {
      const count = Number(m.count);
      return Number.isInteger(count) && count >= 0 && count <= 1e9 ? { kind, count, ...extra } : undefined;
    }
    case 'symbol':
      return symbol ? { kind, symbol, ...extra } : undefined;
    case 'image':
      // A picture held as a blob; its symbol shows until (or where) the picture can't.
      return parseBlobRef(m.image) ? { kind, image: m.image as string, ...(symbol ? { symbol } : {}), ...extra } : undefined;
  }
}

/**
 * A service's answer from untrusted input: marks for the subjects it was asked about (no others), as the
 * vocabulary allows them, at most three per subject.
 */
export function checkMarkAnswer(raw: unknown, asked: MarkSubject[]): Map<string, Mark[]> {
  const keys = new Set(asked.map(subjectKey));
  const out = new Map<string, Mark[]>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const subject = parseSubject((entry as { subject?: unknown })?.subject);
    if (!subject) continue;
    const key = subjectKey(subject);
    if (!keys.has(key) || out.has(key)) continue;
    const marks = (Array.isArray((entry as { marks?: unknown }).marks) ? ((entry as { marks: unknown[] }).marks) : []).map(checkMark).filter((m): m is Mark => !!m).slice(0, MARK_LIMITS.perSubject);
    if (marks.length) out.set(key, marks);
  }
  return out;
}
