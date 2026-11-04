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
