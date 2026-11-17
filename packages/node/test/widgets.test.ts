import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppManifest, Json } from '@weave/core';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';
import { folderWith, releaseFolder, shareBlobs } from './helpers/release.ts';
import { unpackPure } from '../src/lenses.ts';

/*
 * Group widgets (docs/group-widgets.md): a mini-app sent into a group's chat. Each message is one instance, folded
 * from its own events only; nothing runs on a member's node before they approved the release, and its actions may
 * propose only its own kinds, about its own instance.
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

function person(name: string, dir = tempDir('weave-widget-')): WeaveNode {
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

const MANIFEST = { app: 'tally', name: 'Tally', widget: { component: 'tally.wasm', site: 'site', writes: ['tally.vote'], size: { height: 200 } } };
let component: Uint8Array;
beforeAll(async () => {
  component = readFileSync(await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-widget-tally.js'), 'board'));
}, 180_000);

/** martl's project Games releases Tally; martl and Ola are in the group Friends (Ola isn't in Games). */
async function friends(): Promise<{ martl: WeaveNode; ola: WeaveNode; manifest: AppManifest; release: string }> {
  const martl = person('martl');
  const ola = person('Ola');
  await martl.createProject({ name: 'Games' });
  const manifest = await releaseFolder(martl, { project: 'Games', tag: '1.0', folder: folderWith({ 'weave.app.json': JSON.stringify(MANIFEST), 'tally.wasm': component, 'site/index.html': '<main id="tally"></main>' }) });
  shareBlobs(martl, ola, manifest);
  await martl.createGroup('Friends');
  await ola.joinSpace(await martl.invite('Friends'));
  sync([martl, ola]);
  const release = (await martl.widgetReleases())[0].release;
  return { martl, ola, manifest, release };
}

type Tally = { widget: string; title: string; first: string; startedBy: string; votes: Array<{ by: string; choice: string }> };

