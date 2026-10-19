import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, utf8 } from './bytes.ts';

/*
 * Blobs are files (images for now) kept outside the logs. Each one is encrypted
 * with its own random key and stored under the hash of the ciphertext, so any
 * peer can hold and pass it on without being able to read it. Events refer to
 * a blob with a reference that carries the key: whoever can read the event
 * can read the blob.
 *
 * In text (Markdown, a page body) a reference is written as
 *   wblob:<hash>.<key>
 */

/** Blobs larger than this are refused, so one fits in a single wire message. */
export const MAX_BLOB = 2 * 1024 * 1024;
/** Media types a blob may have; images only for now. */
export const BLOB_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type BlobType = (typeof BLOB_TYPES)[number];

export interface BlobRef {
  /** base64url SHA-256 of the encrypted bytes: where the blob is stored and how peers ask for it. */
  hash: string;
  /** base64url 32-byte key that decrypts it. */
  key: string;
}

const CONTEXT = utf8('weave/blob/v1');
const NONCE = 24;

export const blobHash = (data: Uint8Array): string => b64u.encode(sha256(data));

/** Encrypt a file for storage. Media type travels inside, so the reference stays short. */
export function encryptBlob(bytes: Uint8Array, type: BlobType): { data: Uint8Array; ref: BlobRef } {
  if (!BLOB_TYPES.includes(type)) throw new Error(`blobs are ${BLOB_TYPES.join(', ')}`);
  const key = randomBytes(32);
  const nonce = randomBytes(NONCE);
  const plain = new Uint8Array([type.length, ...utf8(type), ...bytes]);
  const ct = xchacha20poly1305(key, nonce, CONTEXT).encrypt(plain);
  const data = new Uint8Array([...nonce, ...ct]);
  if (data.length > MAX_BLOB) throw new Error(`files are at most ${MAX_BLOB / 1024 / 1024} MB`);
  return { data, ref: { hash: blobHash(data), key: b64u.encode(key) } };
}

/** Decrypt a stored blob; throws if the key is wrong or the data was altered. */
export function decryptBlob(data: Uint8Array, key: string): { bytes: Uint8Array; type: BlobType } {
  const plain = xchacha20poly1305(b64u.decode(key), data.slice(0, NONCE), CONTEXT).decrypt(data.slice(NONCE));
  const type = new TextDecoder().decode(plain.slice(1, 1 + plain[0])) as BlobType;
  if (!BLOB_TYPES.includes(type)) throw new Error('unknown blob type');
  return { bytes: plain.slice(1 + plain[0]), type };
}

const REF = /^wblob:([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

export const formatBlobRef = (ref: BlobRef): string => `wblob:${ref.hash}.${ref.key}`;

export function parseBlobRef(text: unknown): BlobRef | undefined {
  const match = typeof text === 'string' ? REF.exec(text.trim()) : null;
  return match ? { hash: match[1], key: match[2] } : undefined;
}

/** Every blob reference in a text (Markdown or HTML), for fetching ahead of time. */
export function blobRefsIn(text: string): BlobRef[] {
  return [...text.matchAll(/wblob:([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})/g)].map((m) => ({ hash: m[1], key: m[2] }));
}
