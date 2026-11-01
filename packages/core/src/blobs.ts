import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, utf8 } from './bytes.ts';

/*
 * Blobs are files kept outside the logs: images in posts and pages, and the
 * files and images attached to chat messages. Each one is encrypted with its
 * own random key and stored under the hash of the ciphertext, so any peer can
 * hold and pass it on without being able to read it. Events refer to a blob
 * with a reference that carries the key: whoever can read the event can read
 * the blob.
 *
 * In text (Markdown, a page body) a reference is written as
 *   wblob:<hash>.<key>
 */

/** Blobs larger than this are refused, so one fits in a single wire message. */
export const MAX_BLOB = 2 * 1024 * 1024;
/** Media types an image blob may have: what posts, pages, icons and banners show. */
export const BLOB_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type BlobType = (typeof BLOB_TYPES)[number];

/** A media type as it travels inside a blob (one length byte, so at most 255 characters). */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;
export const isMediaType = (type: unknown): type is string => typeof type === 'string' && MEDIA_TYPE.test(type);
/** Blobs of these types show as pictures (inline, in a lightbox); any other type is a file to save. */
export const isImageType = (type: string): type is BlobType => BLOB_TYPES.includes(type as BlobType);

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
export function encryptBlob(bytes: Uint8Array, type: string): { data: Uint8Array; ref: BlobRef } {
  if (!isMediaType(type)) throw new Error('a file needs a media type, like image/png or application/pdf');
  const key = randomBytes(32);
  const nonce = randomBytes(NONCE);
  const plain = new Uint8Array([type.length, ...utf8(type), ...bytes]);
  const ct = xchacha20poly1305(key, nonce, CONTEXT).encrypt(plain);
  const data = new Uint8Array([...nonce, ...ct]);
  if (data.length > MAX_BLOB) throw new Error(`files are at most ${MAX_BLOB / 1024 / 1024} MB`);
  return { data, ref: { hash: blobHash(data), key: b64u.encode(key) } };
}

/** Decrypt a stored blob; throws if the key is wrong or the data was altered. */
export function decryptBlob(data: Uint8Array, key: string): { bytes: Uint8Array; type: string } {
  const plain = xchacha20poly1305(b64u.decode(key), data.slice(0, NONCE), CONTEXT).decrypt(data.slice(NONCE));
  const type = new TextDecoder().decode(plain.slice(1, 1 + plain[0]));
  if (!isMediaType(type)) throw new Error('unknown blob type');
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

// ---------------------------------------------------------------- files attached to messages

/** How long a file's name may be. */
export const FILE_NAME_LIMIT = 200;

/**
 * A file attached to a chat message: its blob, and what the message says about
 * it, so the card shows before the bytes arrive. The name and type are inside
 * the sealed message, read by the chat's audience only; the blob checks itself
 * (its hash on the wire, its key when opened).
 */
export interface Attachment {
  /** Its blob, wblob:<hash>.<key>. */
  ref: string;
  /** The file's name, as shown and as saved: no path in it. */
  name: string;
  /** Its size in bytes, before encryption. */
  size: number;
  /** Its media type, like image/webp or application/pdf. */
  type: string;
}

/** A file name as it may stand in a message: no path, no control characters, not empty, not too long. */
export function fileName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()!.trim();
  return name && name !== '.' && name !== '..' && name.length <= FILE_NAME_LIMIT ? name : undefined;
}

/** The attachment a message body carries, if it is well formed; else nothing (the message stands without it). */
export function attachmentOf(body: unknown): Attachment | undefined {
  const file = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).file : undefined;
  if (!file || typeof file !== 'object' || Array.isArray(file)) return undefined;
  const { ref, name, size, type } = file as Record<string, unknown>;
  const cleanName = fileName(name);
  if (!parseBlobRef(ref) || !cleanName || !isMediaType(type)) return undefined;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || size > MAX_BLOB) return undefined;
  return { ref: (ref as string).trim(), name: cleanName, size, type };
}
