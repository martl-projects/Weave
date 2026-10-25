import type { Json } from './bytes.ts';
import { eventId, type WeaveEvent } from './events.ts';
import { classOf, type EventClass, type EventV2, type WireItemV2 } from './eventsV2.ts';
import type { Did } from './keys.ts';

/**
 * One shape for v1 and v2 events inside a node (docs/v2-stage1.md, decision 2).
 * Node code reads the same field names it read from v1 events; `wire` is what
 * travels and what the signature covers.
 */
export interface WeaveRecord {
  /** The id other events use: a v1 event's id, a re-signed event's old v1 id, else the v2 id. */
  id: string;
  v: 1 | 2;
  author: Did;
  signer: Did;
  kind: string;
  time: string;
  /** 'public', 'self' or '<kind>:<id>' (a v2 event's space). */
  scope: string;
  /** v1: the seq; v2: n. One number space per key across both. */
  seq: number;
  /** A v2 control event's position in its key's chain in its space. */
  cseq?: number;
  /** A v2 content event's position among its key's content in its space (cs). */
  cs?: number;
  class: EventClass;
  /** The body: inline for v1 and v2 control events; a v2 content event's resolved body, or null when missing. */
  body: Json;
  /** A content event whose body this node doesn't have (not fetched yet, or forgotten). */
  missing?: true;
  wire: WeaveEvent | WireItemV2;
}

export function recordOfV1(event: WeaveEvent, id = eventId(event)): WeaveRecord {
  return {
    id,
    v: 1,
    author: event.author,
    signer: event.signer,
    kind: event.kind,
    time: event.time,
    scope: event.scope,
    seq: event.seq,
    class: classOf(event.kind),
    body: event.body,
    wire: event,
  };
}

/** A v2 event as a record; `body` is a content event's body if at hand. */
export function recordOfV2(id: string, event: EventV2, body?: Json): WeaveRecord {
  const content = event.class === 'content';
  const missing = content && body === undefined;
  return {
    id,
    v: 2,
    author: event.author,
    signer: event.signer,
    kind: event.kind,
    time: event.time,
    scope: event.space,
    seq: event.n,
    ...(event.class === 'control' ? { cseq: event.seq } : event.cs ? { cs: event.cs } : {}),
    class: event.class,
    body: content ? (body ?? null) : event.body,
    ...(missing ? { missing: true as const } : {}),
    wire: content && !missing ? { e: event, b: body } : { e: event },
  };
}

/** The order events are read in: claimed time, then signer, then number. */
export const recordOrder = (a: WeaveRecord, b: WeaveRecord): number => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq;

/** What reading code needs of an event: a v1 event and a record of either version both have it. */
export type EventView = Pick<WeaveRecord, 'author' | 'signer' | 'seq' | 'cseq' | 'cs' | 'kind' | 'scope' | 'body' | 'time'>;

export const isRecord = (value: unknown): value is WeaveRecord => !!value && typeof value === 'object' && 'wire' in value && 'id' in value;
