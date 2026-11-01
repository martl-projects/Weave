import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { boxTo, openBox, type Box } from './crypto.ts';
import type { EventFields } from './events.ts';
import type { EventView } from './records.ts';
import { isDid, type Did } from './keys.ts';
import type { Recipient, SpaceKind } from './spaces.ts';

/*
 * Invite links that need the inviter's OK. Unlike an ordinary invite link,
 * a knock link carries no keys: whoever has it can only ask to be let in.
 *
 *   weave.knock          {box}              the newcomer; the box, to the inviter's encryption key,
 *                                           names the space, the link and a note (nobody else learns whom it is for)
 *   weave.knock.pending  {space, inviter}   sealed to the newcomer: they asked (accept the keys)
 *   weave.knock.handled  {knock}            sealed to the inviter: answered
 *
 * The inviter lets someone in with weave.project.admit {member, invite} inside
 * the space and a gift of its keys (see spaces.ts).
 */
export const KIND_KNOCK = 'weave.knock';
export const KIND_KNOCK_PENDING = 'weave.knock.pending';
export const KIND_KNOCK_HANDLED = 'weave.knock.handled';

export interface KnockLink {
  v: 1;
  space: { kind: SpaceKind; id: string; name: string; founder: Did };
  invite: string;
  inviter: Did;
  /** The inviter's encryption key, so the knock can be boxed before their identity has synced. */
  enc: Did;
  expires: string;
  entry: { topics: string[]; bootstrap: Array<{ host: string; port: number }> };
}

const PREFIX = 'weave:knock:';

export const isKnockLink = (text: string): boolean => text.trim().startsWith(PREFIX);

export const encodeKnock = (link: KnockLink): string => PREFIX + b64u.encode(utf8(canonicalJson(link as unknown as Json)));

/** A knock link's contents, expired or not (decodeKnock checks that too). */
export function peekKnock(text: string): KnockLink {
  let link: KnockLink;
  try {
    link = JSON.parse(new TextDecoder().decode(b64u.decode(text.trim().slice(PREFIX.length))));
  } catch {
    throw new Error('invite is damaged');
  }
  const s = link?.space;
  if (link?.v !== 1 || !s || typeof s.id !== 'string' || typeof s.name !== 'string' || !isDid(s.founder) || !isDid(link.inviter) || !isDid(link.enc) || typeof link.invite !== 'string' || typeof link.expires !== 'string') {
    throw new Error('invite is damaged or from a newer Weave version');
  }
  return link;
}

export function decodeKnock(text: string): KnockLink {
  const link = peekKnock(text);
  if (Date.parse(link.expires) < Date.now()) throw new Error('invite has expired');
  return link;
}

/** The knock a newcomer publishes. */
export function knockFor(link: KnockLink, note: string, entry: KnockLink['entry']): EventFields {
  const box = boxTo(link.enc, { space: link.space.id, invite: link.invite, note: note.slice(0, 500), entry: entry as unknown as Json });
  return { kind: KIND_KNOCK, body: { box: box as unknown as Json } };
}

/** A knock addressed to `me`, opened. */
export function openKnock(event: EventView, me: Recipient): { space: string; invite: string; note: string; entry: KnockLink['entry'] } | undefined {
  const body = event.body as { box?: Box } | null;
  if (event.kind !== KIND_KNOCK || !body?.box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, body.box) as { space?: unknown; invite?: unknown; note?: unknown; entry?: KnockLink['entry'] };
    if (typeof opened.space !== 'string' || typeof opened.invite !== 'string') return undefined;
    return { space: opened.space, invite: opened.invite, note: typeof opened.note === 'string' ? opened.note : '', entry: opened.entry ?? { topics: [], bootstrap: [] } };
  } catch {
    return undefined;
  }
}
