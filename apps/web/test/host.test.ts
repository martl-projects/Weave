import { createHash, createHmac, hkdfSync as nodeHkdf } from 'node:crypto';
import { posix } from 'node:path';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import * as crypto from '../src/host/crypto.ts';
import * as fs from '../src/host/fs.ts';
import * as path from '../src/host/path.ts';
import { wasmDatabase } from '../src/wasmdb.ts';

/** What the node asks of its host, answered in a browser: each as Node answers it, or as the node relies on. */

describe('node:path in a browser', () => {
  const paths = ['/weave/groups/a.json', '/weave/', '/', 'a/b', '../a', '/a/../b', '/a/./b//c', 'file.tar.gz', '.hidden', '/a/b/'];

  it('says what Node says', () => {
    for (const p of paths) {
      expect(path.normalize(p), p).toBe(posix.normalize(p).replace(/(.)\/$/, '$1'));
      expect(path.dirname(p), p).toBe(posix.dirname(p));
      expect(path.basename(p), p).toBe(posix.basename(p));
      expect(path.extname(p), p).toBe(posix.extname(p));
      expect(path.isAbsolute(p), p).toBe(posix.isAbsolute(p));
    }
    expect(path.join('/weave', 'groups', 'a.json')).toBe(posix.join('/weave', 'groups', 'a.json'));
    expect(path.join('/weave', '..', 'x')).toBe('/x');
    expect(path.resolve('/a', 'b', '../c')).toBe(posix.resolve('/a', 'b', '../c'));
    expect(path.resolve('/a', '/b', 'c')).toBe(posix.resolve('/a', '/b', 'c'));
    expect(path.relative('/a/b/c', '/a/d')).toBe(posix.relative('/a/b/c', '/a/d'));
    expect(path.basename('/a/b.json', '.json')).toBe('b');
  });
});

describe('node:crypto in a browser', () => {
  it('hashes as Node does', () => {
    expect(crypto.createHash('sha256').update('weave').update(new Uint8Array([1, 2])).digest('hex')).toBe(createHash('sha256').update('weave').update(new Uint8Array([1, 2])).digest('hex'));
    expect(crypto.createHash('sha1').update('a').digest('base64')).toBe(createHash('sha1').update('a').digest('base64'));
    expect(new Uint8Array(crypto.createHash('sha256').update('a').digest() as Uint8Array)).toEqual(new Uint8Array(createHash('sha256').update('a').digest()));
    expect(crypto.createHmac('sha256', 'key').update('a').digest('hex')).toBe(createHmac('sha256', 'key').update('a').digest('hex'));
  });

  it('derives keys as Node does', () => {
    const key = new Uint8Array(32).fill(7);
    expect(new Uint8Array(crypto.hkdfSync('sha256', key, 'salt', 'info', 32))).toEqual(new Uint8Array(nodeHkdf('sha256', key, 'salt', 'info', 32)));
  });

  it('compares, and tells different lengths apart as Node does', () => {
    expect(crypto.timingSafeEqual(new Uint8Array([1]), new Uint8Array([1]))).toBe(true);
    expect(crypto.timingSafeEqual(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
    expect(() => crypto.timingSafeEqual(new Uint8Array(1), new Uint8Array(2))).toThrow();
  });

  it('says what it does not have', () => {
    expect(() => crypto.createVerify()).toThrow("isn't there in a browser");
  });
});

describe('node:fs in a browser', () => {
  beforeAll(async () => fs.useFiles(wasmDatabase(new (await sqlite3InitModule()).oo1.DB(':memory:'))));

  it('keeps text and bytes, and says ENOENT for what is not there, which the node reads as "not yet"', () => {
    fs.writeFileSync('/h/a/text.json', '{"ä":1}');
    expect(fs.readFileSync('/h/a/text.json', 'utf8')).toBe('{"ä":1}');
    const bytes = new Uint8Array([0, 255, 1]);
    fs.writeFileSync('/h/a/blob', bytes);
    expect(new Uint8Array(fs.readFileSync('/h/a/blob') as Uint8Array)).toEqual(bytes);
    expect(() => fs.readFileSync('/h/none')).toThrow(expect.objectContaining({ code: 'ENOENT' }));
    expect(fs.existsSync('/h/none')).toBe(false);
    expect(fs.existsSync('/h/a')).toBe(true);
    expect(fs.statSync('/h/a')?.isDirectory()).toBe(true);
    expect(fs.statSync('/h/a/blob')?.size).toBe(3);
    expect(fs.statSync('/h/none', { throwIfNoEntry: false })).toBeUndefined();
  });

  it('lists a directory, not what is below it', () => {
    fs.mkdirSync('/l/deep/er');
    fs.writeFileSync('/l/one', 'x');
    fs.writeFileSync('/l/deep/two', 'x');
    expect((fs.readdirSync('/l') as string[]).sort()).toEqual(['deep', 'one']);
    const kinds = fs.readdirSync('/l', { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean }>;
    expect(kinds.find((k) => k.name === 'deep')?.isDirectory()).toBe(true);
    expect(() => fs.readdirSync('/none')).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });

  it('renames over what was there, as writeJson does, and takes a directory along', () => {
    fs.writeFileSync('/r/config.json', 'old');
    fs.writeFileSync('/r/config.json.tmp', 'new');
    fs.renameSync('/r/config.json.tmp', '/r/config.json');
    expect(fs.readFileSync('/r/config.json', 'utf8')).toBe('new');
    expect(fs.existsSync('/r/config.json.tmp')).toBe(false);
    fs.writeFileSync('/r/d/in', 'x');
    fs.renameSync('/r/d', '/r/e');
    expect(fs.readFileSync('/r/e/in', 'utf8')).toBe('x');
    expect(fs.existsSync('/r/d/in')).toBe(false);
  });

  it('removes what it is told to and nothing that only starts the same', () => {
    fs.writeFileSync('/m/keys/a', 'x');
    fs.writeFileSync('/m/keys-old', 'x');
    fs.rmSync('/m/keys', { recursive: true, force: true });
    expect(fs.existsSync('/m/keys/a')).toBe(false);
    expect(fs.existsSync('/m/keys-old')).toBe(true);
    expect(() => fs.rmSync('/m/none')).toThrow(expect.objectContaining({ code: 'ENOENT' }));
    fs.rmSync('/m/none', { force: true });
  });

  it('appends', () => {
    fs.appendFileSync('/p/log', 'a');
    fs.appendFileSync('/p/log', 'b');
    expect(fs.readFileSync('/p/log', 'utf8')).toBe('ab');
  });
});
