import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, utf8 } from './bytes.ts';
import type { Did } from './keys.ts';

/*
 * Who a peer is on a sync connection (protocol 4, @weave/net session2.ts): it signs its role and the connection's
 * handshake hash with the key it signs events with, so the proof holds for that connection only. A holder for someone
 * (a storage node's key for an account) shows, besides, that one of the person's keys says it holds for them.
 */

/** Which end of a connection: the one that dialled, or the one that answered. */
export type SyncRole = 'initiator' | 'responder';

/** What a node signs to say who it is on one connection: its role and the connection's handshake hash. */
export const idMessage = (role: SyncRole, handshakeHash: Uint8Array): Uint8Array => new Uint8Array([...utf8(`weave/sync/id/v1/${role}`), ...handshakeHash]);

/** What a person's key signs to say a holder (a storage node's key for their account) holds their spaces for them. */
export const holdMessage = (holder: Did): Uint8Array => utf8(`weave/sync/hold/v1 ${holder}`);

/**
 * A key on a storage node's list of who gets a space from it (blind, it can't read who the members are): a hash of
 * the space's auth key and the key, so the list says nothing to whoever reads it without the space.
 */
export const deliverTag = (auth: Uint8Array, key: Did): string => b64u.encode(sha256(new Uint8Array([...utf8('weave/sync/deliver/v1'), ...auth, ...utf8(key)])));
