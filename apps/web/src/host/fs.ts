import { Buffer } from 'buffer';
import type { SqlDatabase, SqlStatement } from '@weave/node/web';

/*
 * node:fs for a browser: a home's files as rows in the node's own database, because OPFS's files are slow to open and the
 * node reads and writes small files synchronously. A directory is a row without data. Sealed files stay sealed: this
 * knows bytes, and a home's vault does the sealing as on a computer.
 */

const SCHEMA = 'CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, data BLOB, time INTEGER NOT NULL)';

let statements: Record<'get' | 'put' | 'drop' | 'dropUnder' | 'under', SqlStatement> | undefined;

/** Keep files in this database from now on. */
export function useFiles(db: SqlDatabase): void {
  db.exec(SCHEMA);
  statements = {
    get: db.prepare('SELECT data, time FROM files WHERE path = ?'),
    put: db.prepare('INSERT OR REPLACE INTO files (path, data, time) VALUES (?, ?, ?)'),
    drop: db.prepare('DELETE FROM files WHERE path = ?'),
    dropUnder: db.prepare('DELETE FROM files WHERE substr(path, 1, length(?1)) = ?1'),
    under: db.prepare('SELECT path, data FROM files WHERE substr(path, 1, length(?1)) = ?1'),
  };
}

interface Row {
  data: Uint8Array | null;
  time: number;
}

const files = () => {
  if (!statements) throw new Error('no files yet: useFiles comes first');
  return statements;
};

/** Windows never gets here, but a home's paths may end in a slash. */
const clean = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, '') : path);
const row = (path: string) => files().get.get(clean(path)) as Row | undefined;

function missing(path: string, call: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, ${call} '${path}'`), { code: 'ENOENT', path });
}

const encoded = (data: Uint8Array, options?: string | { encoding?: string }): Buffer | string => {
  const encoding = typeof options === 'string' ? options : options?.encoding;
  const buffer = Buffer.from(data);
  return encoding ? buffer.toString(encoding as BufferEncoding) : buffer;
};

const toBytes = (data: string | Uint8Array): Uint8Array => (typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
const parentsOf = (path: string): string[] => clean(path).split('/').slice(1, -1).map((_, i, parts) => `/${parts.slice(0, i + 1).join('/')}`);

export const existsSync = (path: string): boolean => clean(path) === '/' || !!row(path);

export function mkdirSync(path: string): void {
  const now = Date.now();
  for (const dir of [...parentsOf(path), clean(path)]) if (dir !== '/' && !row(dir)) files().put.run(dir, null, now);
}

export function writeFileSync(path: string, data: string | Uint8Array): void {
  for (const dir of parentsOf(path)) if (!row(dir)) mkdirSync(dir);
  files().put.run(clean(path), new Uint8Array(toBytes(data)), Date.now());
}

export function appendFileSync(path: string, data: string | Uint8Array): void {
  const before = row(path)?.data ?? new Uint8Array();
  writeFileSync(path, new Uint8Array([...before, ...toBytes(data)]));
}

export function readFileSync(path: string, options?: string | { encoding?: string }): Buffer | string {
  const found = row(path);
  if (!found) throw missing(path, 'open');
  if (!found.data) throw Object.assign(new Error(`EISDIR: illegal operation on a directory, read '${path}'`), { code: 'EISDIR', path });
  return encoded(found.data, options);
}

export function readdirSync(path: string, options?: { withFileTypes?: boolean }): Array<string | { name: string; isDirectory(): boolean; isFile(): boolean }> {
  if (!existsSync(path)) throw missing(path, 'scandir');
  const prefix = clean(path) === '/' ? '/' : `${clean(path)}/`;
  const rows = files().under.all(prefix) as Array<{ path: string; data: Uint8Array | null }>;
  const direct = rows.filter((r) => !r.path.slice(prefix.length).includes('/'));
  return direct.map((r) => {
    const name = r.path.slice(prefix.length);
    return options?.withFileTypes ? { name, isDirectory: () => r.data === null, isFile: () => r.data !== null } : name;
  });
}

export function statSync(path: string, options?: { throwIfNoEntry?: boolean }) {
  const found = row(path);
  if (!found) {
    if (options?.throwIfNoEntry === false) return undefined;
    throw missing(path, 'stat');
  }
  return { size: found.data?.length ?? 0, mtimeMs: found.time, mtime: new Date(found.time), isDirectory: () => found.data === null, isFile: () => found.data !== null };
}

export function rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void {
  if (!row(path) && !options?.force) throw missing(path, 'rm');
  files().drop.run(clean(path));
  if (options?.recursive) files().dropUnder.run(`${clean(path)}/`);
}

export const unlinkSync = (path: string): void => rmSync(path);

export function renameSync(from: string, to: string): void {
  const found = row(from);
  if (!found) throw missing(from, 'rename');
  files().put.run(clean(to), found.data, Date.now());
  files().drop.run(clean(from));
  const prefix = `${clean(from)}/`;
  for (const item of files().under.all(prefix) as Array<{ path: string; data: Uint8Array | null }>) files().put.run(`${clean(to)}/${item.path.slice(prefix.length)}`, item.data, Date.now());
  files().dropUnder.run(prefix);
}

export function copyFileSync(from: string, to: string): void {
  writeFileSync(to, readFileSync(from) as Buffer);
}

const nothere = (what: string) => (): never => {
  throw new Error(`${what} isn't there in a browser`);
};
export const cpSync = nothere('cpSync');
export const openSync = nothere('openSync');
export const closeSync = nothere('closeSync');
export const writeSync = nothere('writeSync');
export const readSync = nothere('readSync');
export const fsyncSync = nothere('fsyncSync');
export const createReadStream = nothere('createReadStream');
export const createWriteStream = nothere('createWriteStream');
export const watch = nothere('watch');
export const chmodSync = (): void => {};
export const utimesSync = (): void => {};

export const promises = {};
export default { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, statSync, rmSync, unlinkSync, renameSync, copyFileSync, promises };
