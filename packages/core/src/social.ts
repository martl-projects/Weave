import type { Json } from './bytes.ts';
import { isDid, type Did } from './keys.ts';

/*
 * Social edges are state: the latest event per (author, kind, subject) wins.
 *   weave.follow {subject, on}   public by default; a friend is a mutual follow
 *   weave.block  {subject, on}   private by default (sealed to yourself)
 *   weave.mute   {subject, on}   private by default
 */
export const KIND_FOLLOW = 'weave.follow';
export const KIND_BLOCK = 'weave.block';
export const KIND_MUTE = 'weave.mute';
export const EDGE_KINDS = [KIND_FOLLOW, KIND_BLOCK, KIND_MUTE] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const edgeBody = (subject: Did, on: boolean): Json => ({ subject, on });

/** An edge event after decryption, with what ordering needs. */
export interface EdgeEvent {
  author: Did;
  kind: string;
  body: Json;
  time: string;
  signer: string;
  seq: number;
}

export interface Edges {
  following: Set<Did>;
  blocked: Set<Did>;
  muted: Set<Did>;
}

const setFor = (edges: Edges, kind: string): Set<Did> | undefined =>
  kind === KIND_FOLLOW ? edges.following : kind === KIND_BLOCK ? edges.blocked : kind === KIND_MUTE ? edges.muted : undefined;

/** Current edges of every author seen. */
export function socialGraph(events: EdgeEvent[]): Map<Did, Edges> {
  const graph = new Map<Did, Edges>();
  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq);
  for (const event of sorted) {
    const body = event.body as { subject?: unknown; on?: unknown } | null;
    if (!body || !isDid(body.subject) || typeof body.on !== 'boolean' || body.subject === event.author) continue;
    const edges = graph.get(event.author) ?? { following: new Set(), blocked: new Set(), muted: new Set() };
    const set = setFor(edges, event.kind);
    if (!set) continue;
    if (body.on) set.add(body.subject);
    else set.delete(body.subject);
    graph.set(event.author, edges);
  }
  return graph;
}

/** People `me` follows who follow `me` back. */
export function friendsOf(graph: Map<Did, Edges>, me: Did): Did[] {
  return [...(graph.get(me)?.following ?? [])].filter((other) => graph.get(other)?.following.has(me));
}

export function followersOf(graph: Map<Did, Edges>, subject: Did): Did[] {
  return [...graph].filter(([, edges]) => edges.following.has(subject)).map(([author]) => author);
}
