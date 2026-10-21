import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-limits-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

describe('text limits', () => {
  it('refuses text that readers would cut, instead of shortening it without a word', async () => {
    const node = person('Martin');
    await node.createProject({ name: 'Gameshow' });
    const full = 'x'.repeat(10_000);

    const post = await node.submit({ space: 'Gameshow', title: 'Just fits', text: full });
    expect(post.text).toHaveLength(10_000);

    await expect(node.submit({ space: 'Gameshow', title: 'Too long', text: full + 'y' })).rejects.toThrow('The text is too long: 10,001 characters, at most 10,000.');
    await expect(node.submit({ space: 'Gameshow', title: 't'.repeat(201) })).rejects.toThrow(/The title is too long: 201 characters, at most 200/);
    await expect(node.editPost({ post: post.id, text: full + 'yy' })).rejects.toThrow(/10,002 characters/);
    await expect(node.say({ space: 'Gameshow', text: full + 'z' })).rejects.toThrow(/too long/);
    const issue = await node.openIssue({ project: 'Gameshow', title: 'An issue' });
    await expect(node.reply({ target: issue.id, text: full + 'z' })).rejects.toThrow(/too long/);

    await expect(node.setProjectPage({ project: 'Gameshow', body: 'p'.repeat(100_001) })).rejects.toThrow('The page is too long: 100,001 characters, at most 100,000.');
    expect((await node.setProjectPage({ project: 'Gameshow', body: 'p'.repeat(100_000) })).page?.body).toHaveLength(100_000);

    // Nothing over the limit was written.
    expect((await node.posts({ space: 'Gameshow' })).map((p) => p.title).sort()).toEqual(['An issue', 'Just fits']);
    await node.close();
  });
});
