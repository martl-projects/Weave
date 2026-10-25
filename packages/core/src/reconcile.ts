import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, utf8 } from './bytes.ts';

/*
 * Range-based set reconciliation (docs/v2-stage7.md), the idea of Nostr's
 * Negentropy in Weave's JSON: two peers compare ranges of their items (sorted
 * by time, then id) by fingerprint, split only the ranges that differ, and
 * swap ids where few are left. What travels grows with the differences, not
 * with how much both hold.
 */

/** An item to reconcile: its sort key (time, then id) and its id. */
export interface ReconItem {
  key: string;
  id: string;
}

/**
 * One range [lower, upper) as sent: a fingerprint and count to compare, or
 * the sender's ids there. On the wire `lower` is left out when it is the
 * previous range's upper (see compact / expand).
 */
export interface ReconRange {
  lower: string;
  upper: string;
  fp?: string;
  n?: number;
  ids?: string[];
  /** Ids in answer to ids: nothing more is said about this range. */
  final?: true;
}

/** Few enough to just swap ids; and how many pieces a bigger range is cut into. */
export const LEAF = 32;
export const BUCKETS = 16;
export const LOWEST = '';
export const HIGHEST = '￿';

/** The sort key of an item: its claimed time, then its id. */
export const reconKey = (time: string, id: string): string => `${time}\u0001${id}`;

const M = (1n << 256n) - 1n;
const toBig = (bytes: Uint8Array) => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);
const fromBig = (n: bigint) => {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--, n >>= 8n) out[i] = Number(n & 0xffn);
  return out;
};

/** Order-independent: the sum of the ids' hashes (mod 2²⁵⁶) and their count, hashed. */
export function fingerprint(ids: string[]): string {
  let sum = 0n;
  for (const id of ids) sum = (sum + toBig(sha256(utf8(id)))) & M;
  return b64u.encode(sha256(new Uint8Array([...fromBig(sum), ...utf8(String(ids.length))])).slice(0, 16));
}

const inRange = (items: ReconItem[], lower: string, upper: string) => items.filter((i) => i.key >= lower && i.key < upper);

/** The shortest start of `key` that still sorts after `before`: a cut point needn't be a whole key. */
const cutBetween = (before: string, key: string): string => {
  for (let n = 1; n < key.length; n++) if (key.slice(0, n) > before) return key.slice(0, n);
  return key;
};

/** For the wire: a range's lower bound only where it isn't the previous range's upper. */
export const compact = (ranges: ReconRange[]): Array<Partial<ReconRange> & { upper: string }> =>
  ranges.map((r, i) => {
    const { lower, ...rest } = r;
    return i > 0 && ranges[i - 1].upper === lower ? rest : { lower, ...rest };
  });

/** From the wire: every range with its lower bound again. */
export const expand = (ranges: Array<Partial<ReconRange>>): ReconRange[] => {
  const out: ReconRange[] = [];
  for (const r of ranges) {
    if (!r || typeof r.upper !== 'string') continue;
    out.push({ ...r, lower: typeof r.lower === 'string' ? r.lower : (out.at(-1)?.upper ?? LOWEST), upper: r.upper } as ReconRange);
  }
  return out;
};

/** How the initiator opens: everything it holds, as one range. */
export const openRanges = (items: ReconItem[]): ReconRange[] => [{ lower: LOWEST, upper: HIGHEST, fp: fingerprint(items.map((i) => i.id)), n: items.length }];

/**
 * One step: the ranges the other side sent, against ours (sorted by key).
 * Returns what to send back, and the ids we lack (to fetch).
 */
export function reconcileStep(items: ReconItem[], incoming: ReconRange[]): { reply: ReconRange[]; lacking: string[] } {
  const reply: ReconRange[] = [];
  const lacking: string[] = [];
  for (const range of incoming) {
    if (typeof range.lower !== 'string' || typeof range.upper !== 'string' || range.lower >= range.upper) continue;
    const mine = inRange(items, range.lower, range.upper);
    if (Array.isArray(range.ids)) {
      const theirs = new Set(range.ids.filter((x): x is string => typeof x === 'string'));
      const ours = new Set(mine.map((i) => i.id));
      for (const id of theirs) if (!ours.has(id)) lacking.push(id);
      const extra = mine.filter((i) => !theirs.has(i.id));
      if (!range.final && extra.length) reply.push({ lower: range.lower, upper: range.upper, ids: mine.map((i) => i.id), final: true });
      continue;
    }
    if (range.fp === fingerprint(mine.map((i) => i.id)) && range.n === mine.length) continue;
    if (mine.length <= LEAF) {
      reply.push({ lower: range.lower, upper: range.upper, ids: mine.map((i) => i.id) });
      continue;
    }
    // Cut our items there into pieces of about equal size, each with its fingerprint.
    const size = Math.ceil(mine.length / BUCKETS);
    for (let start = 0; start < mine.length; start += size) {
      const piece = mine.slice(start, start + size);
      const lower = start === 0 ? range.lower : (reply.at(-1)?.upper ?? range.lower);
      const upper = start + size >= mine.length ? range.upper : cutBetween(mine[start + size - 1].key, mine[start + size].key);
      reply.push({ lower, upper, fp: fingerprint(piece.map((i) => i.id)), n: piece.length });
    }
  }
  return { reply, lacking };
}
