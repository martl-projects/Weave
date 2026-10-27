import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/*
 * Reading a container image's layer (a tar archive) without Docker or a tar program: what a WebAssembly service's
 * image holds (its component, its website's files). Strict on purpose: regular files and folders only (links and
 * devices are left out), every path inside the folder it's unpacked into, and no more than `limit` bytes in all.
 */

const BLOCK = 512;

/** The archive's files, written under `into`: how many bytes they came to. */
export function untar(archive: Uint8Array, into: string, limit = 200 * 1024 * 1024, written = 0): number {
  let at = 0;
  let longName: string | undefined;
  let paxPath: string | undefined;
  while (at + BLOCK <= archive.length) {
    const header = archive.subarray(at, at + BLOCK);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, length: number) => new TextDecoder().decode(header.subarray(start, start + length)).replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error('a layer of the image is not a tar archive');
    const type = String.fromCharCode(header[156] || 48);
    const ustar = field(257, 6).startsWith('ustar');
    const name = longName ?? paxPath ?? (ustar && field(345, 155) ? `${field(345, 155)}/${field(0, 100)}` : field(0, 100));
    const body = archive.subarray(at + BLOCK, at + BLOCK + size);
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    // A long name (GNU) or extended header (pax) names the entry that follows.
    if (type === 'L') {
      longName = new TextDecoder().decode(body).replace(/\0.*$/s, '');
      continue;
    }
    if (type === 'x') {
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(body))?.[1];
      continue;
    }
    longName = undefined;
    paxPath = undefined;
    if (type === 'g') continue;
    const path = safePath(name);
    // Only files and folders, inside: whiteouts (.wh.) and anything else are left out.
    if (!path || path.split('/').some((part) => part.startsWith('.wh.'))) continue;
    if (type === '5') {
      mkdirSync(join(into, path), { recursive: true });
      continue;
    }
    if (type !== '0' && type !== '7') continue;
    written += size;
    if (written > limit) throw new Error(`the image holds more than ${Math.round(limit / 1024 / 1024)} MB`);
    mkdirSync(dirname(join(into, path)), { recursive: true });
    writeFileSync(join(into, path), body);
  }
  return written;
}

/** A path from an archive, made relative and kept inside (undefined when it would leave). */
export function safePath(name: string): string | undefined {
  const parts = name.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  return parts.length && !parts.includes('..') ? parts.join('/') : undefined;
}
