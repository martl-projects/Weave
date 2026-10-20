import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, type PostInfo } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-coauthors-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

/** Co-authors as "name·agent state", as a reader sees them. */
const seenBy = async (node: WeaveNode, post: PostInfo) => ((await node.post(post.id)).coauthors ?? []).map((c) => `${c.name}${c.agent ? `·${c.agent}` : ''} ${c.state}`);

describe('co-authors', () => {
  it('shows only co-authors who confirmed, signed by themselves or their own person', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martl, lena, kofi];
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    await kofi.joinSpace(await martl.invite('Weave'));
    await martl.addAgent('claude', ['weave.post', 'weave.reply']);
    await lena.addAgent('codex', ['weave.post', 'weave.post.coauthor']);
    syncAll(all);

    const post = await martl.submit({ space: 'Weave', board: 'ideas', title: 'Honest authorship', with: ['Lena', 'claude', 'Lena·codex'] });
    syncAll(all);
    // The author sees everyone asked; others see nobody until they confirm.
    expect(await seenBy(martl, post)).toEqual(['Lena asked', 'martl·claude asked', 'Lena·codex asked']);
    expect(await seenBy(kofi, post)).toEqual([]);
    expect((await lena.coauthorRequests()).map((r) => [r.post.title, r.agent ?? 'you'])).toEqual([
      ['Honest authorship', 'you'],
      ['Honest authorship', 'codex'],
    ]);

    // Lena confirms for herself; her agent codex confirms for itself.
    await lena.confirmCoauthor({ post: post.id, on: true });
    await lena.confirmCoauthor({ post: post.id, on: true, as: 'codex' });
    // claude can't sign the answer until it may; then it declines.
    await expect(martl.confirmCoauthor({ post: post.id, on: false, as: 'claude' })).rejects.toThrow(/may not sign weave.post.coauthor/);
    await martl.updateAgent({ name: 'claude', permissions: ['weave.post', 'weave.reply', 'weave.post.coauthor'] });
    await martl.confirmCoauthor({ post: post.id, on: false, as: 'claude' });
    syncAll(all);

    expect(await seenBy(kofi, post)).toEqual(['Lena confirmed', 'Lena·codex confirmed']);
    expect(await seenBy(martl, post)).toEqual(['Lena confirmed', 'martl·claude declined', 'Lena·codex confirmed']);
    expect(await lena.coauthorRequests()).toEqual([]);

    // Kofi isn't named: his node refuses, and a confirmation he forges anyway counts for nothing.
    await expect(kofi.confirmCoauthor({ post: post.id, on: true })).rejects.toThrow(/doesn't name you/);
    await kofi.publish({ kind: 'weave.post.coauthor', body: { target: post.id, on: true }, space: post.space!.id });
    syncAll(all);
    expect(await seenBy(martl, post)).toEqual(['Lena confirmed', 'martl·claude declined', 'Lena·codex confirmed']);
  });

  it("doesn't let an agent confirm for its person, or anyone name people outside the space", async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    await lena.addAgent('codex', ['weave.post', 'weave.post.coauthor']);
    syncAll([martl, lena]);

    const post = await martl.submit({ space: 'Weave', board: 'ideas', title: 'Only Lena', with: ['Lena'] });
    syncAll([martl, lena]);
    // codex isn't named, and Lena's word is Lena's: her agent can't give it for her.
    await lena.publish({ kind: 'weave.post.coauthor', body: { target: post.id, on: true }, space: post.space!.id, as: 'codex' });
    syncAll([martl, lena]);
    expect(await seenBy(martl, post)).toEqual(['Lena asked']);

    const outsider = person('Kofi');
    syncAll([martl, lena, outsider]);
    await expect(martl.submit({ space: 'Weave', board: 'ideas', title: 'x', with: [outsider.identity.author] })).rejects.toThrow(/isn't in Weave/);
  });
});
