import { b64u, canonicalJson, utf8, type Json } from './bytes.ts';
import { isDid, type Did } from './keys.ts';
import type { Invite } from './spaces.ts';

/*
 * A contact link is someone's Weave address, like a phone number: who they
 * are (their did:key), what they call themselves, and where their node can be
 * reached. It holds no keys, so it can go anywhere: a chat message, an email,
 * a business card. Whoever adds it connects to that person's node and reads
 * their public space; nothing private is shared until they invite you.
 *
 *   weave.contact   {did, name}   sealed to yourself: your address book
 */
export const KIND_CONTACT = 'weave.contact';

export interface Contact {
  v: 1;
  did: Did;
  name?: string;
  entry: Invite['entry'];
  /** It leads to its person's front door (their always-on node), not to their computer: theirs to give anyone. */
  door?: true;
}

const CONTACT_PREFIX = 'weave:contact:';
const CONTACT_PATTERN = /weave:contact:[A-Za-z0-9_-]+/;

export const encodeContact = (contact: Contact): string => CONTACT_PREFIX + b64u.encode(utf8(canonicalJson(contact as unknown as Json)));

/** Reads a contact link, also from inside a longer message ("Add me on Weave: weave:contact:…"). */
export function decodeContact(text: string): Contact {
  const link = CONTACT_PATTERN.exec(text)?.[0];
  if (!link) throw new Error('no Weave contact link found');
  let contact: Contact;
  try {
    contact = JSON.parse(new TextDecoder().decode(b64u.decode(link.slice(CONTACT_PREFIX.length))));
  } catch {
    throw new Error('contact link is damaged');
  }
  if (contact?.v !== 1 || !isDid(contact.did) || !Array.isArray(contact.entry?.topics) || !Array.isArray(contact.entry?.bootstrap)) throw new Error('contact link is damaged');
  return { v: 1, did: contact.did, ...(typeof contact.name === 'string' ? { name: contact.name.slice(0, 40) } : {}), entry: contact.entry, ...(contact.door === true ? { door: true as const } : {}) };
}
