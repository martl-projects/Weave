import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { describe, expect, it } from 'vitest';
import { createIdentity, Replica } from '@weave/core';
import { SqlStore } from '@weave/node/web';
import { wasmDatabase } from '../src/wasmdb.ts';

/** The store on sqlite-wasm: the same SQL as on a computer, through the browser's database (in memory here: OPFS needs a browser). */

async function store(): Promise<SqlStore> {
  const sqlite3 = await sqlite3InitModule();
  return new SqlStore(wasmDatabase(new sqlite3.oo1.DB(':memory:')));
}

describe('the store on sqlite-wasm', () => {
  it('keeps events, and a new replica over it finds them', async () => {
    const kept = await store();
    const me = createIdentity();
    const first = new Replica(kept);
    first.append2(me, { kind: 'weave.msg', space: 'group:a', body: { text: 'one' } });
    first.append2(me, { kind: 'weave.msg', space: 'group:a', body: { text: 'two' } });
    const again = new Replica(kept);
    expect(again.events((r) => r.scope === 'group:a').map((r) => (r.body as { text: string }).text).sort()).toEqual(['one', 'two']);
    expect(kept.number2(me.did)).toBe(2);
    expect(kept.signers2()).toEqual([me.did]);
    kept.close();
  });

  it('answers with nothing where there is nothing, and leaves statements ready for the next call', async () => {
    const kept = await store();
    expect(kept.get2('none')).toBeUndefined();
    expect(kept.meta('a')).toBeUndefined();
    kept.setMeta('a', 'b');
    kept.setMeta('a', 'c');
    expect(kept.meta('a')).toBe('c');
    expect(kept.get2('none')).toBeUndefined();
    kept.close();
  });

  it('takes a body once and remembers one that was forgotten: the statement with numbered parameters', async () => {
    const kept = await store();
    kept.putBody('h', { text: 'x' });
    expect(kept.body('h')).toEqual({ text: 'x' });
    kept.dropBody('h');
    kept.putBody('h', { text: 'x' });
    expect(kept.body('h')).toBeUndefined();
    expect(kept.forgotten('h')).toBe(true);
    kept.close();
  });

  it('rolls a transaction back, and the numbers it keeps in memory with it', async () => {
    const kept = await store();
    const me = createIdentity();
    const replica = new Replica(kept);
    expect(() =>
      kept.transaction(() => {
        replica.append2(me, { kind: 'weave.msg', space: 'group:a', body: { text: 'gone' } });
        throw new Error('no');
      }),
    ).toThrow('no');
    expect(kept.number2(me.did)).toBe(0);
    expect(kept.all2()).toEqual([]);
    kept.close();
  });

  it('takes a batch as one write, keeps what came before a failure, and lets a batch hold another', async () => {
    const kept = await store();
    const me = createIdentity();
    const replica = new Replica(kept);
    const say = (text: string) => replica.append2(me, { kind: 'weave.msg', space: 'group:a', body: { text } });
    replica.batch(() => {
      say('one');
      replica.batch(() => say('two'));
    });
    expect(() =>
      replica.batch(() => {
        say('three');
        throw new Error('no');
      }),
    ).toThrow('no');
    expect(replica.events((r) => r.scope === 'group:a').length).toBe(3);
    kept.close();
  });

  it('sums what a stream keeps as a number', async () => {
    const kept = await store();
    kept.keepPut('s', 't', 'data');
    expect(kept.keepBytes('s')).toBe(4);
    expect(kept.keepBytes()).toBe(4);
    expect(kept.keepItems('s')).toEqual([{ tag: 't', data: 'data' }]);
    kept.close();
  });
});
