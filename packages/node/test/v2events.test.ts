import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isWireItemV2 } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-v2events-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

describe('a node writing v2', () => {
  it('signs v2 events (what the root signs stays v1), sealed with their inner class, numbered on from v1', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    await martin.submit({ space: 'Weave', title: 'Hello' });
    await martin.say({ space: 'Weave', text: 'hi' });

    const mine = martin.replica.events((r) => r.author === martin.identity.author);
    expect(mine.filter((r) => r.v === 1).map((r) => [r.kind, r.signer === martin.identity.author])).toEqual([
      ['weave.identity', true],
      ['weave.delegate', true],
    ]);
    const sealed = mine.filter((r) => r.kind === 'weave.sealed' && r.scope.startsWith('project:'));
    // The create event and its rules are control; the post and the message content.
    expect(new Set(sealed.map((r) => r.class))).toEqual(new Set(['control', 'content']));
    const device = martin.identity.did;
    const numbers = martin.replica.eventsBy(device).map((r) => r.seq);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(martin.replica.number(device)).toBe(numbers.length);
  });

  it('shows a post once its body arrives, and not before', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    sync(martin, lena);
    sync(lena, martin);
    const post = await martin.submit({ space: 'Weave', title: 'Late body' });

    // Only the event reaches Lena at first.
    const record = martin.replica.events((r) => r.id === post.id)[0];
    expect(isWireItemV2(record.wire)).toBe(true);
    const { e } = record.wire as { e: unknown };
    expect(lena.replica.ingest({ e }).status).toBe('accepted');
    expect((await lena.posts({ space: 'Weave' })).map((p) => p.title)).not.toContain('Late body');

    sync(martin, lena);
    expect((await lena.posts({ space: 'Weave' })).map((p) => p.title)).toContain('Late body');
    // Links by id keep working: Lena upvotes it, Martin sees the vote.
    await lena.upvote({ target: post.id, value: 1 });
    sync(lena, martin);
    expect((await martin.post(post.id)).score).toBe(1);
    for (const node of [martin, lena]) await node.close();
  });
});
