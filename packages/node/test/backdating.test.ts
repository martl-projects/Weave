import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { KIND_INVITE_CLOSE, KIND_REMOVE } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

/* What a node writes so that claimed times don't decide (Julian's issue cpjHYTDQ). */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-backdating-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (a: WeaveNode, b: WeaveNode) => a.replica.events().forEach((e) => b.replica.ingest(e));
const details = async (node: WeaveNode, space: string, kind: string) => (await node.audit({ space })).filter((l) => l.kind === kind).map((l) => l.detail as Record<string, unknown>);

describe('what a node writes against backdating', () => {
  it("names the removed member's keys and numbers in a removal", async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const project = await martin.createProject({ name: 'Studio' });
    await lena.joinSpace(await martin.invite('Studio'));
    sync(lena, martin);
    await martin.reconcile();
    sync(martin, lena);
    await lena.say({ space: 'Studio', text: 'hello' });
    sync(lena, martin);
    await martin.removeMember('Studio', 'Lena');
    const [removal] = await details(martin, project.id, KIND_REMOVE);
    // Every key of Lena's that Martin's node holds (her identity's and her device's), with its last number.
    expect(removal?.upTo).toMatchObject({ [lena.identity.did]: lena.replica.number(lena.identity.did) });
  });

  it('closes expired invites, and finished votes so a vote signed afterwards does not count', async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    const project = await martin.createProject({ name: 'Rat' });
    await kofi.joinSpace(await martin.invite('Rat'));
    sync(kofi, martin);
    await martin.reconcile();
    sync(martin, kofi);
    const proposal = await martin.propose({ project: 'Rat', title: 'Ship it?', hours: 1 });
    sync(martin, kofi);
    await kofi.vote({ proposal: proposal.id, choice: 'yes' });
    sync(kofi, martin);

    // A week and a day on: the invite has expired and the deadline passed. Martin's node closes both.
    martin.clock = () => Date.now() + 8 * 86_400_000;
    await martin.reconcile();
    expect((await details(martin, project.id, KIND_INVITE_CLOSE)).length).toBeGreaterThan(0);

    // Kofi changes his vote now: dated before the deadline (his clock), but signed after the close.
    sync(martin, kofi);
    await kofi.vote({ proposal: proposal.id, choice: 'no' });
    sync(kofi, martin);
    const [counted] = await martin.proposals('Rat');
    expect(counted).toMatchObject({ yes: 1, no: 0 });
  });
});
