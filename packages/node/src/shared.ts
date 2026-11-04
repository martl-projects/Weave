import type { Json } from '@weave/core';

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
