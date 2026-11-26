import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { KIND_SEALED, open, openMany, seal, usePreopened, type Preopened } from '@weave/core';
import { WeaveNode, closeOpenStores, preopenKeys } from '../src/index.ts';
import type { SqlStore } from '../src/sqlstore.ts';

const dirs: string[] = [];
afterEach(() => void usePreopened());
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-preopen-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Everyone gets everyone's events. */
function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) for (const e of from.replica.events().reverse()) to.replica.ingest(e);
}

/** What a person sees of it, as text. */
async function view(node: WeaveNode): Promise<string> {
  const posts = await node.posts({ space: 'Weave' });
  const members = await node.members('Weave');
  const chat = await node.messages('Friends');
  return JSON.stringify({ posts: posts.map((p) => [p.id, p.title, p.board, p.score]), members: members.map((m) => [m.did, m.name]), chat: chat.map((m) => [m.id, m.text]), spaces: (await node.spaces()).map((s) => s.name).sort() });
}

describe('sealed events opened ahead of time', () => {
  it('opens a home to the same node, and decrypts nothing again that was opened ahead', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Weave' });
    await martin.createGroup('Friends');
    await lena.joinSpace(await martin.invite('Weave'));
    await lena.joinSpace(await martin.invite('Friends'));
    syncAll([martin, lena]);
    await martin.submit({ space: 'Weave', title: 'First idea', text: 'one' });
    await lena.submit({ space: 'Weave', title: 'Second idea' });
    await lena.say({ space: 'Friends', text: 'hello' });
    await martin.say({ space: 'Friends', text: 'hello Lena' });
    // A read-limited board: its events are sealed twice, the outer one with the project's key.
    await martin.setBoard({ project: 'Weave', name: 'core', title: 'Core', type: 'posts' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core', read: ['Martin'] });
    await martin.submit({ space: 'Weave', board: 'core', title: 'Only for readers' });
    syncAll([martin, lena]);
    await martin.reconcile();

    const dir = martin.home.dir;
    const ids = martin._decodedIds();
    const seen = await view(martin);
    const bodies = (martin.replica.store as unknown as SqlStore).rawOfKind(KIND_SEALED);
    await martin.close();
    closeOpenStores();

    const opened = openMany({ keys: preopenKeys(dir), bodies });
    // Everything here is in the person's own space, the group or the project: all of it opens ahead.
    expect(bodies.length).toBeGreaterThan(10);
    expect(opened.length).toBe(bodies.length);

    usePreopened(opened);
    const again = WeaveNode.open(dir, { keepEvents: true });
    again.decodeNow();
    const taken = usePreopened();
    expect(taken).toBeGreaterThanOrEqual(opened.length);
    expect(again._decodedIds()).toEqual(ids);
    expect(again._decodedIds(true)).toEqual(ids);
    expect(await view(again)).toBe(seen);
    await again.close();
  });

  it('gives what was opened ahead only for the same body, key and context', () => {
    const key = new Uint8Array(32).fill(7);
    const other = new Uint8Array(32).fill(8);
    const sealed = seal(key, { kind: 'weave.msg', body: { text: 'real' } }, 'context');
    const ahead = (over: Partial<Preopened>): Preopened => ({ ct: sealed.ct, nonce: sealed.nonce, key: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc', context: 'context', plain: '{"kind":"weave.msg","body":{"text":"from ahead"}}', ...over });

    usePreopened([ahead({})]);
    expect(open(key, sealed, 'context')).toEqual({ kind: 'weave.msg', body: { text: 'from ahead' } });
    // Another key or context is decrypted as ever, and fails as ever.
    expect(() => open(other, sealed, 'context')).toThrow();
    expect(() => open(key, sealed, 'another context')).toThrow();
    expect(usePreopened()).toBe(1);

    // Opened with another key, or with another nonce: not this body's, so it is decrypted here.
    usePreopened([ahead({ key: 'CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg' })]);
    expect(open(key, sealed, 'context')).toEqual({ kind: 'weave.msg', body: { text: 'real' } });
    usePreopened([ahead({ nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })]);
    expect(open(key, sealed, 'context')).toEqual({ kind: 'weave.msg', body: { text: 'real' } });
    expect(usePreopened()).toBe(0);

    // Let go of: decrypted here again.
    expect(open(key, sealed, 'context')).toEqual({ kind: 'weave.msg', body: { text: 'real' } });
  });

  it('opens what the keys open and leaves out the rest', () => {
    const key = new Uint8Array(32).fill(7);
    const k = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';
    const wrong = 'CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';
    const a = { epoch: 1, ...seal(key, { kind: 'weave.msg', body: { text: 'a' } }, 'c1') };
    const b = seal(key, { kind: 'weave.note', body: null }, 'self');
    const opened = openMany({
      keys: { 'group:g': { '1': [{ key: wrong, context: 'c1' }, { key: k, context: 'c1' }], '2': [{ key: k, context: 'c2' }] }, self: { '': [{ key: k, context: 'self' }] } },
      bodies: [
        { scope: 'group:g', json: JSON.stringify(a) },
        { scope: 'self', json: JSON.stringify({ body: b, kind: KIND_SEALED }), event: true },
        // another epoch's key, a place without keys here, and what isn't a sealed body
        { scope: 'group:g', json: JSON.stringify({ ...a, epoch: 2 }) },
        { scope: 'group:other', json: JSON.stringify(a) },
        { scope: 'group:g', json: 'not json' },
        { scope: 'group:g', json: '{"epoch":1}' },
      ],
    });
    expect(opened).toEqual([
      { ct: a.ct, nonce: a.nonce, key: k, context: 'c1', plain: '{"body":{"text":"a"},"kind":"weave.msg"}' },
      { ct: b.ct, nonce: b.nonce, key: k, context: 'self', plain: '{"body":null,"kind":"weave.note"}' },
    ]);
  });
});
