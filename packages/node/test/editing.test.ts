import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-editing-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Everyone gets everyone's events, as if they had all been online together. */
function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

describe('editing and deleting posts', () => {
  it('lets authors edit their posts, and authors or moderators delete them, for everyone', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    await martin.createCommunity({ name: 'Synths' });
    await lena.joinSpace(await martin.invite('Synths'));
    await kofi.joinSpace(await martin.invite('Synths'));
    syncAll(all);

    const post = await lena.submit({ space: 'Synths', title: 'My first case', text: 'Walnut.', link: 'https://example.com/a' });
    const edited = await lena.editPost({ post: post.short, title: 'My first modular case', text: 'Walnut, 104HP.' });
    expect(edited).toMatchObject({ id: post.id, title: 'My first modular case', text: 'Walnut, 104HP.', link: 'https://example.com/a' });
    expect(edited.edited).toBeDefined();
    expect(await lena.editPost({ post: post.id, link: '' })).not.toHaveProperty('link');
    await expect(lena.editPost({ post: post.id })).rejects.toThrow(/nothing to change/);
    await expect(lena.editPost({ post: post.id, title: '  ' })).rejects.toThrow(/needs a title/);
    syncAll(all);
    expect(await kofi.post(post.id)).toMatchObject({ title: 'My first modular case', text: 'Walnut, 104HP.' });

    // Only the author edits; other members can't delete either.
    await expect(martin.editPost({ post: post.id, title: 'Hijacked' })).rejects.toThrow(/only its author can edit/);
    await expect(kofi.deletePost({ post: post.id })).rejects.toThrow(/author or the moderators/);
    // An edit someone forges by hand is ignored everywhere.
    await kofi.publish({ kind: 'weave.post.edit', body: { target: post.id, title: 'Forged' }, space: 'Synths' });
    await kofi.publish({ kind: 'weave.post.delete', body: { target: post.id }, space: 'Synths' });
    syncAll(all);
    for (const node of all) expect((await node.post(post.id)).title).toBe('My first modular case');

    // The moderator takes it down.
    await martin.deletePost({ post: post.id });
    syncAll(all);
    for (const node of all) {
      expect((await node.posts({ space: 'Synths' })).map((p) => p.id)).not.toContain(post.id);
      await expect(node.post(post.id)).rejects.toThrow(/no post found/);
    }

    // Authors delete their own.
    const mine = await kofi.submit({ space: 'Synths', title: 'Oops' });
    await kofi.deletePost({ post: mine.id });
    expect(await kofi.posts({ space: 'Synths' })).toEqual([]);
  });

  it('keeps edits in a read-limited board as sealed as the post', async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    await martin.createProject({ name: 'Weave' });
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll([martin, kofi]);
    await martin.setBoard({ project: 'Weave', name: 'core-notes', title: 'Core notes' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core-notes', read: [] });
    const post = await martin.submit({ space: 'Weave', board: 'core-notes', title: 'Budget' });
    await martin.editPost({ post: post.id, text: 'Secret numbers' });
    syncAll([martin, kofi]);
    expect((await martin.post(post.id)).text).toBe('Secret numbers');
    expect((await kofi.feed({ space: 'Weave', limit: 500 })).some((i) => JSON.stringify(i.body).includes('Secret numbers'))).toBe(false);
  });

  it('edits only posts, not issues or proposals', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    const issue = await martin.submit({ space: 'Weave', board: 'issues', title: 'Crash on start' });
    await expect(martin.editPost({ post: issue.id, title: 'x' })).rejects.toThrow(/only posts/);
  });
});
