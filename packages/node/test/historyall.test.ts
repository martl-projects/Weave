import { describe, expect, it } from 'vitest';
import { people, sync } from './helpers/people.ts';

/*
 * Julian (2.11.2026): Pferderennen let newcomers read only from when they came, and martl then set it to everything.
 * Newcomers from then on get every key; Julian, already in, still missed the first one, so the ideas from before his
 * invite stayed out of sight.
 */

const { person } = people('historyall');
const titles = async (node: Awaited<ReturnType<typeof person>>) => (await node.posts({ space: 'Race', board: 'ideas' })).map((p) => p.title).sort();

describe('a space set to everything after it let newcomers read only from when they came', () => {
  it('hands those already in the keys from before their invite, once', async () => {
    const [martl, julian] = [person('martl'), person('julian')];
    await martl.createProject({ name: 'Race' });
    await martl.setHistory({ space: 'Race', history: 'joining' });
    await martl.submit({ space: 'Race', board: 'ideas', title: 'Before Julian' });
    await julian.joinSpace(await martl.invite('Race'));
    sync(julian, martl);
    sync(martl, julian);
    await martl.submit({ space: 'Race', board: 'ideas', title: 'After Julian' });
    sync(martl, julian);
    expect(await titles(julian)).toEqual(['After Julian']);

    await martl.setHistory({ space: 'Race', history: 'all' });
    expect(await martl.reconcile()).toBeGreaterThan(0);
    sync(martl, julian);
    expect(await titles(julian)).toEqual(['After Julian', 'Before Julian']);
    // Once: what was handed counts as handed.
    const count = martl.replica.events().length;
    await martl.reconcile();
    expect(martl.replica.events().length).toBe(count);
  });

  it('hands nothing in a space that always let everyone read everything', async () => {
    const [martl, julian] = [person('martl'), person('julian')];
    await martl.createProject({ name: 'Race' });
    await julian.joinSpace(await martl.invite('Race'));
    sync(julian, martl);
    await martl.reconcile();
    const count = martl.replica.events().length;
    await martl.reconcile();
    expect(martl.replica.events().length).toBe(count);
    expect(await titles(julian)).toEqual([]);
  });
});
