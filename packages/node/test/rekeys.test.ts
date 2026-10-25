import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

/*
 * Julian's issue (cpjHYTDQ), points 4 and 5: two managers rekeying at once, and
 * a rekey judged by who manages the space today instead of when it was made.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-rekeys-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

/** Copy every event between these nodes, and let each act on what it got, as replication would. */
async function syncAll(all: WeaveNode[]) {
  for (let round = 0; round < 3; round++) {
    for (const a of all) for (const b of all) if (a !== b) a.replica.events().forEach((e) => b.replica.ingest(e));
    for (const n of all) await n.reconcile();
  }
}

async function project() {
  const martin = person('Martin');
  const lena = person('Lena');
  const kofi = person('Kofi');
  const ada = person('Ada');
  const bea = person('Bea');
  const all = [martin, lena, kofi, ada, bea];
  await martin.createProject({ name: 'Studio' });
  for (const n of [lena, kofi, ada, bea]) await n.joinSpace(await martin.invite('Studio'));
  await syncAll(all);
  await martin.setMaintainer({ project: 'Studio', who: lena.identity.author, on: true });
  await syncAll(all);
  return { martin, lena, kofi, ada, bea, all };
}

const texts = async (node: WeaveNode) => (await node.messages('Studio')).map((m) => m.text).sort();

describe('rekeys', () => {
  it('two maintainers rekeying at once: everyone keeps both keys, seals with the same one, and reads everything', async () => {
    const { martin, lena, kofi, all } = await project();
    // Neither sees the other's removal (and new key) before writing under it.
    await martin.removeMember('Studio', 'Ada');
    await lena.removeMember('Studio', 'Bea');
    await martin.say({ space: 'Studio', text: 'from Martin, under his new key' });
    await lena.say({ space: 'Studio', text: 'from Lena, under hers' });
    await syncAll(all);

    expect(await texts(kofi)).toEqual(expect.arrayContaining(['from Lena, under hers', 'from Martin, under his new key']));
    expect(await texts(martin)).toEqual(expect.arrayContaining(['from Lena, under hers']));
    expect(await texts(lena)).toEqual(expect.arrayContaining(['from Martin, under his new key']));

    // From now on, all three seal with the same key: a message from either reads everywhere at once.
    await kofi.say({ space: 'Studio', text: 'after both' });
    await syncAll([martin, lena, kofi]);
    expect(await texts(martin)).toContain('after both');
    expect(await texts(lena)).toContain('after both');
  });

  it('a rekey made at the same time as its author is demoted: nobody seals with it, so nobody splits', async () => {
    const { martin, lena, kofi, bea } = await project();
    // Lena rotates the key (removing Ada); Bea takes it at once. Martin, not having seen it, demotes Lena meanwhile.
    await lena.removeMember('Studio', 'Ada');
    await lena.say({ space: 'Studio', text: 'under her new key' });
    await syncAll([lena, bea]);
    await martin.setMaintainer({ project: 'Studio', who: lena.identity.author, on: false });
    await syncAll([martin, lena, kofi, bea]);

    // Whoever took Lena's key reads with it but seals like everyone else: a message from Bea now reads everywhere.
    await bea.say({ space: 'Studio', text: 'from Bea, afterwards' });
    await kofi.say({ space: 'Studio', text: 'from Kofi, afterwards' });
    await syncAll([martin, lena, kofi, bea]);
    for (const node of [martin, kofi, bea]) expect(await texts(node)).toEqual(expect.arrayContaining(['from Bea, afterwards', 'from Kofi, afterwards']));
    expect(await texts(bea)).toContain('under her new key');
  });
});
