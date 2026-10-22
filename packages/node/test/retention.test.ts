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
  const dir = mkdtempSync(join(tmpdir(), 'weave-retention-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const day = 24 * 3600 * 1000;
const holds = (node: WeaveNode, id: string) => {
  const record = node.replica.record2(id);
  return !!record && !record.missing && isWireItemV2(record.wire);
};

describe('retention', () => {
  it('keeps everything under a legal hold: no forgetting, no shredding', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    await martin.createProject({ name: 'Acme' });
    for (const node of [lena, kofi]) await node.joinSpace(await martin.invite('Acme'));
    syncAll();
    await martin.setBoardRule({ space: 'Acme', board: 'ideas', keepDays: 10 });
    const post = await lena.submit({ space: 'Acme', title: 'Evidence' });
    await expect(lena.setHold({ space: 'Acme', until: '2099-01-01' })).rejects.toThrow(/owner/);
    expect((await martin.setHold({ space: 'Acme', until: '2099-01-01', reason: 'litigation' })).hold).toEqual({ until: '2099-01-01T00:00:00.000Z', reason: 'litigation' });
    syncAll();
    kofi.clock = () => Date.now() + 40 * day;
    await kofi.reconcile();
    expect(holds(kofi, post.id)).toBe(true);
    await expect(martin.shred({ space: 'Acme', before: new Date(Date.now() + 365 * day).toISOString() })).rejects.toThrow(/legal hold/);
    // Lifted: forgetting goes on.
    await martin.setHold({ space: 'Acme', until: new Date(Date.now() - day).toISOString() });
    syncAll();
    await kofi.reconcile();
    expect(holds(kofi, post.id)).toBe(false);
    for (const node of all) await node.close();
  });

  it('has archive nodes keep everything of a big space, while others let go', async () => {
    const [owner, archive, lena, kofi, ada] = ['Martin', 'Archive', 'Lena', 'Kofi', 'Ada'].map(person);
    const all = [owner, archive, lena, kofi, ada];
    archive.config = { ...archive.config, archive: true };
    await owner.createCommunity({ name: 'Synths' });
    for (const node of [archive, lena, kofi, ada]) await node.joinSpace(await owner.invite('Synths'));
    for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    const posts = [];
    for (const [i, node] of [lena, kofi, ada, lena, kofi, ada].entries()) posts.push(await node.submit({ space: 'Synths', title: `Post ${i}` }));
    for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    for (const node of all) {
      node.pulledAbove = 2;
      node.clock = () => Date.now() + 21 * day;
      await node.reconcile();
    }
    for (const p of posts) expect(holds(archive, p.id)).toBe(true);
    expect(posts.some((p) => [lena, kofi, ada].some((n) => !holds(n, p.id)))).toBe(true);
    for (const node of all) await node.close();
  });
});
