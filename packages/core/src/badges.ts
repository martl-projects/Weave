import { sha256 } from '@noble/hashes/sha2.js';
import { parseBlobRef } from './blobs.ts';
import { b64u, utf8 } from './bytes.ts';
import type { Box } from './crypto.ts';
import { isDid, type Did } from './keys.ts';
import { recordOrder, type WeaveRecord } from './records.ts';

/*
 * Badges: lasting recognition from a project. A membership buys access and
 * runs out; a badge stays. Like memberships, badges never buy votes or access.
 *
 *   weave.badge.series    {series, name, symbol, image, description, limit, project}
 *                         public, by a maintainer of the project: a kind of badge; image is an
 *                         uploaded picture (wblob: reference) shown next to the holder's name. The first
 *                         event of a series fixes its limit (how many there can ever be); later
 *                         ones may change the name, symbol and description, never the limit.
 *   weave.badge           {series, n, to, note, ref, personal}
 *                         public, by the series' issuer: badge number n of the series, given to
 *                         `to`; `ref` is what it's for (e.g. the post an idea came from).
 *                         `personal` {hash, boxes}: a personal note, boxed to `to` (and the issuer)
 *                         as {text, salt}; the public hash commits to it (badgeNoteHash)
 *   weave.badge.note      {badge, text, salt, on}
 *                         public, by the one the badge was given to: publishes its personal note,
 *                         or (on: false) takes it back; the latest counts. It shows only if text and
 *                         salt match the hash the issuer signed, so the words are provably theirs.
 *   weave.badge.transfer  {badge, from, to}
 *                         public, by the badge's current holder: passes it on. `from` is the
 *                         badge's id for its first transfer, else the previous transfer's id.
 *
 * Everything is signed, so anyone can check that a badge came from its issuer.
 * Nobody can stop an issuer from signing number 21 of 20, or number 7 twice;
 * but both are provable from the issuer's own signatures, so the series shows
 * as broken to everyone, for good. A holder who passes one badge on twice from
 * the same point has the same problem: the earlier transfer counts, the badge
 * shows as contested.
 */
export const KIND_BADGE_SERIES = 'weave.badge.series';
export const KIND_BADGE = 'weave.badge';
export const KIND_BADGE_TRANSFER = 'weave.badge.transfer';
export const KIND_BADGE_NOTE = 'weave.badge.note';

/** How long a personal note can be. */
export const BADGE_NOTE_MAX = 2000;

/** What the issuer commits to in a badge's personal note: its text, with a random salt so the hash gives nothing away. */
export const badgeNoteHash = (text: string, salt: string): string => b64u.encode(sha256(new Uint8Array([...utf8('weave/badge-note/v1'), ...b64u.decode(salt), ...utf8(text)])));

/** The most badges a limited series can have. */
export const BADGE_LIMIT_MAX = 100_000;

export interface BadgeSeries {
  id: string;
  issuer: Did;
  name: string;
  /** A short symbol (an emoji) shown next to the name. */
  symbol: string;
  /** Its picture (wblob: reference), shown next to the holder's name instead of the symbol. */
  image?: string;
  description: string;
  /** How many there can ever be; undefined: no limit. */
  limit?: number;
  /**
   * The project it claims to be from. Only a node in that project can check
   * that the issuer maintains it: `checked` says it did; false means it can't.
   */
  project?: { id: string; name: string; checked?: boolean };
  /** Badges given so far (valid ones). */
  given: number;
  /** The issuer signed more than the limit, or one number twice. */
  broken: boolean;
  time: string;
}

export interface Badge {
  /** The id of the event that gave it. */
  id: string;
  series: string;
  issuer: Did;
  n: number;
  /** Who it was given to first. */
  to: Did;
  holder: Did;
  /** Everyone who held it, from the first to today's holder. */
  holders: Did[];
  /** Where its next transfer continues from: its own id, or its latest transfer's. */
  head: string;
  note: string;
  ref?: string;
  /** A personal note from the issuer: boxed to the one it was given to; `published` once they made it public. */
  personal?: { hash: string; boxes: Box[]; published?: string };
  time: string;
  /** Not valid: over the limit, or a number the issuer gave twice. */
  invalid?: 'over-limit' | 'duplicate';
  /** A holder passed it on twice from the same point; the earlier transfer counts. */
  contested?: true;
}

const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const bodyOf = (event: WeaveRecord): Record<string, unknown> => (event.body && typeof event.body === 'object' ? (event.body as Record<string, unknown>) : {});

/** A personal note's public part from untrusted input: its hash and the boxes holding it. */
function personalOf(value: unknown): { hash: string; boxes: Box[] } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { hash, boxes } = value as Record<string, unknown>;
  if (typeof hash !== 'string' || !hash || !Array.isArray(boxes)) return undefined;
  const valid = boxes.filter((b): b is Box => !!b && typeof b === 'object' && ['epk', 'nonce', 'ct'].every((k) => typeof (b as Record<string, unknown>)[k] === 'string')).slice(0, 4);
  return { hash: hash.slice(0, 100), boxes: valid };
}

