import { b64u, boxTo, didFromPublicKey, generateKeyPair, openBox, type Box, type Did, type Json } from '@weave/core';

/*
 * The push key (docs/web-push.md): what opens notifications in this browser and nothing else. It lives in IndexedDB,
 * outside the sealed home, so the service worker can open a push while Weave is closed and locked. Senders seal to its
 * public half (as a did:key); the storage node only passes the sealed message on.
 */

export interface PushKey {
  /** The address at the storage node that senders push to. */
  address: string;
  /** The push key, as a did:key (what senders seal to). */
  did: Did;
  secretKey: string;
  publicKey: string;
}

/** What a sender seals: the notice, in short. */
export interface PushNotice {
  title: string;
  text?: string;
  /** Where a tap leads, as the app's address after the # (#/p/…, #/inbox …). */
  open?: string;
  /** Replaces an earlier one with the same tag (several messages in one chat). */
  tag?: string;
}

const DB = 'weave-push';
const STORE = 'keys';
const ID = 'current';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const conn = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = act(conn.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    conn.close();
  }
}

export const loadPushKey = (): Promise<PushKey | undefined> => run<PushKey | undefined>('readonly', (s) => s.get(ID));
export const savePushKey = (key: PushKey): Promise<unknown> => run('readwrite', (s) => s.put(key, ID));
export const clearPushKey = (): Promise<unknown> => run('readwrite', (s) => s.delete(ID));

/** A new push key, for an address. */
export function makePushKey(address: string): PushKey {
  const { publicKey, secretKey } = generateKeyPair();
  return { address, did: didFromPublicKey(publicKey), secretKey: b64u.encode(secretKey), publicKey: b64u.encode(publicKey) };
}

export const sealNotice = (to: Did, notice: PushNotice): Box => boxTo(to, notice as unknown as Json);

export const openNotice = (key: PushKey, sealed: Box): PushNotice => openBox(b64u.decode(key.secretKey), b64u.decode(key.publicKey), sealed) as unknown as PushNotice;
