import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Replica, sign, spaceScope, type WeaveRecord } from '@weave/core';
import { duplexPair, PeerSession2, type SpaceAccess } from '@weave/net';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';
import { folderWith, releaseFolder, shareBlobs } from './helpers/release.ts';

/*
 * The Fotobuch guests (plan of 23.11.2026, on sync protocol 4): a lens of martl's project "Lens" is pinned to the
 * board of "Book", where Kati and Ben are; they aren't in "Lens". The board carries the project's release channel:
 * their nodes read it, knock once, and martl's node lets them in. They get the releases straight from martl, checked
 * against what he signed; they never learn of each other, and martl alone knows them. Someone with the channel's keys
 * who never knocked (or was taken off) gets nothing.
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

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-channel-'));
  nodes.push(node);
  return node;
}

const settle = (ms = 800) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(a: WeaveNode, b: WeaveNode) {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return { left, right, close: () => (left.close(), right.close()) };
}

/** Everything but the release channel, as the board's members hand it to each other (and identities, knocks). */
const syncBut = (channelScope: () => string | undefined, all: WeaveNode[]) => {
  const keep = (e: WeaveRecord) => !channelScope() || e.scope !== channelScope();
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events(keep).forEach((e) => to.replica.ingest(e));
};

const STARTER = join(import.meta.dirname, '..', '..', 'sdk', 'starters', 'js-board');
let component: Uint8Array;
beforeAll(async () => {
  component = readFileSync(await buildComponent(join(STARTER, 'src', 'board.js'), 'board'));
}, 180_000);

