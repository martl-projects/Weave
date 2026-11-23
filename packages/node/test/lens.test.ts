import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SERVICE_LABEL } from '@weave/core';
import { closeOpenStores, WeaveNode, type FeedItem, type Fetch } from '../src/index.ts';
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
/** The starter again, asking for a network for its site, in several versions (its own registry: a test swaps fetchImpl). */
let netImages: Fetch;
beforeAll(async () => {
  const component = await buildComponent(join(STARTER, 'src', 'board.js'), 'board');
  const dir = tempDir('weave-lens-image-');
  cpSync(component, join(dir, 'board.wasm'));
  cpSync(join(STARTER, 'site'), join(dir, 'site'), { recursive: true });
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const out = join(tempDir('weave-lens-layer-'), 'layer.tar.gz');
  if (spawnSync(tar, ['-czf', out, '-C', dir, '.']).status !== 0) throw new Error('tar failed');
  // The same, asking for a network for its site ("net"): one host, then one more.
  const withNet = (net: string[]) => JSON.stringify({ ...manifest, client: { ...(manifest.client as object), net } });
  const withLocation = (location: string) => JSON.stringify({ ...manifest, client: { ...(manifest.client as object), location } });
  fetchImpl = registry({ 'kanban:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(manifest) }, wasm: readFileSync(out) } });
  netImages = registry({
    'kanban:1.0': { labels: { [SERVICE_LABEL]: JSON.stringify(manifest) }, wasm: readFileSync(out) },
    'kanban:2.0': { labels: { [SERVICE_LABEL]: withNet(['api.open-meteo.com']) }, wasm: readFileSync(out) },
    'kanban:2.1': { labels: { [SERVICE_LABEL]: withNet(['api.open-meteo.com']) }, wasm: readFileSync(out) },
    'kanban:3.0': { labels: { [SERVICE_LABEL]: withNet(['api.open-meteo.com', '*.tile.openstreetmap.org']) }, wasm: readFileSync(out) },
    // Asking where its member is: roughly, roughly again, then exactly.
    'kanban:4.0': { labels: { [SERVICE_LABEL]: withLocation('rough') }, wasm: readFileSync(out) },
    'kanban:4.1': { labels: { [SERVICE_LABEL]: withLocation('rough') }, wasm: readFileSync(out) },
    'kanban:5.0': { labels: { [SERVICE_LABEL]: withLocation('exact') }, wasm: readFileSync(out) },
    'kanban:6.0': { labels: { [SERVICE_LABEL]: JSON.stringify({ ...manifest, client: { ...(manifest.client as object), tilt: true } }) }, wasm: readFileSync(out) },
    // Telling the members its events name, and asking about its project's tickets.
    'kanban:7.0': { labels: { [SERVICE_LABEL]: JSON.stringify({ ...manifest, client: { ...(manifest.client as object), notify: true, tickets: true } }) }, wasm: readFileSync(out) },
  });
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

  it('lets a person allow their agent a lens’s own kinds: asked for, named by its lens, and taken away again', async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Crew' });
    await martl.setBoard({ project: 'Crew', name: 'tasks', title: 'Tasks' });
    await martl.addAgent('claude', ['weave.post']);
    // No board is shown by a lens yet: its kinds are nobody's to ask for.
    expect(await martl.lensKinds()).toEqual([]);
    await expect(martl.requestPermission({ as: 'claude', kinds: ['kanban.move'] })).rejects.toThrow(/can't ask for kanban\.move: .*\(none here yet\)/);

    await martl.releaseService({ project: 'Crew', image: 'ghcr.io/martl/kanban:1.0' });
    const view = await martl.setBoardLens({ space: 'Crew', board: 'tasks', from: { project: 'Crew' }, mode: 'require' });
    // The board says what its lens writes, and the node what a person may allow beside Weave's kinds (never weave.*).
    expect(view.lens?.writes).toEqual(['weave.post', 'kanban.move']);
    expect(await martl.lensKinds()).toEqual([{ kind: 'kanban.move', lenses: ['Kanban'] }]);

    // The agent adds a card (it may post), but may not move it.
    const added = await martl.boardAction({ space: 'Crew', board: 'tasks', action: 'add', input: { title: 'Cut the video' }, as: 'claude' });
    const card = (added.view.state as Kanban).columns[0].cards[0];
    const move = () => martl.boardAction({ space: 'Crew', board: 'tasks', action: 'move', input: { post: card.id, column: 'Doing' }, as: 'claude' });
    await expect(move()).rejects.toThrow(/agent "claude" may not sign kanban\.move; its person can allow it in Keys & devices/);

    // Still refused: everything, a family of a lens's kinds, and kinds no lens here writes.
    for (const kinds of [['*'], ['kanban.*'], ['kanban.move', 'evil.thing'], ['Kanban.Move']]) {
      await expect(martl.requestPermission({ as: 'claude', kinds })).rejects.toThrow(/can't ask for .*\(here: kanban\.move\)/);
    }
    expect(await martl.permissionRequests()).toEqual([]);

    // It asks for the lens's kind: the request and its notice name the lens.
    const seen: FeedItem[] = [];
    const watching = new AbortController();
    void martl.watch((item) => seen.push(item), watching.signal);
    await new Promise((r) => setTimeout(r, 50));
    const asked = await martl.requestPermission({ as: 'claude', kinds: ['kanban.move', 'weave.post', 'weave.vote'], reason: 'to move the cards I work on' });
    await new Promise((r) => setTimeout(r, 50));
    watching.abort();
    expect(asked).toMatchObject({ agent: 'claude', kinds: ['kanban.move', 'weave.vote'], lenses: { 'kanban.move': ['Kanban'] }, state: 'pending' });
    expect(seen.find((i) => i.notice?.type === 'permission')?.notice).toMatchObject({
      text: 'To sign kanban.move (Kanban), weave.vote: “to move the cards I work on”',
      values: { agent: 'claude', kinds: 'kanban.move (Kanban), weave.vote' },
    });

    // Allowed: the agent moves the card, signed with its own key.
    await martl.answerPermission({ id: asked.id, allow: true });
    expect((await martl.whoami()).agents.find((a) => a.name === 'claude')!.permissions).toEqual(['weave.post', 'kanban.move', 'weave.vote']);
    expect((await martl.requestPermission({ as: 'claude', kinds: ['kanban.move'] })).state).toBe('allowed');
    const moved = await move();
    expect(moved.published).toMatchObject([{ kind: 'kanban.move', author: martl.identity.author, body: { target: card.id, column: 'Doing' } }]);
    expect(moved.published[0].signer).not.toBe(martl.identity.did);
    expect((moved.view.state as Kanban).columns.map((c) => c.cards.map((x) => x.title))).toEqual([[], ['Cut the video'], []]);

    // Taken away again (the dialog in Keys & devices saves what stays ticked): refused as before.
    await martl.updateAgent({ name: 'claude', permissions: ['weave.post', 'weave.vote'] });
    await expect(move()).rejects.toThrow(/may not sign kanban\.move/);
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

  it('lets a site reach the hosts it names only once its member allowed exactly those', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    for (const node of [martl, ola]) node.containerSetup = { ...node.containerSetup, fetch: netImages };
    await martl.createProject({ name: 'Woods' });
    await martl.setBoard({ project: 'Woods', name: 'finds', title: 'Finds' });
    await ola.joinSpace(await martl.invite('Woods'));
    const pin = async (tag: string) => {
      await martl.releaseService({ project: 'Woods', image: `ghcr.io/martl/kanban:${tag}` });
      await martl.setBoardLens({ space: 'Woods', board: 'finds', from: { project: 'Woods', tag }, mode: 'require' });
      sync([martl, ola]);
      return (await ola.boardView({ space: 'Woods', board: 'finds' })).lens!;
    };

    // Asked for, not allowed: its files come without hosts, so its frame reaches nothing.
    let lens = await pin('2.0');
    expect(lens.net).toEqual({ hosts: ['api.open-meteo.com'], allowed: false });
    expect(await ola.lensFile({ release: lens.release, path: '' })).not.toHaveProperty('net');
    expect(await ola.lensNet({ release: lens.release })).toEqual({ hosts: ['api.open-meteo.com'], allowed: false });

    // Allowed by Ola, on Ola's node only.
    expect(await ola.allowLensNet({ release: lens.release })).toEqual({ hosts: ['api.open-meteo.com'], allowed: true });
    expect((await ola.lensFile({ release: lens.release, path: '' })).net).toEqual(['api.open-meteo.com']);
    expect((await martl.boardView({ space: 'Woods', board: 'finds' })).lens!.net!.allowed).toBe(false);

    // A new version asking for the same hosts keeps the yes; one asking for one more asks again.
    lens = await pin('2.1');
    expect(lens.net!.allowed).toBe(true);
    lens = await pin('3.0');
    expect(lens.net).toEqual({ hosts: ['api.open-meteo.com', '*.tile.openstreetmap.org'], allowed: false });
    expect(await ola.lensFile({ release: lens.release, path: '' })).not.toHaveProperty('net');

    // Taken back.
    await ola.allowLensNet({ release: lens.release });
    expect((await ola.lensFile({ release: lens.release, path: '' })).net).toEqual(['api.open-meteo.com', '*.tile.openstreetmap.org']);
    expect((await ola.allowLensNet({ release: lens.release, off: true })).allowed).toBe(false);
    expect(await ola.lensFile({ release: lens.release, path: '' })).not.toHaveProperty('net');

    // A lens without a network has nothing to allow.
    lens = await pin('1.0');
    expect(lens).not.toHaveProperty('net');
    await expect(ola.allowLensNet({ release: lens.release })).rejects.toThrow(/nothing to allow/);
  });

  it('lets a site know where its member is only once they allowed it, as closely as it asks', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    for (const node of [martl, ola]) node.containerSetup = { ...node.containerSetup, fetch: netImages };
    await martl.createProject({ name: 'Walks' });
    await martl.setBoard({ project: 'Walks', name: 'finds', title: 'Finds' });
    await ola.joinSpace(await martl.invite('Walks'));
    const pin = async (tag: string) => {
      await martl.releaseService({ project: 'Walks', image: `ghcr.io/martl/kanban:${tag}` });
      await martl.setBoardLens({ space: 'Walks', board: 'finds', from: { project: 'Walks', tag }, mode: 'require' });
      sync([martl, ola]);
      return (await ola.boardView({ space: 'Walks', board: 'finds' })).lens!;
    };

    let lens = await pin('4.0');
    expect(lens.location).toEqual({ asks: 'rough', allowed: false });
    expect(await ola.allowLensLocation({ release: lens.release })).toEqual({ asks: 'rough', allowed: true });
    expect((await martl.boardView({ space: 'Walks', board: 'finds' })).lens!.location!.allowed).toBe(false);
    // The same wish in a new version keeps the yes; asking for exact asks again.
    lens = await pin('4.1');
    expect(lens.location!.allowed).toBe(true);
    lens = await pin('5.0');
    expect(lens.location).toEqual({ asks: 'exact', allowed: false });
    await ola.allowLensLocation({ release: lens.release });
    expect((await ola.allowLensLocation({ release: lens.release, off: true })).allowed).toBe(false);
    // A lens that doesn't ask has nothing to allow.
    lens = await pin('1.0');
    expect(lens).not.toHaveProperty('location');
    await expect(ola.allowLensLocation({ release: lens.release })).rejects.toThrow(/nothing to allow/);
    // A lens whose manifest says "tilt" may follow how the device is held: its view says so, with nothing to allow.
    expect(lens).not.toHaveProperty('tilt');
    lens = await pin('6.0');
    expect(lens.tilt).toBe(true);
  });

  it('tells the members an event of its lens names, only for a lens whose manifest says so', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    const kati = person('Kati');
    for (const node of [martl, ola, kati]) node.containerSetup = { ...node.containerSetup, fetch: netImages };
    await martl.createProject({ name: 'Evening' });
    await martl.setBoard({ project: 'Evening', name: 'bets', title: 'Bets' });
    await ola.joinSpace(await martl.invite('Evening'));
    await kati.joinSpace(await martl.invite('Evening'));
    const pin = async (tag: string) => {
      await martl.releaseService({ project: 'Evening', image: `ghcr.io/martl/kanban:${tag}` });
      await martl.setBoardLens({ space: 'Evening', board: 'bets', from: { project: 'Evening', tag }, mode: 'require' });
      sync([martl, ola, kati]);
      return (await ola.boardView({ space: 'Evening', board: 'bets' })).lens!;
    };
    /** What `node` is told live while martl writes an event of the lens's kind that names Ola. */
    const told = async (node: WeaveNode, body: Record<string, unknown>) => {
      const items: FeedItem[] = [];
      const stop = new AbortController();
      const watching = node.watch((item) => items.push(item), stop.signal);
      await martl.publish({ kind: 'kanban.move', body: body as never, space: 'Evening' });
      sync([martl, ola, kati]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      stop.abort();
      await watching;
      return items.filter((i) => i.notice).map((i) => i.notice!);
    };
    const names = { board: 'bets', notify: { to: [ola.identity.author], text: 'Your ticket: 1000 chips' } };

    // A lens that doesn't say "notify" tells nobody, whatever its events carry.
    let lens = await pin('1.0');
    expect(lens).not.toHaveProperty('tickets');
    expect(await told(ola, names)).toEqual([]);

    lens = await pin('7.0');
    expect(lens.tickets).toBe(true);
    const notices = await told(ola, names);
    expect(notices).toMatchObject([{ type: 'lens', category: 'activity', title: 'martl in Bets', text: 'Your ticket: 1000 chips', name: 'daemon.notice.lens', from: martl.identity.author, board: 'bets', open: { board: 'bets' } }]);
    expect(notices[0].open.space?.name).toBe('Evening');
    // Nobody else is told, and neither is whoever wrote it; another board's name, or a kind that isn't the lens's, tells nobody.
    expect(await told(kati, names)).toEqual([]);
    expect(await told(martl, { board: 'bets', notify: { to: [martl.identity.author], text: 'to myself' } })).toEqual([]);
    expect(await told(ola, { ...names, board: 'elsewhere' })).toEqual([]);
  });

  it('gives a group the boards its owner makes, each shown through a lens like a project’s', async () => {
    const martl = person('martl');
    const kati = person('Kati');
    for (const node of [martl, kati]) node.containerSetup = { ...node.containerSetup, fetch: netImages };
    await martl.createProject({ name: 'Tools' });
    await martl.releaseService({ project: 'Tools', image: 'ghcr.io/martl/kanban:1.0' });
    const friends = await martl.createGroup('Friends');
    await kati.joinSpace(await martl.invite('Friends'));
    sync([martl, kati]);

    // A group has no boards until its owner makes one; nobody else does, and it holds posts only.
    expect(await martl.boards('Friends')).toEqual([]);
    await expect(kati.setBoard({ project: 'Friends', name: 'album' })).rejects.toThrow(/only the owner/);
    await expect(martl.setBoard({ project: 'Friends', name: 'bugs', type: 'issues' })).rejects.toThrow(/holds posts/);
    expect((await martl.setBoard({ project: 'Friends', name: 'album', title: 'Album' })).map((b) => [b.name, b.title, b.type])).toEqual([['album', 'Album', 'posts']]);
    sync([martl, kati]);
    expect((await kati.boards('Friends')).map((b) => b.name)).toEqual(['album']);

    // Its owner pins a lens released in a project of theirs; a member's node folds the board and signs its actions.
    await expect(kati.setBoardLens({ space: 'Friends', board: 'album', from: { project: 'Tools' } })).rejects.toThrow(/only the maintainers/);
    await martl.setBoardLens({ space: 'Friends', board: 'album', from: { project: 'Tools' }, mode: 'require' });
    sync([martl, kati]);
    const added = await martl.boardAction({ space: 'Friends', board: 'album', action: 'add', input: { title: 'Day one' } });
    expect(added.published).toMatchObject([{ kind: 'weave.post', body: { title: 'Day one', board: 'album' } }]);
    sync([martl, kati]);
    expect((await martl.boards('Friends'))[0].count).toBe(1);
    // A post goes to the group's board like a project's, and has its own chat.
    const post = await kati.submit({ space: 'Friends', title: 'Day two', text: 'by hand' });
    expect(post.board).toBe('album');
    sync([martl, kati]);
    expect((await martl.posts({ space: friends.id, board: 'album' })).map((p) => p.title).sort()).toEqual(['Day one', 'Day two']);
    // A post of the group that names no board of it shows on none.
    await martl.publish({ kind: 'weave.post', body: { title: 'Elsewhere', text: '' }, space: 'Friends' });
    expect((await martl.boards('Friends'))[0].count).toBe(2);
    // Dropped, it is gone with its lens; its posts stay in the logs.
    await martl.setBoard({ project: 'Friends', name: 'album', on: false });
    expect(await martl.boards('Friends')).toEqual([]);
  });

  it('lets a member take a board’s lens along to a group of their own, without being in the project that released it', async () => {
    const martl = person('martl');
    const kati = person('Kati');
    const papa = person('Papa');
    for (const node of [martl, kati, papa]) node.containerSetup = { ...node.containerSetup, fetch: netImages };
    await martl.createProject({ name: 'Tools' });
    await martl.releaseService({ project: 'Tools', image: 'ghcr.io/martl/kanban:1.0' });
    await martl.createGroup('Friends');
    await kati.joinSpace(await martl.invite('Friends'));
    await martl.setBoard({ project: 'Friends', name: 'album', title: 'Album' });
    await martl.setBoardLens({ space: 'Friends', board: 'album', from: { project: 'Tools' }, mode: 'require' });
    await martl.boardAction({ space: 'Friends', board: 'album', action: 'add', input: { title: 'Day one' } });
    sync([martl, kati]);

    // Not to a group that is someone else's, not without saying where, and only a board that has a lens.
    await expect(kati.shareLens({ space: 'Friends', board: 'album', group: 'Friends' })).rejects.toThrow(/only the owner/);
    await expect(kati.shareLens({ space: 'Friends', board: 'album' })).rejects.toThrow(/which group/);
    await expect(martl.shareLens({ space: 'Tools', board: 'ideas', name: 'Else' })).rejects.toThrow(/no client service/);

    // A new group of hers, with a board of its own through the same release: empty, and hers to invite to.
    const shared = await kati.shareLens({ space: 'Friends', board: 'album', name: 'Family' });
    expect(shared).toMatchObject({ space: { kind: 'group', name: 'Family' }, board: 'kanban', title: 'Kanban', lens: { name: 'Kanban', tag: '1.0' } });
    const view = await kati.boardView({ space: shared.space.id, board: shared.board });
    expect(view.lens).toMatchObject({ name: 'Kanban', tag: '1.0', mode: 'require' });
    expect((await kati.boards(shared.space.id))[0].count).toBe(0);
    await papa.joinSpace(await kati.invite(shared.space.id));
    sync([kati, papa]);
    const added = await papa.boardAction({ space: shared.space.id, board: shared.board, action: 'add', input: { title: 'From Papa' } });
    expect(added.published).toMatchObject([{ kind: 'weave.post', body: { title: 'From Papa', board: 'kanban' } }]);
    // What was on the board it came from stayed there.
    expect((await martl.boards('Friends'))[0].count).toBe(1);

    // Again into the same group: a second board beside the first, with the title she gives it.
    const again = await kati.shareLens({ space: 'Friends', board: 'album', group: shared.space.id, title: 'Summer' });
    expect(again).toMatchObject({ board: 'summer', title: 'Summer' });
    expect(await kati.shareLens({ space: 'Friends', board: 'album', group: shared.space.id })).toMatchObject({ board: 'kanban-2' });
    expect((await kati.boards(shared.space.id)).map((b) => b.name).sort()).toEqual(['kanban', 'kanban-2', 'summer']);
  });

  it('refuses a release that isn’t a client service', async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Plain' });
    await expect(martl.setBoardLens({ space: 'Plain', board: 'ideas', from: { project: 'Plain' } })).rejects.toThrow();
  });
});