/** A limit from untrusted input: a whole number from 1 to BADGE_LIMIT_MAX, or undefined. */
export function parseBadgeLimit(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= BADGE_LIMIT_MAX ? n : undefined;
}

/** All series and badges in these events, checked against each other. */
export function badgesOf(events: WeaveRecord[]): { series: BadgeSeries[]; badges: Badge[] } {
  const sorted = events.filter((e) => e.kind === KIND_BADGE_SERIES || e.kind === KIND_BADGE || e.kind === KIND_BADGE_TRANSFER || e.kind === KIND_BADGE_NOTE).sort(recordOrder);

  const series = new Map<string, BadgeSeries>();
  for (const event of sorted) {
    if (event.kind !== KIND_BADGE_SERIES) continue;
    const body = bodyOf(event);
    const id = str(body.series, 100);
    const name = str(body.name, 40).trim();
    if (!id || !name) continue;
    const before = series.get(id);
    if (before && before.issuer !== event.author) continue; // a series belongs to whoever started it
    const project = body.project && typeof body.project === 'object' ? (body.project as Record<string, unknown>) : undefined;
    const limit = before ? before.limit : parseBadgeLimit(body.limit);
    series.set(id, {
      id,
      issuer: event.author,
      name,
      symbol: str(body.symbol, 8),
      ...(parseBlobRef(body.image) ? { image: body.image as string } : {}),
      description: str(body.description, 1000),
      ...(limit ? { limit } : {}),
      ...(project && str(project.id, 100) ? { project: { id: str(project.id, 100), name: str(project.name, 80) } } : (before?.project ? { project: before.project } : {})),
      given: 0,
      broken: false,
      time: before?.time ?? event.time,
    });
  }

  const badges = new Map<string, Badge>();
  const byNumber = new Map<string, Badge>();
  for (const event of sorted) {
    if (event.kind !== KIND_BADGE) continue;
    const body = bodyOf(event);
    const s = series.get(str(body.series, 100));
    const n = Number(body.n);
    if (!s || s.issuer !== event.author || !Number.isInteger(n) || !isDid(body.to)) continue;
    const ref = str(body.ref, 200);
    const personal = personalOf(body.personal);
    const badge: Badge = { id: event.id, series: s.id, issuer: s.issuer, n, to: body.to, holder: body.to, holders: [body.to], head: event.id, note: str(body.note, 500), ...(ref ? { ref } : {}), ...(personal ? { personal } : {}), time: event.time };
    if (n < 1 || (s.limit && n > s.limit)) {
      badge.invalid = 'over-limit';
      s.broken = true;
    } else {
      const key = `${s.id}#${n}`;
      const first = byNumber.get(key);
      if (first) {
        first.invalid = badge.invalid = 'duplicate';
        s.broken = true;
      } else byNumber.set(key, badge);
    }
    badges.set(badge.id, badge);
  }

  // Follow each badge from holder to holder: from each step, the holder's transfer counts. Passed on twice from one
  // point, the one their key numbered first counts (its date is only their claim), and the badge shows as contested.
  const steps = new Map<string, WeaveRecord[]>();
  for (const event of sorted) {
    if (event.kind !== KIND_BADGE_TRANSFER) continue;
    const body = bodyOf(event);
    if (!isDid(body.to)) continue;
    const step = `${str(body.badge, 100)}:${str(body.from, 100)}`;
    const list = steps.get(step);
    if (list) list.push(event);
    else steps.set(step, [event]);
  }
  const firstOf = (a: WeaveRecord, b: WeaveRecord) => (a.signer === b.signer ? a.seq - b.seq : recordOrder(a, b));
  for (const badge of badges.values()) {
    for (let hops = 0; hops < 10_000; hops++) {
      const from = (steps.get(`${badge.id}:${badge.head}`) ?? []).filter((e) => e.author === badge.holder);
      if (!from.length) break;
      const [next, ...others] = [...from].sort(firstOf);
      if (others.length) badge.contested = true; // the same holder passed it on twice from one point
      const to = bodyOf(next).to as Did;
      badge.head = next.id;
      badge.holder = to;
      badge.holders.push(to);
    }
  }

  // Personal notes made public (or taken back) by the one the badge was given to, if they match what the issuer signed.
  for (const event of sorted) {
    if (event.kind !== KIND_BADGE_NOTE) continue;
    const body = bodyOf(event);
    const badge = badges.get(str(body.badge, 100));
    if (!badge?.personal || event.author !== badge.to) continue;
    if (body.on === false) {
      delete badge.personal.published;
      continue;
    }
    const text = typeof body.text === 'string' ? body.text : '';
    const salt = typeof body.salt === 'string' ? body.salt : '';
    if (text && salt && text.length <= BADGE_NOTE_MAX && badgeNoteHash(text, salt) === badge.personal.hash) badge.personal.published = text;
  }

  for (const badge of badges.values()) if (!badge.invalid) series.get(badge.series)!.given++;
  return { series: [...series.values()], badges: [...badges.values()] };
}
