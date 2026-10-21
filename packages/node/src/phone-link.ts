import { b64u, canonicalJson, utf8, type Json } from '@weave/core';

/*
 * The pairing link a desktop shows as a QR code (see remote.ts). Its own
 * module, with nothing from Node, so the phone app's worker can read it.
 */

/** What a pairing link carries. */
export interface PhoneLink {
  v: 1;
  /** The node's remote DHT key (hex). */
  node: string;
  secret: string;
  expires: string;
  /** Whose node it is, for the phone to show. */
  name?: string;
  /** DHT bootstrap nodes, when the node isn't on the public network (tests). */
  bootstrap?: Array<{ host: string; port: number }>;
}

const PREFIX = 'weave:phone:';

export const encodePhoneLink = (link: PhoneLink): string => PREFIX + b64u.encode(utf8(canonicalJson(link as unknown as Json)));

export function decodePhoneLink(text: string): PhoneLink {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('not a Weave pairing code');
  let link: PhoneLink;
  try {
    link = JSON.parse(new TextDecoder().decode(b64u.decode(trimmed.slice(PREFIX.length))));
  } catch {
    throw new Error('the pairing code is damaged');
  }
  if (link?.v !== 1 || !/^[0-9a-f]{64}$/.test(link.node ?? '') || typeof link.secret !== 'string') throw new Error('the pairing code is damaged or from a newer Weave');
  if (Date.parse(link.expires) < Date.now()) throw new Error('the pairing code has expired: show a new one on your computer');
  return link;
}
