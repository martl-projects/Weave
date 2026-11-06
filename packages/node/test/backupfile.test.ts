import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { newRecoveryWords } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { readBackupHead } from '../src/backupfile.ts';

/*
 * The backup file (6.11.2026): a person saves their Weave themself, as one encrypted file. All devices gone, no
 * keeper, no friend online, no network: the recovery words and the file bring back the direct chats, the small
 * groups, the projects with their keys, and what was private. The file alone opens nothing.
 */

const dirs: string[] = [];
const open: WeaveNode[] = [];
afterAll(async () => {
  for (const node of open) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-backupfile-'));
  dirs.push(dir);
  return dir;
};
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const texts = async (node: WeaveNode, space: string) => (await node.feed({ space, kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text).sort();

describe('a backup file', { timeout: 60_000 }, () => {
  it('brings everything back from the recovery words and the file alone, after every device is lost', async () => {
    const made = WeaveNode.create('Martin', temp());
    let martin = made.node;
    const lena = WeaveNode.init('Lena', temp());
    open.push(martin, lena);
    const between = () => (sync(martin, lena), sync(lena, martin));
    between();
    for (const [a, b] of [[martin, lena], [lena, martin]]) await a.setEdge({ edge: 'follow', who: b.identity.author, on: true });
    between();

    // A direct chat, a small group, a project with a post, and something private (a saved post).
    const chat = await martin.openChat('Lena');
    await martin.say({ space: chat.id, text: 'only between us' });
    await martin.createGroup('Duo');
    await lena.joinSpace(await martin.invite('Duo'));
    between();
    await lena.say({ space: chat.id, text: 'yes, just us' });
    await lena.say({ space: 'Duo', text: 'our little group' });
    await martin.createProject({ name: 'Trip' });
    const post = await martin.submit({ space: 'Trip', title: 'Hotels in Hainan', text: 'three to choose from' });
    await martin.save({ target: post.id, mode: 'saved' });
    between();

    // Saved into a folder: one file, named with the date; the node remembers when.
    const folder = temp();
    const saved = await martin.saveBackup({ to: folder });
    expect(saved.file).toMatch(/weave-backup-martin-\d{4}-\d{2}-\d{2}\.weavebackup$/);
    expect(saved).toMatchObject({ spaces: 2, attachments: 0 });
    expect(saved.events).toBeGreaterThan(10);
    expect((await martin.status()).lastBackup).toBe(saved.created);
    // Its head says whose it is, in the clear; nothing in the file reads as what it holds.
    expect(readBackupHead(saved.file)).toMatchObject({ v: 1, author: martin.identity.author, name: 'Martin', events: saved.events, spaces: 2 });
    const raw = readFileSync(saved.file);
    const duo = (await martin.spaces()).find((s) => s.name === 'Duo')!;
    for (const secret of ['only between us', 'Hotels in Hainan', 'Duo', duo.id]) expect(raw.includes(secret)).toBe(false);

    // Everything is lost: his devices, and nobody else is around (Lena's node is closed too, no keepers, no network).
    const author = martin.identity.author;
    await martin.close();
    await lena.close();
    open.length = 0;

    // Other words don't open it, and nothing is set up on the computer that tried.
    const elsewhere = temp();
    await expect(WeaveNode.restoreBackup(newRecoveryWords(), saved.file, elsewhere)).rejects.toThrow(/belongs to another identity than these recovery words/);
    expect(() => WeaveNode.open(elsewhere)).toThrow(/no identity/);
    // A file that was changed doesn't open either.
    const tampered = join(temp(), 'tampered.weavebackup');
    const bytes = Buffer.from(raw);
    bytes[bytes.length - 40] ^= 0xff;
    writeFileSync(tampered, bytes);
    await expect(WeaveNode.restoreBackup(made.words, tampered, temp())).rejects.toThrow(/don't open this backup|was changed or damaged/);
    const cut = join(temp(), 'cut.weavebackup');
    writeFileSync(cut, raw.subarray(0, raw.length - 200));
    await expect(WeaveNode.restoreBackup(made.words, cut, temp())).rejects.toThrow(/cut short|don't open this backup/);

    // The words and the file, on a new computer: the same person, a new device, everything back.
    martin = await WeaveNode.restoreBackup(made.words, saved.file, temp());
    open.push(martin);
    expect(martin.identity.author).toBe(author);
    expect((await martin.whoami()).name).toBe('Martin');
    expect(await texts(martin, chat.id)).toEqual(['only between us', 'yes, just us']);
    expect(await texts(martin, 'Duo')).toEqual(['our little group']);
    expect((await martin.posts({ space: 'Trip' })).map((p) => [p.title, !!p.saved])).toEqual([['Hotels in Hainan', true]]);
    expect((await martin.spaces()).map((s) => s.name).sort()).toEqual(['Duo', 'Trip']);
    // The keys came back with it: he can write in his spaces again, as a member like before.
    await martin.say({ space: 'Duo', text: 'back again' });
    await martin.submit({ space: 'Trip', title: 'Flights' });
    expect(await texts(martin, 'Duo')).toEqual(['back again', 'our little group']);
    expect((await martin.status()).lastBackup).toBe(saved.created);
  });

  it('says where it needs a place, and names the file itself when given one', async () => {
    const made = WeaveNode.create('Mara', temp());
    open.push(made.node);
    await expect(made.node.saveBackup({ to: ' ' })).rejects.toThrow(/say where to save it/);
    const file = join(temp(), 'mine.weavebackup');
    expect((await made.node.saveBackup({ to: file })).file).toBe(file);
    // Saved again to the same place: the new one replaces the old, whole.
    expect((await made.node.saveBackup({ to: file })).file).toBe(file);
    expect(readBackupHead(file).author).toBe(made.node.identity.author);
  });
});