describe('a release channel for a lens pinned elsewhere', { timeout: 120_000 }, () => {
  it('gives guests the releases from its maintainers alone: they knock, are let in, never see one another', async () => {
    const [martl, kati, ben] = [person('martl'), person('Kati'), person('Ben')];
    await martl.createProject({ name: 'Lens' });
    await martl.createProject({ name: 'Book' });
    await martl.setBoard({ project: 'Book', name: 'pages', title: 'Pages' });
    await kati.joinSpace(await martl.invite('Book'));
    await ben.joinSpace(await martl.invite('Book'));
    const manifest = JSON.parse(readFileSync(join(STARTER, 'weave.app.json'), 'utf8')) as Record<string, unknown>;
    const client = manifest.client as Record<string, unknown>;
    const release = await releaseFolder(martl, { project: 'Lens', tag: 'v1.0', folder: folderWith({ 'weave.app.json': JSON.stringify({ ...manifest, client: { ...client, component: 'board.wasm', site: 'site' } }), 'board.wasm': component, 'site/index.html': '<main></main>' }) });

    // Pinned to the book's board: the project gets its release channel, and the board carries it.
    await martl.setBoardLens({ space: 'Book', board: 'pages', from: { project: 'Lens' }, mode: 'require' });
    // Not one of martl's places: he sees it in the project's settings.
    expect((await martl.spaces('project')).map((s) => s.name).sort()).toEqual(['Book', 'Lens']);
    const channelId = (await martl.lensGuests('Lens')).channel!;
    const channel = await martl.project(channelId);
    expect(channel.name).toBe('Lens · Releases');
    expect(channel.serving).toBe('maintainers');
    expect(channel.releasesOf).toBe((await martl.spaces('project')).find((s) => s.name === 'Lens')!.id);
    const scope = spaceScope({ kind: 'project', id: channel.id });
    const channelScope = () => scope;
    // The release, again in the channel, signed by martl.
    expect((await martl.artifacts(channel.id)).map((a) => a.tag)).toEqual(['v1.0']);

    // Kati and Ben get the book (not the channel) and their nodes' rounds: each holds the channel to read and knocks.
    syncBut(channelScope, [martl, kati, ben]);
    await kati.reconcile();
    await ben.reconcile();
    expect((await kati.spaces()).map((s) => s.name)).not.toContain('Lens · Releases');
    expect((await kati.spaces()).map((s) => s.name)).toContain('Book');
    syncBut(channelScope, [martl, kati, ben]);
    // martl's round lets them in: a note in his project, boxed to its maintainers.
    await martl.reconcile();
    const guests = await martl.lensGuests('Lens');
    expect(guests.channel).toBe(channelId);
    expect(guests.guests.map((g) => g.name).sort()).toEqual(['Ben', 'Kati']);
    expect(guests.guests.every((g) => g.on)).toBe(true);
    // Nobody but martl can tell: Kati and Ben aren't in "Lens", and its members (martl) see a sealed note only.
    await expect(kati.lensGuests('Lens')).rejects.toThrow();

    // Over a real connection now: martl gives Kati the channel; she sends nothing in it.
    const c = connect(martl, kati);
    await settle(1500);
    expect(c.left.shared.has(scope)).toBe(true);
    c.close();
    expect((await kati.artifacts(channel.id)).map((a) => a.tag)).toEqual(['v1.0']);
    expect(kati.replica.events((e) => e.scope === scope && e.author === kati.identity.author)).toEqual([]);
    // What she knows of the channel: martl, and nobody else.
    expect((await kati.members(channel.id)).map((m) => m.name)).toEqual(['martl']);
    // She can't write in it, whatever asks.
    await expect(kati.publish({ kind: 'weave.post', body: { title: 'x', text: '' }, space: channel.id } as never)).rejects.toThrow(/only read/);

    // Her board's lens is the official one, fetched through the channel (the blobs from martl, in a test).
    shareBlobs(martl, kati, release);
    const hers = await kati.boardView({ space: 'Book', board: 'pages' });
    expect(hers.lens?.problem).toBeUndefined();
    expect(hers.lens?.official?.project).toBe('Lens');
    expect(hers.lens?.official?.by.name).toBe('martl');

    // Ben too, and he learns nothing of Kati from it: two guests, nothing between them.
    const b = connect(martl, ben);
    await settle(1500);
    b.close();
    expect(ben.replica.events((e) => e.scope === scope && e.author === kati.identity.author)).toEqual([]);
    const k2b = connect(kati, ben);
    await settle(800);
    expect(k2b.left.shared.has(scope)).toBe(false);
    expect(k2b.right.shared.has(scope)).toBe(false);
    k2b.close();

    // Eve has the channel's keys (off a board, a link passed on) and knocked never: nothing.
    const eve = person('Eve');
    const held = martl.sessionAccess().spaces().find((h) => h.space === scope)!;
    const thief = {
      replica: new Replica(),
      access: { spaces: () => [{ space: scope, keys: held.keys }], identity: () => ({ key: eve.identity.did, sign: (m: Uint8Array) => sign(m, eve.identity.keys.secretKey) }) } satisfies SpaceAccess,
    };
    const [se, sm] = duplexPair();
    const left = new PeerSession2(thief.replica, se, { access: thief.access });
    const right = new PeerSession2(martl.replica, sm, { access: martl.sessionAccess() });
    await settle();
    expect(right.shared.has(scope)).toBe(false);
    left.close();
    right.close();
    expect(thief.replica.events((r) => r.scope === scope)).toEqual([]);

    // Kati taken off: martl gives her nothing new, without a new key.
    await martl.setLensGuest({ project: 'Lens', did: kati.identity.author, on: false });
    expect((await martl.lensGuests('Lens')).guests.find((g) => g.name === 'Kati')?.on).toBe(false);
    const again = connect(martl, kati);
    await settle(1000);
    expect(again.left.shared.has(scope)).toBe(false);
    again.close();

    // Book stays the book's: martl gets nothing of a group Kati keeps for herself.
    await kati.createGroup('Kati alone');
    const k = connect(kati, martl);
    await settle(800);
    k.close();
    expect((await martl.spaces('group')).map((s) => s.name)).not.toContain('Kati alone');
  });
});