describe('group widgets', { timeout: 120_000 }, () => {
  it('folds each instance from its own events only, once each member approved its release', async () => {
    const { martl, ola, release } = await friends();
    expect(await martl.widgetReleases()).toMatchObject([{ name: 'Tally', tag: '1.0', project: { name: 'Games' }, approved: false }]);

    // Two instances of the same release in the group's chat: sending approves it for its sender.
    const a = await martl.sendWidget({ space: 'Friends', project: 'Games', title: 'Pizza or pasta?' });
    const b = await martl.sendWidget({ space: 'Friends', project: 'Games', channel: 'games' });
    expect(a).toMatchObject({ title: 'Pizza or pasta?', approved: true, checked: true, height: 200, site: true, app: { name: 'Tally', tag: '1.0', projectName: 'Games' } });
    expect(b.title).toBe('Tally');
    expect((await martl.widgetReleases())[0].approved).toBe(true);

    // In the chat, each is a message carrying its widget.
    const general = await martl.messages('Friends', { channel: 'general' });
    expect(general.map((m) => m.widget?.title)).toEqual(['Pizza or pasta?']);
    expect((await martl.messages('Friends', { channel: 'games' }))[0].widget).toMatchObject({ name: 'Tally', height: 200, app: { tag: '1.0' } });

    // martl votes in a: only a has it; the widget's message is the first item, its sender the context.
    const voted = await martl.widgetAction({ message: a.id, action: 'vote', input: { choice: 'pizza' } });
    expect(voted.published).toMatchObject([{ kind: 'tally.vote', author: martl.identity.author, body: { choice: 'pizza', target: a.id } }]);
    expect(voted.view.state).toMatchObject({ widget: a.id, title: 'Pizza or pasta?', first: 'weave.widget', startedBy: martl.identity.author, votes: [{ by: 'martl', choice: 'pizza' }] });
    expect(((await martl.widgetView({ message: b.id })).state as Tally).votes).toEqual([]);

    // Ola's node runs nothing before she approves: no state, no files fetched, no view served, no actions.
    sync([martl, ola]);
    const unapproved = await ola.widgetView({ message: a.id });
    expect(unapproved).toMatchObject({ approved: false, checked: false, title: 'Pizza or pasta?', by: { name: 'martl' }, app: { name: 'Tally', tag: '1.0' } });
    expect(unapproved.state).toBeUndefined();
    expect(unapproved.app.projectName).toBeUndefined();
    expect(existsSync(join(ola.home.dir, 'widgets'))).toBe(false);
    await expect(ola.lensFile({ release: `widget-${release}`, path: '' })).rejects.toThrow(/no widget you approved/);
    await expect(ola.widgetAction({ message: a.id, action: 'vote' })).rejects.toThrow(/approve Tally 1.0 first/);

    // She approves the release once (by the message she saw): both instances run for her now.
    const approved = await ola.approveWidget({ message: a.id });
    expect(approved.problem).toBeUndefined();
    expect(approved.approved).toBe(true);
    expect((approved.state as Tally).votes).toEqual([{ by: 'martl', choice: 'pizza' }]);
    expect((await ola.widgetView({ message: b.id })).approved).toBe(true);
    const page = await ola.lensFile({ release: `widget-${release}`, path: '' });
    expect(Buffer.from(page.data, 'base64').toString()).toContain('<main id="tally">');
    await expect(ola.lensFile({ release: `widget-${release}`, path: '../tally.wasm' })).rejects.toThrow(/not in Tally's view/);

    // Her vote in b is b's alone, on both nodes.
    await ola.widgetAction({ message: b.id, action: 'vote', input: { choice: 'no' } });
    sync([martl, ola]);
    expect(((await martl.widgetView({ message: b.id })).state as Tally).votes).toEqual([{ by: 'Ola', choice: 'no' }]);
    expect(((await martl.widgetView({ message: a.id })).state as Tally).votes).toEqual([{ by: 'martl', choice: 'pizza' }]);

    // Taken back: it doesn't run for her again until she approves it again.
    expect((await ola.approveWidget({ message: a.id, off: true })).state).toBeUndefined();

    // Taken down like a message: gone from the chat, and no longer a widget anyone acts in.
    await martl.deleteMessage({ message: a.id });
    expect((await martl.messages('Friends', { channel: 'general' })).length).toBe(0);
    await expect(martl.widgetView({ message: a.id })).rejects.toThrow(/taken down/);
  });

  it('keeps an approval on its member’s node, across restarts', async () => {
    const { martl, manifest } = await friends();
    const dir = tempDir('weave-widget-ola-');
    const ola = person('Ola', dir);
    await ola.joinSpace(await martl.invite('Friends'));
    const sent = await martl.sendWidget({ space: 'Friends', project: 'Games' });
    sync([martl, ola]);
    shareBlobs(martl, ola, manifest);
    await ola.approveWidget({ message: sent.id });
    await ola.close();
    const again = WeaveNode.open(dir);
    nodes.push(again);
    const view = await again.widgetView({ message: sent.id });
    expect(view.approved).toBe(true);
    expect(view.fingerprint).toBe(sent.fingerprint);
  });

  it('publishes only its own kinds, about its own instance, and nothing of a refused action', async () => {
    const { martl } = await friends();
    const a = await martl.sendWidget({ space: 'Friends', project: 'Games' });
    const b = await martl.sendWidget({ space: 'Friends', project: 'Games' });
    const count = () => martl.replica.events().length;
    const before = count();
    const act = (action: string, input?: unknown) => martl.widgetAction({ message: a.id, action, input: input as Json });
    await expect(act('post')).rejects.toThrow(/never proposes weave.post/);
    await expect(act('msg')).rejects.toThrow(/never proposes weave.msg/);
    await expect(act('foreign', { target: b.id })).rejects.toThrow(/something other than this widget/);
    await expect(act('unlisted')).rejects.toThrow(/may not propose tally.other/);
    await expect(act('nothing')).rejects.toThrow(/Tally won't: no action "nothing"/);
    expect(count()).toBe(before);
    expect(((await martl.widgetView({ message: b.id })).state as Tally).votes).toEqual([]);
  });

  it("never runs a release that isn't what its project released", async () => {
    const { martl, manifest, release } = await friends();
    // Someone sends Tally with other files under the same release: whoever is in Games sees it doesn't match.
    const forged = { ...manifest, name: 'Tally', install: { ...manifest.install!, assets: { wasm: { ...manifest.install!.assets!.wasm, sha256: '0'.repeat(64) } } } };
    const games = (await martl.spaces()).find((s) => s.name === 'Games')!;
    const friendsGroup = (await martl.spaces()).find((s) => s.name === 'Friends')!;
    const sent = await martl.publish({ kind: 'weave.widget', body: { app: { project: games.id, release, tag: '1.0' }, manifest: forged as unknown as Json, title: 'Not quite' }, space: friendsGroup.id });
    const view = await martl.widgetView({ message: sent.id });
    expect(view).toMatchObject({ checked: false, approved: false, problem: "it isn't what Games released as 1.0" });
    await expect(martl.approveWidget({ message: sent.id })).rejects.toThrow(/won't run/);
  });

  it('unpacks a release file without a tar program: a component as it is, nothing outside its folder', () => {
    const dir = tempDir('weave-widget-unpack-');
    unpackPure(component, 'tally.wasm', dir);
    expect(readFileSync(join(dir, 'tally.wasm')).length).toBe(component.length);
    const other = tempDir('weave-widget-unpack-');
    unpackPure(new Uint8Array([1, 2, 3]), '../../evil.wasm', other);
    expect(existsSync(join(other, 'evil.wasm'))).toBe(false);
    expect(existsSync(join(other, 'component.wasm'))).toBe(true);
  });

  it('refuses a release that isn’t a widget', async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Plain' });
    await martl.createGroup('Crew');
    await expect(martl.sendWidget({ space: 'Crew', project: 'Plain' })).rejects.toThrow();
  });
});
