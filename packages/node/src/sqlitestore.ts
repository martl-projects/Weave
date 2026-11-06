import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { MemoryStore, type Did, type WeaveEvent } from '@weave/core';
import { SqlStore, type SqlDatabase } from './sqlstore.ts';

/*
 * The event store in a file (node:sqlite, built into Node 24 and Electron's Node; no native module). WAL mode makes an
 * append one INSERT that survives a crash. The store itself is sqlstore.ts. See docs/v2-stage0.md.
 *
 * Homes from before kept one JSON-lines file per signer in logs/. The first
 * open imports them in one transaction, checks the counts, and renames logs/ to
 * logs.v1-imported/; on any doubt it leaves them as they are and says so.
 */

/** node:sqlite, without the "experimental" warning Node 24 prints for it (and only that one). */
function sqlite(): typeof import('node:sqlite') {
  const emit = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (/SQLite/i.test(typeof warning === 'string' ? warning : warning.message)) return;
    return (emit as (...a: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  } finally {
    process.emitWarning = emit;
  }
}

function database(path: string, readOnly: boolean): SqlDatabase {
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const { DatabaseSync } = sqlite();
  const db = new DatabaseSync(path, { readOnly });
  if (!readOnly) db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  return db as unknown as SqlDatabase;
}

/** Stores not closed yet, so tests can let go of their files before deleting temp homes (Windows won't delete open files). */
const open = new Set<SqliteStore>();

/** Close every store still open in this process. For tests; a node closes its own store when it closes. */
export function closeOpenStores(): void {
  for (const store of [...open]) store.close();
}

export class SqliteStore extends SqlStore {
  /** A consistent copy of the whole database at `path`, while it stays in use (backups, stage 14). */
  snapshot(path: string): void {
    this.db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  }

  readonly path: string;

  constructor(path: string, options: { readOnly?: boolean } = {}) {
    super(database(path, !!options.readOnly), options);
    this.path = path;
    open.add(this);
  }

  /** A consistent copy of the database, while it's open. */
  backupTo(path: string): void {
    this.db.prepare('VACUUM INTO ?').run(path);
  }

  /** Write every log out as JSON lines, one file per signer, like homes before SQLite kept them. */
  exportJsonl(dir: string): { files: number; events: number } {
    mkdirSync(dir, { recursive: true });
    let events = 0;
    for (const signer of this.signers()) {
      const log = this.range(signer, 1);
      writeFileSync(join(dir, jsonlName(signer)), log.map((e) => JSON.stringify(e)).join('\n') + '\n');
      events += log.length;
    }
    return { files: this.signers().length, events };
  }

  close(): void {
    open.delete(this);
    super.close();
  }
}

/** `did:key:z6Mk…` → `z6Mk….jsonl` (colons are not allowed in Windows file names). */
export const jsonlName = (signer: Did): string => `${signer.slice('did:key:'.length)}.jsonl`;

/** JSON-lines logs as homes before SQLite wrote them: per file, events up to the first torn or out-of-order line. */
export function readJsonlLogs(dir: string): WeaveEvent[] {
  if (!existsSync(dir)) return [];
  const memory = new MemoryStore();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        memory.append(JSON.parse(line) as WeaveEvent);
      } catch {
        break; // a torn last line after a crash: keep what came before it
      }
    }
  }
  return memory.signers().flatMap((s) => memory.range(s, 1));
}

export interface OpenedStore {
  store: SqliteStore;
  /** Events taken over from logs/ on this open, if any. */
  imported?: number;
  /** Something the person should know (logs/ left alone, and why). */
  warning?: string;
}

/**
 * The store of a home: weave.db, after taking over the JSON-lines logs of an
 * older home once. Throws when an import fails; the logs are then untouched.
 */
export function openStore(home: { dir: string; logs: string }): OpenedStore {
  const store = new SqliteStore(join(home.dir, 'weave.db'));
  if (!existsSync(home.logs)) return { store };
  // Imported before, but stopped before the rename: finish it.
  if (store.meta('imported')) {
    renameSync(home.logs, nextFree(`${home.logs}.v1-imported`));
    return { store };
  }
  const events = readJsonlLogs(home.logs);
  // Both, never imported (someone copied files in by hand): keep the database, touch nothing, say so.
  if (store.signers().length && events.length) return { store, warning: `${home.dir} has weave.db and also logs/ that were never imported; using weave.db and leaving logs/ as it is` };
  try {
    store.importEvents(events);
  } catch (error) {
    store.close();
    throw error;
  }
  renameSync(home.logs, nextFree(`${home.logs}.v1-imported`));
  return { store, imported: events.length };
}

const nextFree = (path: string): string => {
  if (!existsSync(path)) return path;
  for (let i = 2; ; i++) if (!existsSync(`${path}-${i}`)) return `${path}-${i}`;
};
