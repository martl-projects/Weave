import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { eventId, eventIdV2, MemoryStore, type ControlEventV2, type Did, type EventV2, type Json, type LogStore, type StoredV2, type WeaveEvent } from '@weave/core';

/*
 * The event store on SQLite (node:sqlite, built into Node 24 and Electron's
 * Node; no native module). One table of signed events, indexed by id, signer
 * and seq, space and time, so nothing has to be held in memory as a whole: only
 * each signer's latest event is. WAL mode makes an append one INSERT that
 * survives a crash. See docs/v2-stage0.md.
 *
 * Homes from before kept one JSON-lines file per signer in logs/. The first
 * open imports them in one transaction, checks the counts, and renames logs/ to
 * logs.v1-imported/; on any doubt it leaves them as they are and says so.
 */

const SCHEMA_VERSION = '2';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id     TEXT PRIMARY KEY,
  signer TEXT NOT NULL,
  seq    INTEGER NOT NULL,
  author TEXT NOT NULL,
  time   TEXT NOT NULL,
  kind   TEXT NOT NULL,
  scope  TEXT NOT NULL,
  v      INTEGER NOT NULL,
  json   TEXT NOT NULL,
  UNIQUE (signer, seq)
);
CREATE INDEX IF NOT EXISTS events_scope ON events (scope, time);
CREATE INDEX IF NOT EXISTS events_time ON events (time, signer, seq);
CREATE INDEX IF NOT EXISTS events_kind ON events (kind);
CREATE TABLE IF NOT EXISTS events2 (
  id     TEXT PRIMARY KEY,
  v2id   TEXT UNIQUE NOT NULL,
  class  TEXT NOT NULL,
  author TEXT NOT NULL,
  signer TEXT NOT NULL,
  space  TEXT NOT NULL,
  n      INTEGER NOT NULL,
  seq    INTEGER,
  time   TEXT NOT NULL,
  kind   TEXT NOT NULL,
  body   TEXT,
  json   TEXT NOT NULL,
  UNIQUE (signer, n)
);
CREATE INDEX IF NOT EXISTS events2_space ON events2 (space, time);
CREATE UNIQUE INDEX IF NOT EXISTS events2_chain ON events2 (signer, space, seq) WHERE seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS events2_cs ON events2 (signer, space, json_extract(json, '$.cs')) WHERE class = 'content';
CREATE TABLE IF NOT EXISTS bodies (hash TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS forgotten (hash TEXT PRIMARY KEY, time TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS keep (stream TEXT NOT NULL, tag TEXT NOT NULL, data TEXT NOT NULL, time TEXT NOT NULL, PRIMARY KEY (stream, tag));
`;

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

/** Stores not closed yet, so tests can let go of their files before deleting temp homes (Windows won't delete open files). */
const open = new Set<SqliteStore>();

/** Close every store still open in this process. For tests; a node closes its own store when it closes. */
export function closeOpenStores(): void {
  for (const store of [...open]) store.close();
}

export class SqliteStore implements LogStore {
  /** A consistent copy of the whole database at `path`, while it stays in use (backups, stage 14). */
  snapshot(path: string): void {
    this.#db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  }

  readonly path: string;
  readonly #db: DatabaseSync;
  readonly #heads = new Map<Did, WeaveEvent>();
  readonly #get: StatementSync;
  readonly #range: StatementSync;
  readonly #insert: StatementSync;
  readonly #v2: Record<'insert' | 'byId' | 'byNumber' | 'chainAt' | 'contentAt' | 'all' | 'bySigner' | 'inSpace' | 'body' | 'putBody' | 'drop' | 'forget' | 'forgotten' | 'keepPut' | 'keepTags' | 'keepItems' | 'keepBytes' | 'keepAll', StatementSync>;
  /** Each key's highest v2 n, and its latest control event per space. */
  readonly #numbers = new Map<Did, number>();
  readonly #chainHeads = new Map<string, ControlEventV2>();
  /** Each key's highest content number (cs) per space. */
  readonly #contentCounts = new Map<string, number>();

  constructor(path: string, options: { readOnly?: boolean } = {}) {
    this.path = path;
    if (!options.readOnly) mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = sqlite();
    this.#db = new DatabaseSync(path, { readOnly: !!options.readOnly });
    if (!options.readOnly) {
      this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
      this.#db.exec(SCHEMA);
      this.#db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema', SCHEMA_VERSION);
    }
    this.#get = this.#db.prepare('SELECT json FROM events WHERE signer = ? AND seq = ?');
    this.#range = this.#db.prepare('SELECT json FROM events WHERE signer = ? AND seq BETWEEN ? AND ? ORDER BY seq');
    this.#insert = this.#db.prepare('INSERT INTO events (id, signer, seq, author, time, kind, scope, v, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const heads = this.#db.prepare('SELECT e.json FROM events e JOIN (SELECT signer, MAX(seq) AS seq FROM events GROUP BY signer) h ON e.signer = h.signer AND e.seq = h.seq').all() as Array<{ json: string }>;
    for (const row of heads) {
      const event = JSON.parse(row.json) as WeaveEvent;
      this.#heads.set(event.signer, event);
    }
    this.#v2 = {
      insert: this.#db.prepare('INSERT INTO events2 (id, v2id, class, author, signer, space, n, seq, time, kind, body, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      byId: this.#db.prepare('SELECT id, json FROM events2 WHERE id = ?'),
      byNumber: this.#db.prepare('SELECT id, json FROM events2 WHERE signer = ? AND n = ?'),
      chainAt: this.#db.prepare('SELECT json FROM events2 WHERE signer = ? AND space = ? AND seq = ?'),
      contentAt: this.#db.prepare("SELECT id, json FROM events2 WHERE signer = ? AND space = ? AND class = 'content' AND json_extract(json, '$.cs') = ?"),
      all: this.#db.prepare('SELECT e.id, e.json, b.json AS body FROM events2 e LEFT JOIN bodies b ON b.hash = e.body'),
      bySigner: this.#db.prepare('SELECT id, json FROM events2 WHERE signer = ? ORDER BY n'),
      inSpace: this.#db.prepare('SELECT id, json FROM events2 WHERE space = ? AND time >= ? AND time < ? ORDER BY time'),
      body: this.#db.prepare('SELECT json FROM bodies WHERE hash = ?'),
      putBody: this.#db.prepare('INSERT OR IGNORE INTO bodies (hash, json) SELECT ?1, ?2 WHERE NOT EXISTS (SELECT 1 FROM forgotten WHERE hash = ?1)'),
      drop: this.#db.prepare('DELETE FROM bodies WHERE hash = ?'),
      forget: this.#db.prepare('INSERT OR IGNORE INTO forgotten (hash, time) VALUES (?, ?)'),
      forgotten: this.#db.prepare('SELECT 1 AS yes FROM forgotten WHERE hash = ?'),
      keepPut: this.#db.prepare('INSERT OR REPLACE INTO keep (stream, tag, data, time) VALUES (?, ?, ?, ?)'),
      keepTags: this.#db.prepare('SELECT tag FROM keep WHERE stream = ?'),
      keepItems: this.#db.prepare('SELECT tag, data FROM keep WHERE stream = ?'),
      keepBytes: this.#db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM keep WHERE stream = ?'),
      keepAll: this.#db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM keep'),
    };
    for (const row of this.#db.prepare('SELECT signer, MAX(n) AS n FROM events2 GROUP BY signer').all() as Array<{ signer: Did; n: number }>) this.#numbers.set(row.signer, row.n);
    const chainHeads = this.#db.prepare('SELECT e.json FROM events2 e JOIN (SELECT signer, space, MAX(seq) AS seq FROM events2 WHERE seq IS NOT NULL GROUP BY signer, space) h ON e.signer = h.signer AND e.space = h.space AND e.seq = h.seq').all() as Array<{ json: string }>;
    for (const row of chainHeads) {
      const event = JSON.parse(row.json) as ControlEventV2;
      this.#chainHeads.set(`${event.signer} ${event.space}`, event);
    }
    const counts = this.#db.prepare("SELECT signer, space, MAX(json_extract(json, '$.cs')) AS cs FROM events2 WHERE class = 'content' GROUP BY signer, space").all() as Array<{ signer: Did; space: string; cs: number | null }>;
    for (const row of counts) if (row.cs) this.#contentCounts.set(`${row.signer} ${row.space}`, row.cs);
    open.add(this);
  }

  head(signer: Did): WeaveEvent | undefined {
    return this.#heads.get(signer);
  }

  get(signer: Did, seq: number): WeaveEvent | undefined {
    const row = this.#get.get(signer, seq) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as WeaveEvent) : undefined;
  }

  range(signer: Did, from: number, to?: number): WeaveEvent[] {
    const last = to ?? this.#heads.get(signer)?.seq ?? 0;
    if (last < from) return [];
    return (this.#range.all(signer, Math.max(1, from), last) as Array<{ json: string }>).map((row) => JSON.parse(row.json) as WeaveEvent);
  }

  append(event: WeaveEvent): void {
    const head = this.#heads.get(event.signer)?.seq ?? 0;
    if (event.seq !== head + 1) throw new Error(`out-of-order append: seq ${event.seq} after ${head}`);
    this.#insert.run(eventId(event), event.signer, event.seq, event.author, event.time, event.kind, event.scope, event.v, JSON.stringify(event));
    this.#heads.set(event.signer, event);
  }

  signers(): Did[] {
    return [...this.#heads.keys()];
  }

  add2({ id, event }: StoredV2): void {
    const chainKey = `${event.signer} ${event.space}`;
    const chainHead = this.#chainHeads.get(chainKey)?.seq ?? 0;
    if (event.class === 'control' && event.seq !== chainHead + 1) throw new Error(`out-of-order control event: seq ${event.seq} after ${chainHead}`);
    const seq = event.class === 'control' ? event.seq : null;
    this.#v2.insert.run(id, eventIdV2(event), event.class, event.author, event.signer, event.space, event.n, seq, event.time, event.kind, event.class === 'content' ? event.body : null, JSON.stringify(event));
    this.#numbers.set(event.signer, Math.max(this.#numbers.get(event.signer) ?? 0, event.n));
    if (event.class === 'control') this.#chainHeads.set(chainKey, event);
    if (event.class === 'content' && event.cs !== undefined) this.#contentCounts.set(chainKey, Math.max(this.#contentCounts.get(chainKey) ?? 0, event.cs));
  }

  get2(id: string): StoredV2 | undefined {
    return stored(this.#v2.byId.get(id));
  }

  byNumber(signer: Did, n: number): StoredV2 | undefined {
    return stored(this.#v2.byNumber.get(signer, n));
  }

  number2(signer: Did): number {
    return this.#numbers.get(signer) ?? 0;
  }

  chainAt(signer: Did, space: string, seq: number): ControlEventV2 | undefined {
    const row = this.#v2.chainAt.get(signer, space, seq) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as ControlEventV2) : undefined;
  }

  chainHead(signer: Did, space: string): ControlEventV2 | undefined {
    return this.#chainHeads.get(`${signer} ${space}`);
  }

  contentAt(signer: Did, space: string, cs: number): StoredV2 | undefined {
    return stored(this.#v2.contentAt.get(signer, space, cs));
  }

  contentCount(signer: Did, space: string): number {
    return this.#contentCounts.get(`${signer} ${space}`) ?? 0;
  }

  all2(): StoredV2[] {
    return (this.#v2.all.all() as Array<{ id: string; json: string; body: string | null }>).map((row) => (row.body === null ? stored(row)! : { ...stored(row)!, body: JSON.parse(row.body) as Json }));
  }

  signers2(): Did[] {
    return [...this.#numbers.keys()];
  }

  inSpace2(space: string, since = '', until = '\uffff'): StoredV2[] {
    return (this.#v2.inSpace.all(space, since, until) as Array<{ id: string; json: string }>).map((row) => stored(row)!);
  }

  range2(signer: Did): StoredV2[] {
    return (this.#v2.bySigner.all(signer) as Array<{ id: string; json: string }>).map((row) => stored(row)!);
  }

  body(hash: string): Json | undefined {
    const row = this.#v2.body.get(hash) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Json) : undefined;
  }

  putBody(hash: string, body: Json): void {
    this.#v2.putBody.run(hash, JSON.stringify(body));
  }

  releaseBody(hash: string): void {
    this.#v2.drop.run(hash);
  }

  dropBody(hash: string): void {
    this.#v2.forget.run(hash, new Date().toISOString());
    this.#v2.drop.run(hash);
  }

  forgotten(hash: string): boolean {
    return !!this.#v2.forgotten.get(hash);
  }

  keepPut(stream: string, tag: string, data: string): void {
    this.#v2.keepPut.run(stream, tag, data, new Date().toISOString());
  }

  keepTags(stream: string): string[] {
    return (this.#v2.keepTags.all(stream) as Array<{ tag: string }>).map((r) => r.tag);
  }

  keepItems(stream: string): Array<{ tag: string; data: string }> {
    return this.#v2.keepItems.all(stream) as Array<{ tag: string; data: string }>;
  }

  keepBytes(stream?: string): number {
    const row = (stream ? this.#v2.keepBytes.get(stream) : this.#v2.keepAll.get()) as { n: number };
    return Number(row.n);
  }

  /** How many events each signer has, from the table itself (for checking an import). */
  counts(): Map<Did, number> {
    const rows = this.#db.prepare('SELECT signer, COUNT(*) AS n FROM events GROUP BY signer').all() as Array<{ signer: Did; n: number }>;
    return new Map(rows.map((r) => [r.signer, r.n]));
  }

  meta(key: string): string | undefined {
    const row = this.#db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.#db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  /**
   * Take over the events of JSON-lines logs in one transaction: add them, check
   * the counts per signer, and mark the import done; all of it or nothing.
   */
  importEvents(events: WeaveEvent[]): void {
    this.#db.exec('BEGIN');
    const heads = new Map(this.#heads);
    try {
      for (const event of events) this.append(event);
      const expected = new Map<Did, number>();
      for (const e of events) expected.set(e.signer, (expected.get(e.signer) ?? 0) + 1);
      const counts = this.counts();
      for (const [signer, n] of expected) if (counts.get(signer) !== n) throw new Error(`import of ${signer} stored ${counts.get(signer) ?? 0} of ${n} events`);
      this.setMeta('imported', new Date().toISOString());
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      this.#heads.clear();
      for (const [signer, head] of heads) this.#heads.set(signer, head);
      throw error;
    }
  }

  /**
   * Run `fn` in one transaction: all its writes or none. The cached heads
   * follow a rollback.
   */
  transaction<T>(fn: () => T): T {
    const heads = new Map(this.#heads);
    const numbers = new Map(this.#numbers);
    const chainHeads = new Map(this.#chainHeads);
    const contentCounts = new Map(this.#contentCounts);
    this.#db.exec('BEGIN');
    try {
      const result = fn();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      for (const [map, saved] of [[this.#heads, heads], [this.#numbers, numbers], [this.#chainHeads, chainHeads], [this.#contentCounts, contentCounts]] as Array<[Map<unknown, unknown>, Map<unknown, unknown>]>) {
        map.clear();
        for (const [k, v] of saved) map.set(k, v);
      }
      throw error;
    }
  }

  /** A consistent copy of the database, while it's open. */
  backupTo(path: string): void {
    this.#db.prepare('VACUUM INTO ?').run(path);
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
    if (this.#db.isOpen) this.#db.close();
  }
}

const stored = (row: unknown): StoredV2 | undefined => {
  const r = row as { id: string; json: string } | undefined;
  return r && { id: r.id, event: JSON.parse(r.json) as EventV2 };
};

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
