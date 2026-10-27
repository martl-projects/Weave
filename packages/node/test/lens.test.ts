import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SERVICE_LABEL } from '@weave/core';
import { closeOpenStores, WeaveNode, type Fetch } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';
import { registry } from './helpers/registry.ts';

/*
 * Client services: a board's lens. The Kanban starter, released as a wasi/wasm image and pinned to a board by its
 * maintainer; each member's own node fetches it and folds the board through it, and its actions are signed by the
 * member who takes them, checked against its contract and the board.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const STARTER = join(import.meta.dirname, '..', '..', 'sdk', 'starters', 'js-board');
const manifest = JSON.parse(readFileSync(join(STARTER, 'weave.app.json'), 'utf8')) as Record<string, unknown>;

/** The starter's image: its component and its site in one layer. */
let fetchImpl: Fetch;
beforeAll(async () => {
  const component = await buildComponent(join(STARTER, 'src', 'board.js'), 'board');
  const dir = tempDir('weave-lens-image-');
  cpSync(component, join(dir, 'board.wasm'));
  cpSync(join(STARTER, 'site'), join(dir, 'site'), { recursive: true });
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const out = join(tempDir('weave-lens-layer-'), 'layer.tar.gz');
  if (spawnSync(tar, ['-czf', out, '-C', dir, '.']).status !== 0) throw new Error('tar failed');
  fetchImpl = registry({ 'kanban:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(manifest) }, wasm: readFileSync(out) } });
}, 180_000);

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-lens-'));
  node.containerSetup = { fetch: fetchImpl, docker: [process.execPath, join(import.meta.dirname, 'helpers', 'fake-docker.mjs')] };
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

type Kanban = { columns: Array<{ name: string; cards: Array<{ id: string; title: string; by: string }> }> };

describe('client services', { timeout: 120_000 }, () => {
  it('shows a board through its lens on every member’s node, and signs its actions as the member', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    await martl.createProject({ name: 'Team' });
    await martl.setBoard({ project: 'Team', name: 'tasks', title: 'Tasks' });
    await ola.joinSpace(await martl.invite('Team'));
    const released = await martl.releaseService({ project: 'Team', image: 'ghcr.io/martl/kanban:1.0' });
    expect(released.client).toEqual({ component: 'board.wasm', site: 'site', writes: ['weave.post', 'kanban.move'] });
    sync([martl, ola]);

    // Only maintainers choose how a board shows.
    await expect(ola.setBoardLens({ space: 'Team', board: 'tasks', from: { project: 'Team' } })).rejects.toThrow(/only the maintainers/);
    const suggested = await martl.setBoardLens({ space: 'Team', board: 'tasks', from: { project: 'Team' } });
    expect(suggested.lens).toMatchObject({ name: 'Kanban', tag: '1.0', mode: 'suggest' });
    expect(suggested.state).toBeUndefined();
    sync([martl, ola]);
    expect((await ola.boards('Team')).find((b) => b.name === 'tasks')!.lens).toMatchObject({ name: 'Kanban', mode: 'suggest' });

    // Ola chooses it: her node fetches it (no approval: it has no key, no network) and folds the board.
    const empty = await ola.boardView({ space: 'Team', board: 'tasks', use: true });
    expect(empty.lens?.problem).toBeUndefined();
    expect((empty.state as Kanban).columns.map((c) => c.name)).toEqual(['To do', 'Doing', 'Done']);
    expect(empty.actions!.map((a) => (a as { name: string }).name)).toEqual(['add', 'move']);

    // An action: the lens proposes a post in this board, Ola signs it.
    const added = await ola.boardAction({ space: 'Team', board: 'tasks', action: 'add', input: { title: 'Write the docs' } });
    expect(added.published).toMatchObject([{ kind: 'weave.post', author: ola.identity.author, body: { title: 'Write the docs', board: 'tasks' } }]);
    const card = (added.view.state as Kanban).columns[0].cards[0];
    expect(card).toMatchObject({ title: 'Write the docs', by: 'Ola' });
    const moved = await ola.boardAction({ space: 'Team', board: 'tasks', action: 'move', input: { post: card.id, column: 'Doing' } });
    expect(moved.published).toMatchObject([{ kind: 'kanban.move', body: { target: card.id, column: 'Doing' } }]);

    // What the lens refuses, Weave passes on; nothing is published.
    await expect(ola.boardAction({ space: 'Team', board: 'tasks', action: 'move', input: { post: card.id, column: 'Someday' } })).rejects.toThrow(/Kanban won't: the columns are To do, Doing, Done/);
    await expect(ola.boardAction({ space: 'Team', board: 'tasks', action: 'archive' })).rejects.toThrow(/no action "archive"/);

    // martl's node folds the same events into the same board; it's also in the posts as it is.
    sync([martl, ola]);
    const seen = await martl.boardView({ space: 'Team', board: 'tasks', use: true });
    expect((seen.state as Kanban).columns.map((c) => c.cards.map((x) => x.title))).toEqual([[], ['Write the docs'], []]);
    expect((await martl.posts({ space: 'Team', board: 'tasks' })).map((p) => p.title)).toEqual(['Write the docs']);

    // Required: every member's node shows it, without choosing.
    await martl.setBoardLens({ space: 'Team', board: 'tasks', from: { project: 'Team' }, mode: 'require' });
    sync([martl, ola]);
    expect((await ola.boardView({ space: 'Team', board: 'tasks' })).state).toBeDefined();

    // Its view's files, for the app's sandboxed frame: from its site, nothing outside it, and only of a lens pinned here.
    const release = seen.lens!.release;
    expect(seen.lens!.site).toBe(true);
    const page = await ola.lensFile({ release, path: '' });
    expect(page.type).toBe('text/html; charset=utf-8');
    expect(Buffer.from(page.data, 'base64').toString()).toContain('<main id="columns">');
    expect((await ola.lensFile({ release, path: 'app.js' })).type).toBe('text/javascript');
    await expect(ola.lensFile({ release, path: '../../data' })).rejects.toThrow(/not in Kanban's view/);
    await expect(ola.lensFile({ release, path: '../board.wasm' })).rejects.toThrow(/not in Kanban's view/);
    await expect(ola.lensFile({ release: 'unknown', path: '' })).rejects.toThrow(/no board here/);

    // Taken away: just the board again.
    await martl.setBoardLens({ space: 'Team', board: 'tasks', off: true });
    sync([martl, ola]);
    expect(await ola.boardView({ space: 'Team', board: 'tasks', use: true })).not.toHaveProperty('lens');
  });

  it('publishes only what its contract and the board allow, and nothing of a refused action', async () => {
    const component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-lens-evil.js'), 'board');
    const dir = tempDir('weave-lens-evil-');
    cpSync(component, join(dir, 'evil.wasm'));
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe') : 'tar';
    const out = join(tempDir('weave-lens-layer-'), 'layer.tar.gz');
    if (spawnSync(tar, ['-czf', out, '-C', dir, '.']).status !== 0) throw new Error('tar failed');
    const evil = { app: 'evil', name: 'Evil', client: { component: 'evil.wasm', writes: ['weave.post', 'weave.board.lens', 'evil.thing'] } };
    fetchImpl = registry({ 'evil:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(evil) }, wasm: readFileSync(out) } });
    const martl = person('martl');
    await martl.createProject({ name: 'Lab' });
    await martl.setBoard({ project: 'Lab', name: 'tasks', title: 'Tasks' });
    await martl.setBoard({ project: 'Lab', name: 'other', title: 'Other' });
    const outside = await martl.submit({ space: 'Lab', board: 'other', title: 'Not in tasks' });
    await martl.releaseService({ project: 'Lab', image: 'ghcr.io/martl/evil:1.0' });
    await martl.setBoardLens({ space: 'Lab', board: 'tasks', from: { project: 'Lab' }, mode: 'require' });
    const count = () => martl.replica.events().length;
    const before = count();
    const act = (action: string, input?: unknown) => martl.boardAction({ space: 'Lab', board: 'tasks', action, input: input as never });
    await expect(act('unlisted')).rejects.toThrow(/Evil may not propose evil.other/);
    await expect(act('space')).rejects.toThrow(/never proposes weave.board.lens/);
    await expect(act('elsewhere', { post: outside.id })).rejects.toThrow(/about something not in Tasks/);
    await expect(act('half')).rejects.toThrow(/may not propose evil.other/);
    await expect(act('junk')).rejects.toThrow(/isn't JSON/);
    expect(count()).toBe(before);
  });

  it('refuses a release that isn’t a client service', async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Plain' });
    await expect(martl.setBoardLens({ space: 'Plain', board: 'ideas', from: { project: 'Plain' } })).rejects.toThrow();
  });
});
