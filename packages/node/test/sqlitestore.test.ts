import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createIdentity, createSubKey, MemoryStore, signEvent, type LogStore, type SigningIdentity, type WeaveEvent } from '@weave/core';
import { closeOpenStores, FileStore, openStore, readJsonlLogs, resolveHome, SqliteStore, WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-sqlite-'));
  dirs.push(dir);
  return dir;
};

/** A deterministic random number source, so a failure can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** The same events into two stores; afterwards both must answer every question alike. */
function sameAnswers(a: LogStore, b: LogStore, signers: SigningIdentity[]): void {
  expect(new Set(b.signers())).toEqual(new Set(a.signers()));
  for (const { did } of signers) {
    expect(b.head(did)).toEqual(a.head(did));
    const n = a.head(did)?.seq ?? 0;
    expect(b.range(did, 1)).toEqual(a.range(did, 1));
    for (const [from, to] of [[1, n], [2, 3], [n, n], [n + 1, n + 5], [0, 2]] as const) expect(b.range(did, from, to)).toEqual(a.range(did, from, to));
    for (const seq of [1, Math.ceil(n / 2), n, n + 1]) expect(b.get(did, seq)).toEqual(a.get(did, seq));
  }
}

describe('SqliteStore', () => {
  it('answers exactly like the in-memory store, across many signers and random appends, and after reopening', () => {
    const random = rng(42);
    const person = createIdentity();
    const signers = [person, createSubKey(person.author), createIdentity(), createIdentity()];
    const memory = new MemoryStore();
    const path = join(temp(), 'weave.db');
    const sqlite = new SqliteStore(path);
    for (let i = 0; i < 400; i++) {
      const who = signers[Math.floor(random() * signers.length)];
      const event = signEvent(who, memory.head(who.did), { kind: 'weave.post', scope: random() < 0.5 ? 'public' : 'project:abc', body: { n: i, text: 'x'.repeat(Math.floor(random() * 50)) } });
      memory.append(event);
      sqlite.append(event);
    }
    sameAnswers(memory, sqlite, signers);
    // Out of order is refused, as by the in-memory store.
    const stale = signEvent(signers[0], undefined, { kind: 'weave.post', body: null });
    expect(() => sqlite.append(stale)).toThrow(/out-of-order/);

    sqlite.close();
    const reopened = new SqliteStore(path);
    sameAnswers(memory, reopened, signers);
    reopened.close();
  });

  it('takes over the JSON-lines logs of an older home once, keeps them, and can write them out again', () => {
    const dir = temp();
    const home = resolveHome(dir);
    const a = createIdentity();
    const b = createIdentity();
    const old = new FileStore(home.logs);
    const written: WeaveEvent[] = [];
    for (let i = 0; i < 20; i++) {
      const who = i % 3 ? a : b;
      const event = signEvent(who, old.head(who.did), { kind: 'weave.post', body: { i } });
      old.append(event);
      written.push(event);
    }
    // A crash left a torn last line in one log: what came before it counts, as before.
    appendFileSync(join(home.logs, `${a.did.slice('did:key:'.length)}.jsonl`), '{"v":1,"author":');

    const { store, imported } = openStore(home);
    expect(imported).toBe(20);
    expect(existsSync(home.logs)).toBe(false);
    expect(readdirSync(`${home.logs}.v1-imported`).length).toBe(2);
    sameAnswers(old, store, [a, b]);

    // Written out and read back, it's the same history.
    const out = join(dir, 'export');
    expect(store.exportJsonl(out)).toEqual({ files: 2, events: 20 });
    expect(new Set(readJsonlLogs(out).map((e) => e.sig))).toEqual(new Set(written.map((e) => e.sig)));
    store.close();

    // Opening again imports nothing twice.
    const again = openStore(home);
    expect(again.imported).toBeUndefined();
    expect(again.store.range(a.did, 1).length + again.store.range(b.did, 1).length).toBe(20);
    again.store.close();
  });

  it('moves a real node onto weave.db with its history intact, and keeps the old logs if it can’t', async () => {
    const dir = temp();
    const node = WeaveNode.init('Martin', dir);
    await node.createProject({ name: 'Weave' });
    await node.submit({ space: 'Weave', title: 'Before the move' });
    await node.close();

    // Make it an older home: its events back in logs/, no weave.db.
    const home = resolveHome(dir);
    const db = new SqliteStore(join(dir, 'weave.db'));
    db.exportJsonl(home.logs);
    db.close();
    for (const f of readdirSync(dir).filter((f) => f.startsWith('weave.db'))) rmSync(join(dir, f));

    const moved = WeaveNode.open(dir);
    expect((await moved.posts({ space: 'Weave' })).map((p) => p.title)).toEqual(['Before the move']);
    expect(existsSync(join(dir, 'weave.db'))).toBe(true);
    expect(existsSync(home.logs)).toBe(false);
    await moved.close();

    // Both weave.db and unimported logs (copied in by hand): keep the database, leave the logs alone, say so.
    const other = temp();
    const n2 = WeaveNode.init('Lena', other);
    await n2.createProject({ name: 'Lena’s' });
    await n2.close();
    const otherHome = resolveHome(other);
    mkdirSync(otherHome.logs, { recursive: true });
    const stranger = createIdentity();
    writeFileSync(join(otherHome.logs, 'x.jsonl'), JSON.stringify(signEvent(stranger, undefined, { kind: 'weave.post', body: null })) + '\n');
    const errors: string[] = [];
    const log = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(' '));
    try {
      const kept = WeaveNode.open(other);
      expect(errors.join('\n')).toMatch(/using weave.db and leaving logs\/ as it is/);
      expect((await kept.project('Lena’s')).name).toBe('Lena’s');
      expect(existsSync(join(otherHome.logs, 'x.jsonl'))).toBe(true);
      await kept.close();
    } finally {
      console.error = log;
    }
  });
});
