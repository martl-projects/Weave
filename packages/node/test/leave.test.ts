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
  const dir = mkdtempSync(join(tmpdir(), 'weave-leave-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

const names = async (node: WeaveNode, space: string) => (await node.members(space)).map((m) => m.name).sort();

describe('leaving, handing over and closing', () => {
  it('lets a member leave: they stop receiving it, the key rotates, and they can come back with a new link', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    await kofi.joinSpace(await martin.invite('Synth friends'));
    syncAll(all);
    const epoch = (await martin.spaces('group'))[0].epoch;

    await lena.leave('Synth friends');
    expect(await lena.spaces('group')).toEqual([]);
    syncAll(all);
    expect(await names(martin, 'Synth friends')).toEqual(['Kofi', 'Martin']);
    // The owner's node rotates the key once it sees her go; Kofi gets the new one.
    await martin.reconcile();
    syncAll(all);
    expect((await martin.spaces('group'))[0].epoch).toBe(epoch + 1);
    expect((await kofi.spaces('group'))[0].epoch).toBe(epoch + 1);
    await martin.say({ space: 'Synth friends', text: 'after Lena left' });
    syncAll(all);
    expect((await kofi.messages('Synth friends')).map((m) => m.text)).toContain('after Lena left');

    // Leaving isn't being thrown out: a new invite lets her back in.
    await lena.joinSpace(await martin.invite('Synth friends'));
    syncAll(all);
    expect(await names(martin, 'Synth friends')).toEqual(['Kofi', 'Lena', 'Martin']);
  });

  it('makes the owner hand over before leaving', async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    await martin.createProject({ name: 'Weave' });
    await expect(martin.leave('Weave')).rejects.toThrow(/only one in Weave: close it instead/);
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll([martin, kofi]);
    await expect(martin.leave('Weave')).rejects.toThrow(/hand it over to someone first/);
    await expect(kofi.handOver({ space: 'Weave', to: 'Martin' })).rejects.toThrow(/only the owner/);

    expect(await martin.handOver({ space: 'Weave', to: 'Kofi' })).toMatchObject({ founder: kofi.identity.author, founderName: 'Kofi' });
    syncAll([martin, kofi]);
    expect((await kofi.project('Weave')).maintainer).toBe(true);
    await martin.leave('Weave');
    syncAll([martin, kofi]);
    expect(await names(kofi, 'Weave')).toEqual(['Kofi']);
  });

  it('closes a space: kept and readable, but nobody writes in it until it reopens', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    syncAll([martin, lena]);
    await martin.say({ space: 'Synth friends', text: 'last words' });
    await expect(lena.closeSpace({ space: 'Synth friends', closed: true })).rejects.toThrow(/only the owner/);
    expect(await martin.closeSpace({ space: 'Synth friends', closed: true })).toMatchObject({ closed: true });
    syncAll([martin, lena]);
    await expect(lena.say({ space: 'Synth friends', text: 'hello?' })).rejects.toThrow(/is closed/);
    await expect(martin.invite('Synth friends')).rejects.toThrow(/is closed/);
    expect((await lena.messages('Synth friends')).map((m) => m.text)).toEqual(['last words']);

    expect((await martin.closeSpace({ space: 'Synth friends', closed: false })).closed).toBeUndefined();
    syncAll([martin, lena]);
    await lena.say({ space: 'Synth friends', text: 'back again' });
  });
});
