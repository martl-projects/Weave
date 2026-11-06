import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { closeSync, openSync, readSync, renameSync, rmSync, writeSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Did } from '@weave/core';

/*
 * A backup of a person's Weave as one file (6.11.2026): everything their node holds (the events as they travel, and
 * the keys of their spaces), compressed and encrypted with a key that comes from their recovery words. The file alone
 * opens nothing: its head says whose it is and when it was made, never a key or the words. On a new computer, the
 * words and the file bring everything back, with no friend, keeper or network involved.
 *
 *   "WEAVE-BACKUP-1\n"
 *   one line of JSON: the head ({v, author, created, …}), in the clear
 *   blocks: 4 bytes length, 1 byte last (0|1), 12 bytes nonce, the sealed block (gzip of JSON lines) with its tag
 *
 * Each block is sealed with ChaCha20-Poly1305 under the backup key, bound to the head, its number and whether it is
 * the last: a file cut short, reordered or put together from two backups doesn't open.
 */

const MAGIC = 'WEAVE-BACKUP-1\n';
/** About how much text goes into one block before it's compressed and sealed. */
const BLOCK_TEXT = 4 * 1024 * 1024;
const MAX_BLOCK = 64 * 1024 * 1024;
const MAX_HEAD = 64 * 1024;

/** What a backup's head says, in the clear: whose it is and what's in it, nothing that opens it. */
export interface BackupHead {
  v: 1;
  author: Did;
  /** The person's name when it was made, for whoever finds the file. */
  name?: string;
  created: string;
  events: number;
  spaces: number;
  /** The Weave that wrote it. */
  weave?: string;
}

/** The key a backup is sealed with: from the person's self secret (their first encryption key, from their recovery words). */
export const backupKey = (selfSecret: Uint8Array): Buffer => createHash('sha256').update('weave/backup/v1').update(selfSecret).digest();

const aad = (head: string, index: number, last: boolean): Buffer => {
  const at = Buffer.alloc(5);
  at.writeUInt32BE(index, 0);
  at.writeUInt8(last ? 1 : 0, 4);
  return Buffer.concat([createHash('sha256').update(head).digest(), at]);
};

/**
 * Write a backup: the head, then the lines in sealed blocks. Written beside its place and moved there when whole, so
 * a backup that stopped halfway never replaces a good one. Returns its size.
 */
export function writeBackup(file: string, key: Uint8Array, head: BackupHead, lines: Iterable<string>): number {
  const headLine = JSON.stringify(head);
  const partial = `${file}.part`;
  const fd = openSync(partial, 'w');
  let bytes = 0;
  const out = (data: Buffer) => {
    writeSync(fd, data);
    bytes += data.length;
  };
  try {
    out(Buffer.from(MAGIC + headLine + '\n', 'utf8'));
    let index = 0;
    const block = (text: string, last: boolean) => {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
      cipher.setAAD(aad(headLine, index++, last));
      const sealed = Buffer.concat([cipher.update(gzipSync(Buffer.from(text, 'utf8'))), cipher.final(), cipher.getAuthTag()]);
      const frame = Buffer.alloc(5);
      frame.writeUInt32BE(sealed.length, 0);
      frame.writeUInt8(last ? 1 : 0, 4);
      out(Buffer.concat([frame, nonce, sealed]));
    };
    let text = '';
    for (const line of lines) {
      text += line + '\n';
      if (text.length >= BLOCK_TEXT) {
        block(text, false);
        text = '';
      }
    }
    block(text, true);
  } catch (error) {
    closeSync(fd);
    rmSync(partial, { force: true });
    throw error;
  }
  closeSync(fd);
  rmSync(file, { force: true });
  renameSync(partial, file);
  return bytes;
}

const NOT_A_BACKUP = "this file isn't a Weave backup";

/** A backup's head, without opening it: whose it is and when it was made. */
export function readBackupHead(file: string): BackupHead {
  const fd = openSync(file, 'r');
  try {
    return headOf(fd).head;
  } finally {
    closeSync(fd);
  }
}

function headOf(fd: number): { head: BackupHead; line: string; offset: number } {
  const start = Buffer.alloc(MAGIC.length + MAX_HEAD);
  const got = readSync(fd, start, 0, start.length, 0);
  const text = start.subarray(0, got);
  if (text.subarray(0, MAGIC.length).toString('utf8') !== MAGIC) throw new Error(NOT_A_BACKUP);
  const end = text.indexOf(0x0a, MAGIC.length);
  if (end < 0) throw new Error(NOT_A_BACKUP);
  const line = text.subarray(MAGIC.length, end).toString('utf8');
  let head: BackupHead;
  try {
    head = JSON.parse(line) as BackupHead;
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  if (head?.v !== 1 || typeof head.author !== 'string') throw new Error('this backup is from a newer Weave: update Weave, then restore it');
  return { head, line, offset: end + 1 };
}

/**
 * Open a backup with its key: its head and every line, block by block. A wrong key, or a file that was changed, cut
 * short or put together from pieces, throws before anything of that block is handed out.
 */
export function* readBackup(file: string, key: Uint8Array): Generator<string, BackupHead> {
  const fd = openSync(file, 'r');
  try {
    const { head, line, offset } = headOf(fd);
    let at = offset;
    let done = false;
    for (let index = 0; !done; index++) {
      const frame = Buffer.alloc(17);
      if (readSync(fd, frame, 0, 17, at) !== 17) throw new Error('this backup is cut short: it ends before its last block');
      const length = frame.readUInt32BE(0);
      const last = frame.readUInt8(4) === 1;
      if (length < 16 || length > MAX_BLOCK) throw new Error(NOT_A_BACKUP);
      const sealed = Buffer.alloc(length);
      if (readSync(fd, sealed, 0, length, at + 17) !== length) throw new Error('this backup is cut short: it ends before its last block');
      at += 17 + length;
      const decipher = createDecipheriv('chacha20-poly1305', key, frame.subarray(5, 17), { authTagLength: 16 });
      decipher.setAAD(aad(line, index, last));
      decipher.setAuthTag(sealed.subarray(length - 16));
      let plain: Buffer;
      try {
        plain = Buffer.concat([decipher.update(sealed.subarray(0, length - 16)), decipher.final()]);
      } catch {
        throw new Error(index === 0 ? "these recovery words don't open this backup (it was made by another identity, or the file was changed)" : 'this backup was changed or damaged: a block of it does not open');
      }
      for (const text of gunzipSync(plain).toString('utf8').split('\n')) if (text) yield text;
      done = last;
    }
    return head;
  } finally {
    closeSync(fd);
  }
}
