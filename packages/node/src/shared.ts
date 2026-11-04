import type { Json } from '@weave/core';
import { b64u, sha256 } from '@weave/core';
import type { Did, WeaveRecord } from '@weave/core';
import type { ProjectPage } from './backend.ts';
import { isWireItemV2 } from '@weave/core';
import type { Inner } from '@weave/core';

/*
 * What the node's modules share: small constants and helpers that belong to
 * none of them (docs/node-split.md). Nothing here touches Node itself.
 */

export const DAY_MS = 24 * 3600 * 1000;

/** For the audit: what an event says, without keys, boxes, wrapped parts or ciphertext. */
export const SECRET_FIELDS = new Set(['boxes', 'box', 'wrapped', 'ct', 'nonce', 'key', 'keys', 'secret', 'boards']);
export function withoutSecrets(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_FIELDS.has(k)).map(([k, v]) => [k, withoutSecrets(v as Json)]));
  return value;
}

/** Where a node's own sealed-to-self events live. */
export const SELF_SCOPE = 'self';

/** Stage 4: how long everyone online holds a pulled space's content, how long what you open stays kept, and how many hold each event by share. */
export const RECENT_HOLD_MS = 14 * 24 * 3600 * 1000;

/** Every space of ours (but direct chats) and its keys, in our own space, for our always-on nodes (stage 18). */
export const KIND_NODE_INDEX = 'weave.node.index';

/** Content kinds that are a space's latest state, restated for newcomers along with its control events (see #carry). */
export const CARRIED_STATE = new Set(['weave.project.page', 'weave.space.photo', 'weave.app', 'weave.catalog.entry', 'weave.channel', 'weave.curate', 'weave.theme']);

export const KIND_PROFILE = 'weave.profile';

/** A project's page, sealed inside the project; the latest one by a maintainer counts. */
export const KIND_PAGE = 'weave.project.page';

/**
 * A space's photo, as those who run it set it: a picture of their own (a wblob: reference), or none (everyone's
 * avatars as a group photo), the text on the banner in it (its name when empty), and a background behind the group
 * photo (a wblob: reference; a project's banner too, unless its page has one), and whether a project's members stand
 * on its banner (members: true), who stands where in the group photo (order: dids, front row first) and how (poses:
 * did → a pose's or a scene's id, as Weave avatar names them), and whether the
 * photo stands above its member list (list; by default for groups and communities, not for projects, which have a
 * banner). The latest one counts.
 */
export const KIND_SPACE_PHOTO = 'weave.space.photo';

/** A public copy of a project's page, published by a maintainer when the project is public. */
export const KIND_PUBLIC_PROJECT = 'weave.project.public';

/** The order replica.events() returns: claimed time, then signer, then seq. */
export const replicaOrder = (a: WeaveRecord, b: WeaveRecord): number => a.time.localeCompare(b.time) || a.signer.localeCompare(b.signer) || a.seq - b.seq;

/**
 * A person's meeting point: the DHT topic their node is found on, from a secret that only their links carry (so a
 * DID, which is public, never tells where a computer is). The topic is a hash, so it never shows the secret.
 */
export const meetTopic = (secret: Uint8Array): string => `meet:${b64u.encode(new Uint8Array(sha256.create().update(new TextEncoder().encode('weave/meet-topic/v1')).update(secret).digest()))}`;

/** A meeting point's secret from a link (base64url, 32 bytes), if it carries a valid one. */
export function meetSecretOf(entry: { meet?: unknown } | undefined): Uint8Array | undefined {
  if (typeof entry?.meet !== 'string') return undefined;
  try {
    const secret = b64u.decode(entry.meet);
    return secret.length === 32 ? secret : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An event as a carry restates it: what it said, with its original signed
 * envelope (`e`) and the salt sealed with it, so that anyone can check the
 * restatement against its author's signature (the envelope signs the salted
 * hash of what it sealed, ih) without the key it was sealed with.
 */
export const carriedItem = (d: { id: string; event: { author: Did; signer: Did; seq: number; time: string; wire?: unknown }; inner: { kind: string; body: Json; salt?: string }; outer?: Inner }) => ({
  id: d.id,
  author: d.event.author,
  signer: d.event.signer,
  seq: d.event.seq,
  time: d.event.time,
  kind: d.inner.kind,
  body: d.inner.body,
  ...(isWireItemV2(d.event.wire) ? { e: d.event.wire.e as unknown as Json } : {}),
  // A read-limited board's event sealed its board blob: that's what the envelope signs, so that's what's checked (then opened with the board's key).
  ...(d.outer ? { sealed: { kind: d.outer.kind, body: d.outer.body } as unknown as Json, ...(d.outer.salt ? { salt: d.outer.salt } : {}) } : d.inner.salt ? { salt: d.inner.salt } : {}),
});

/** Who stands where on a space's group photo: people's keys, each once, front row first (at most 100). */
export const photoOrderOf = (value: unknown): Did[] =>
  Array.isArray(value) ? [...new Set(value.filter((d): d is Did => typeof d === 'string' && /^did:key:z[1-9A-HJ-NP-Za-km-z]{20,80}$/.test(d)))].slice(0, 100) : [];

/** How each one poses on a space's group photo: their key → a pose's or a scene's id (what they mean is Weave avatar's). */
export const photoPosesOf = (value: unknown): Record<Did, string> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .filter((e): e is [Did, string] => /^did:key:z[1-9A-HJ-NP-Za-km-z]{20,80}$/.test(e[0]) && typeof e[1] === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(e[1]))
          .slice(0, 100),
      )
    : {};

export const DEFAULT_PAGE: ProjectPage = { title: '', subtitle: '', body: '', description: '', status: 'active', public: false };

/** The start of a Markdown text as one plain line, for shares and older clients. */
export function summary(markdown: string, max = 300): string {
  const plain = markdown
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
