import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-access-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Everyone gets everyone's events, as if they had all been online together. */
function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

describe('board access', () => {
  it('lets only a group propose and vote, while everyone else in the project still reads', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    await martin.createGroup('Core');
    await lena.joinSpace(await martin.invite('Core'));
    syncAll(all);
    await martin.createProject({ name: 'Weave' });
    await martin.inviteGroup({ project: 'Weave', group: 'Core' });
    syncAll(all);
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll(all);
    expect((await martin.members('Weave')).map((m) => m.name).sort()).toEqual(['Kofi', 'Lena', 'Martin']);

    await martin.setBoardAccess({ project: 'Weave', board: 'proposals', write: ['group:Core'] });
    syncAll(all);
    const board = (await kofi.boards('Weave')).find((b) => b.name === 'proposals')!;
    expect(board).toMatchObject({ canWrite: false, access: { write: [{ name: 'Core' }] } });
    expect((await lena.boards('Weave')).find((b) => b.name === 'proposals')!.canWrite).toBe(true);

    const proposal = await lena.submit({ space: 'Weave', board: 'proposals', title: 'Adopt Hypercore' });
    await expect(kofi.submit({ space: 'Weave', board: 'proposals', title: 'Sneaky' })).rejects.toThrow(/only some people may write in proposals/);
    syncAll(all);
    // Only Core votes count: Martin (maintainer) and Lena are eligible, Kofi's vote isn't even accepted.
    await martin.vote({ proposal: proposal.id, choice: 'yes' });
    await expect(kofi.vote({ proposal: proposal.id, choice: 'no' })).rejects.toThrow(/only some people may write/);
    syncAll(all);
    const [seen] = await kofi.proposals('Weave');
    expect(seen).toMatchObject({ title: 'Adopt Hypercore', yes: 1, no: 0, eligible: 2 });
  });

  it("ignores writes from people who may not write, even from nodes that didn't know the rule yet", async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    await martin.createProject({ name: 'Weave' });
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll([martin, kofi]);
    await martin.setBoardAccess({ project: 'Weave', board: 'releases', write: ['Martin'] });
    // Kofi hasn't seen the rule yet, so his node lets him post.
    await kofi.submit({ space: 'Weave', board: 'releases', title: 'v9.9.9 (not really)' });
    await martin.submit({ space: 'Weave', board: 'releases', title: 'v0.1.0' });
    syncAll([martin, kofi]);
    for (const node of [martin, kofi]) expect((await node.posts({ space: 'Weave', board: 'releases' })).map((p) => p.title)).toEqual(['v0.1.0']);
  });

  it('keeps a read-limited board unreadable to everyone else, and rotates its key when a reader goes', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll(all);
    await martin.setBoard({ project: 'Weave', name: 'core-notes', title: 'Core notes' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core-notes', read: ['Lena'] });
    await martin.submit({ space: 'Weave', board: 'core-notes', title: 'Budget' });
    syncAll(all);
    await lena.reconcile();

    expect((await lena.posts({ space: 'Weave', board: 'core-notes' })).map((p) => p.title)).toEqual(['Budget']);
    expect((await kofi.boards('Weave')).map((b) => b.name)).not.toContain('core-notes');
    await expect(kofi.posts({ space: 'Weave', board: 'core-notes' })).rejects.toThrow(/no board/);
    // Kofi holds the project key but sees nothing of the board's content.
    expect((await kofi.feed({ space: 'Weave', limit: 500 })).some((i) => JSON.stringify(i.body).includes('Budget'))).toBe(false);

    // Lena may no longer read: a new key goes to the remaining readers only.
    await martin.setBoardAccess({ project: 'Weave', board: 'core-notes', read: ['Kofi'] });
    syncAll(all);
    await kofi.reconcile();
    await martin.submit({ space: 'Weave', board: 'core-notes', title: 'Hiring' });
    syncAll(all);
    expect((await kofi.posts({ space: 'Weave', board: 'core-notes' })).map((p) => p.title).sort()).toEqual(['Budget', 'Hiring']);
    const lenaSees = (await lena.feed({ space: 'Weave', limit: 500 })).map((i) => JSON.stringify(i.body));
    expect(lenaSees.some((t) => t.includes('Hiring'))).toBe(false);
  });

  it('gives board rights with an invite link, keys included', async () => {
    const martin = person('Martin');
    const noah = person('Noah');
    await martin.createProject({ name: 'Weave' });
    await martin.setBoard({ project: 'Weave', name: 'core-notes', title: 'Core notes' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core-notes', read: [], write: [] });
    await martin.submit({ space: 'Weave', board: 'core-notes', title: 'Budget' });
    const link = await martin.invite('Weave', 24, { access: [{ board: 'Core notes', read: true }] });
    await noah.joinSpace(link);
    syncAll([martin, noah]);
    const board = (await noah.boards('Weave')).find((b) => b.name === 'core-notes')!;
    expect(board.canWrite).toBe(false);
    expect((await noah.posts({ space: 'Weave', board: 'core-notes' })).map((p) => p.title)).toEqual(['Budget']);
    await expect(noah.submit({ space: 'Weave', board: 'core-notes', title: 'Me too' })).rejects.toThrow(/only some people may write/);
  });
});

describe('invite links that need your OK', () => {
  it('lets someone knock, carries no keys, and lets them in only when the inviter accepts', async () => {
    const martin = person('Martin');
    const ada = person('Ada');
    const eve = person('Eve');
    await martin.createProject({ name: 'Weave' });
    await martin.say({ space: 'Weave', text: 'welcome, everyone' });
    const link = await martin.invite('Weave', 24, { accept: true });
    expect(link).toMatch(/^weave:knock:/);
    expect(Buffer.from(link.slice('weave:knock:'.length), 'base64url').toString()).not.toMatch(/"keys"/);

    expect(await ada.joinSpace(link, 'Hi, Lena sent me')).toMatchObject({ name: 'Weave', waiting: true });
    await eve.joinSpace(link);
    syncAll([martin, ada, eve]);
    // Before the OK, Ada can't read anything.
    expect(await ada.feed({ limit: 500 }).then((items) => items.some((i) => JSON.stringify(i.body).includes('welcome')))).toBe(false);

    const knocks = await martin.knocks();
    expect(knocks.map((k) => [k.name, k.note, k.space.name])).toEqual([
      ['Ada', 'Hi, Lena sent me', 'Weave'],
      ['Eve', '', 'Weave'],
    ]);
    await martin.answerKnock({ knock: knocks[0].id, accept: true });
    await martin.answerKnock({ knock: knocks[1].id, accept: false });
    syncAll([martin, ada, eve]);
    expect(await martin.knocks()).toEqual([]);
    expect((await martin.members('Weave')).map((m) => m.name).sort()).toEqual(['Ada', 'Martin']);
    expect((await ada.messages('Weave')).map((m) => m.text)).toContain('welcome, everyone');
    await expect(eve.messages('Weave')).rejects.toThrow(/not in/);
  });
});
