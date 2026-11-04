import { describe, expect, it } from 'vitest';
import { people } from './helpers/people.ts';

/*
 * The feed is the tail of everything this node can read (G5N4EzO0): built for
 * the last few items only, in the order they came, and the names on them are
 * read from each person's profile once until they write more.
 */

const { person } = people('feedtail');

describe('the feed', () => {
  it('is the last `limit` items that match, oldest first, and everything with limit 0', async () => {
    const bob = person('Bob');
    const names = ['Bob 1', 'Bob 2', 'Bob 3', 'Bob 4', 'Bob 5'];
    for (const name of names) await bob.setProfile({ name });
    const profiles = (items: Array<{ kind: string; body: unknown }>) => items.filter((i) => i.kind === 'weave.profile').map((i) => (i.body as { name: string }).name);
    const last3 = await bob.feed({ kinds: ['weave.profile'], limit: 3 });
    expect(profiles(last3)).toEqual(['Bob 3', 'Bob 4', 'Bob 5']);
    expect(last3.every((i) => i.authorName === 'Bob 5')).toBe(true);
    expect(profiles(await bob.feed({ kinds: ['weave.profile'], limit: 0 })).slice(-6)).toEqual(['Bob', ...names]);
    const all = await bob.feed({ limit: 0 });
    const tail = await bob.feed({ limit: 4 });
    expect(tail).toEqual(all.slice(-4));
  });

  it('names each person by their latest profile, after they change it too', async () => {
    const alice = person('Alice');
    expect(alice.nameOf(alice.identity.author)).toBe('Alice');
    expect(alice.nameOf(alice.identity.author)).toBe('Alice');
    await alice.setProfile({ name: 'Alice B.' });
    expect(alice.nameOf(alice.identity.author)).toBe('Alice B.');
    const [item] = await alice.feed({ kinds: ['weave.profile'], limit: 1 });
    expect(item.authorName).toBe('Alice B.');
  });
});
