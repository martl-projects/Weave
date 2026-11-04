import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore, type ControlEventV2, type Did, type Json, type LogStore, type StoredV2, type WeaveEvent } from '@weave/core';

/**
 * LogStore backed by one JSON-lines file per signing key, plus v2.jsonl and
 * bodies.jsonl for v2 events and their bodies. Everything is kept in memory as
 * well; files are only appended to, never rewritten. The fallback when SQLite
 * can't be opened.
 */
export class FileStore implements LogStore {
  readonly dir: string;
  #memory = new MemoryStore();

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f !== V2_FILE && f !== BODIES_FILE && f !== FORGOTTEN_FILE && f !== KEEP_FILE)) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.#memory.append(JSON.parse(line) as WeaveEvent);
        } catch {
          break; // a torn last line after a crash: keep what came before it
        }
      }
    }
    for (const item of readLines(join(dir, V2_FILE)) as StoredV2[]) {
      try {
        this.#memory.add2(item);
      } catch {
        break;
      }
    }
    for (const { hash } of readLines(join(dir, FORGOTTEN_FILE)) as Array<{ hash: string }>) this.#memory.dropBody(hash);
    for (const { stream, tag, data } of readLines(join(dir, KEEP_FILE)) as Array<{ stream: string; tag: string; data: string }>) this.#memory.keepPut(stream, tag, data);
    for (const { hash, body } of readLines(join(dir, BODIES_FILE)) as Array<{ hash: string; body: Json }>) this.#memory.putBody(hash, body);
  }

  head(signer: Did): WeaveEvent | undefined {
    return this.#memory.head(signer);
  }

  get(signer: Did, seq: number): WeaveEvent | undefined {
    return this.#memory.get(signer, seq);
  }

  range(signer: Did, from: number, to?: number): WeaveEvent[] {
    return this.#memory.range(signer, from, to);
  }

  signers(): Did[] {
    return this.#memory.signers();
  }

  append(event: WeaveEvent): void {
    this.#memory.append(event);
    appendFileSync(join(this.dir, fileName(event.signer)), JSON.stringify(event) + '\n');
  }

  add2(item: StoredV2): void {
    this.#memory.add2(item);
    appendFileSync(join(this.dir, V2_FILE), JSON.stringify(item) + '\n');
  }

  get2(id: string): StoredV2 | undefined {
    return this.#memory.get2(id);
  }

  byNumber(signer: Did, n: number): StoredV2 | undefined {
    return this.#memory.byNumber(signer, n);
  }

  number2(signer: Did): number {
    return this.#memory.number2(signer);
  }

  chainAt(signer: Did, space: string, seq: number): ControlEventV2 | undefined {
    return this.#memory.chainAt(signer, space, seq);
  }

  chainHead(signer: Did, space: string): ControlEventV2 | undefined {
    return this.#memory.chainHead(signer, space);
  }

  contentAt(signer: Did, space: string, cs: number): StoredV2 | undefined {
    return this.#memory.contentAt(signer, space, cs);
  }

  contentCount(signer: Did, space: string): number {
    return this.#memory.contentCount(signer, space);
  }

  order2(id: string): number | undefined {
    return this.#memory.order2(id);
  }

  all2(): StoredV2[] {
    return this.#memory.all2();
  }

  signers2(): Did[] {
    return this.#memory.signers2();
  }

  range2(signer: Did): StoredV2[] {
    return this.#memory.range2(signer);
  }

  inSpace2(space: string, since?: string, until?: string): StoredV2[] {
    return this.#memory.inSpace2(space, since, until);
  }

  body(hash: string): Json | undefined {
    return this.#memory.body(hash);
  }

  putBody(hash: string, body: Json): void {
    if (this.#memory.body(hash) !== undefined || this.#memory.forgotten(hash)) return;
    this.#memory.putBody(hash, body);
    appendFileSync(join(this.dir, BODIES_FILE), JSON.stringify({ hash, body }) + '\n');
  }

  /** In memory only: bodies.jsonl is only appended to, so a released body is back after a restart (this store is the fallback). */
  releaseBody(hash: string): void {
    this.#memory.releaseBody(hash);
  }

  /** The body stays in bodies.jsonl (only appended to) but is never read again: forgotten.jsonl says so. */
  dropBody(hash: string): void {
    if (this.#memory.forgotten(hash)) return;
    this.#memory.dropBody(hash);
    appendFileSync(join(this.dir, FORGOTTEN_FILE), JSON.stringify({ hash }) + '\n');
  }

  forgotten(hash: string): boolean {
    return this.#memory.forgotten(hash);
  }

  keepPut(stream: string, tag: string, data: string): void {
    this.#memory.keepPut(stream, tag, data);
    appendFileSync(join(this.dir, KEEP_FILE), JSON.stringify({ stream, tag, data }) + '\n');
  }

  keepTags(stream: string): string[] {
    return this.#memory.keepTags(stream);
  }

  keepItems(stream: string): Array<{ tag: string; data: string }> {
    return this.#memory.keepItems(stream);
  }

  keepBytes(stream?: string): number {
    return this.#memory.keepBytes(stream);
  }

  /** Dropped: the file is written again without it (it's appended to otherwise). */
  keepDrop(stream: string): void {
    this.#memory.keepDrop(stream);
    const lines = this.#memory.keepStreams().flatMap((s) => this.#memory.keepItems(s).map(({ tag, data }) => JSON.stringify({ stream: s, tag, data })));
    writeFileSync(join(this.dir, KEEP_FILE), lines.length ? lines.join('\n') + '\n' : '');
  }
}

const V2_FILE = 'v2.jsonl';
const FORGOTTEN_FILE = 'forgotten.jsonl';
const KEEP_FILE = 'keep.jsonl';
const BODIES_FILE = 'bodies.jsonl';

/** The lines of a JSON-lines file up to the first torn one; none if it doesn't exist. */
function readLines(path: string): unknown[] {
  if (!existsSync(path)) return [];
  const out: unknown[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return out;
}

/** `did:key:z6Mk…` → `z6Mk….jsonl` (colons are not allowed in Windows file names). */
const fileName = (signer: Did): string => `${signer.slice('did:key:'.length)}.jsonl`;
