import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkMarkAnswer, SERVICE_LABEL } from '@weave/core';
import { closeOpenStores, MARKS_TIMING, WeaveNode, type Fetch } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { buildComponent } from './helpers/components.ts';
import { registry } from './helpers/registry.ts';

/*
 * Mark services (stage 19): a project's, released as a wasi/wasm image and taken into your own domain or pinned to a
 * space by its maintainers; and Weave's own (Badges, From Weave), shipped with Weave and everyone's until turned off.
 * Every node runs them over what it holds, and checks what they answer.
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

const MARKS = join(import.meta.dirname, '..', '..', 'shipped');

const STARTER = join(import.meta.dirname, '..', '..', 'sdk', 'starters', 'js-marks');

/** A mark service's image: its component in one layer, its manifest in its label. */
async function image(folder: string, source = join(folder, 'src', 'service.js')): Promise<{ labels: Record<string, string>; wasm: Uint8Array }> {
  const manifest = JSON.parse(readFileSync(join(folder, 'weave.app.json'), 'utf8')) as { marks: { component: string } };
  const component = await buildComponent(source, 'marks', { bundle: true });
  const dir = tempDir('weave-marks-image-');
  cpSync(component, join(dir, manifest.marks.component));
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const out = join(tempDir('weave-marks-layer-'), 'layer.tar.gz');
  if (spawnSync(tar, ['-czf', out, '-C', dir, '.']).status !== 0) throw new Error('tar failed');
  return { labels: { [SERVICE_LABEL]: JSON.stringify(manifest) }, wasm: readFileSync(out) };
}

let fetchImpl: Fetch;
/** Folders of mark services Weave ships, as its build makes them: none, Badges and From Weave, and one tampered with. */
let NONE: string;
let SHIPPED: string;
function shippedFolder(components: Record<string, string>, digest = digestOf): string {
  const dir = tempDir('weave-marks-shipped-');
  const listed: Record<string, unknown> = {};
  for (const [name, component] of Object.entries(components)) {
    const manifest = JSON.parse(readFileSync(join(MARKS, name, 'weave.app.json'), 'utf8')) as { marks: { component: string } };
    copyFileSync(component, join(dir, manifest.marks.component));
    listed[name] = { component: manifest.marks.component, digest: digest(component), manifest };
  }
  writeFileSync(join(dir, 'shipped.json'), JSON.stringify(listed));
  return dir;
}
let built: Record<string, string>;
const tamperedShipped = () => shippedFolder(built, (file) => (file === built['from-weave'] ? `sha256:${'0'.repeat(64)}` : digestOf(file)));
beforeAll(async () => {
  MARKS_TIMING.askMs = 20_000;
  MARKS_TIMING.foldWaitMs = 60_000;
  built = { badges: await buildComponent(join(MARKS, 'badges', 'src', 'service.js'), 'marks', { bundle: true }), 'from-weave': await buildComponent(join(MARKS, 'from-weave', 'src', 'service.js'), 'marks', { bundle: true }) };
  NONE = shippedFolder({});
  SHIPPED = shippedFolder(built);
  fetchImpl = registry({ 'badges:1.0': await image(join(MARKS, 'badges')), 'badges:1.1': await image(join(MARKS, 'badges')), 'from-weave:1.0': await image(join(MARKS, 'from-weave')), 'labels:1.0': await image(STARTER, join(STARTER, 'src', 'marks.js')) });
}, 300_000);

function person(name: string, shipped = NONE): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-marks-'));
  node.wasmSetup.shippedDir = shipped;
  node.containerSetup = { fetch: fetchImpl, docker: [process.execPath, join(import.meta.dirname, 'helpers', 'fake-docker.mjs')] };
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('mark services', { timeout: 240_000 }, () => {
  it('shows badges next to names through the Badges service, in your own domain or a space’s', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    const nic = person('Nic');
    await martl.createProject({ name: 'Weave Badges' });
    await martl.releaseService({ project: 'Weave Badges', image: 'ghcr.io/martl/badges:1.0' });
    await martl.createProject({ name: 'Snake Flight' });
    const series = await martl.createBadgeSeries({ project: 'Snake Flight', name: 'Early bird', symbol: '🐦', limit: 20 });
    const given = await martl.giveBadge({ series: series.id, who: ola.identity.author, note: 'first in' });
    await ola.joinSpace(await martl.invite('Weave Badges'));
    await nic.joinSpace(await martl.invite('Snake Flight'));
    sync([martl, ola, nic]);

    // Nothing is shown before a service is taken in.
    expect(await ola.marks({ slot: 'author', subjects: [{ did: ola.identity.author }] })).toEqual([{ subject: { did: ola.identity.author }, marks: [] }]);
    await expect(nic.addMarks({ project: 'Weave Badges' })).rejects.toThrow(/not|no project/i);

    // Ola takes it into her own domain, with her yes to exactly that release: shown everywhere she looks, with who says so.
    await expect(ola.addMarks({ project: 'Weave Badges' })).rejects.toThrow(/approve it first: Weave would run Badges 1\.0, released in Weave Badges, over .*weave\.badge.* \(no key, no network\), and show what it says next to authors/);
    const taken = await ola.addMarks({ project: 'Weave Badges', approve: true });
    expect(taken).toMatchObject({ service: 'weave-badges', name: 'Badges', tag: '1.0', domain: { kind: 'user' }, slots: ['author', 'member', 'chat', 'profile'] });
    const [answer] = await ola.marks({ slot: 'author', subjects: [{ did: ola.identity.author }, { did: ola.identity.author }] });
    expect(answer.marks).toEqual([{ kind: 'symbol', symbol: '🐦', tooltip: 'Early bird #1 of 20, from martl: “first in”', ref: given.id, issuer: expect.objectContaining({ service: 'weave-badges', name: 'Badges', domain: { kind: 'user' }, digest: expect.stringMatching(/^sha256:/) }) }]);
    expect(answer.marks[0].issuer).not.toHaveProperty('weave');
    // A slot it doesn't answer, and a gate (asked by gates only).
    await expect(ola.marks({ slot: 'gate', subjects: [{ did: ola.identity.author }] })).rejects.toThrow(/a slot is one of/);

    // A badge passed on moves with it, folded incrementally.
    await ola.transferBadge({ badge: given.id, to: martl.identity.author });
    expect((await ola.marks({ slot: 'author', subjects: [{ did: ola.identity.author }] }))[0].marks).toEqual([]);
    expect((await ola.marks({ slot: 'author', subjects: [{ did: martl.identity.author }] }))[0].marks.map((m) => m.ref)).toEqual([given.id]);

    // A newer release doesn't run by itself: it waits for another yes.
    await martl.releaseService({ project: 'Weave Badges', image: 'ghcr.io/martl/badges:1.1' });
    sync([martl, ola, nic]);
    expect((await ola.markServices())[0]).toMatchObject({ tag: '1.0', newer: '1.1' });
    expect(await ola.addMarks({ project: 'Weave Badges', tag: '1.1', approve: true })).toMatchObject({ tag: '1.1' });
    expect((await ola.markServices())[0]).not.toHaveProperty('newer');

    // Removed: nothing again.
    await ola.removeMarks({ service: 'Badges' });
    expect(await ola.markServices()).toEqual([]);
    expect((await ola.marks({ slot: 'author', subjects: [{ did: martl.identity.author }] }))[0].marks).toEqual([]);

    // A space's own: pinned by its maintainers, shown only in that space's views, to every member.
    await expect(nic.addMarks({ project: 'Weave Badges', space: 'Snake Flight' })).rejects.toThrow();
    const pinned = await martl.addMarks({ project: 'Weave Badges', space: 'Snake Flight' });
    expect(pinned.domain).toMatchObject({ kind: 'project', name: 'Snake Flight' });
    sync([martl, ola, nic]);
    const snake = (await nic.spaces()).find((s) => s.name === 'Snake Flight')!.id;
    const inSnake = await nic.marks({ slot: 'member', space: snake, subjects: [{ did: martl.identity.author }] });
    expect(inSnake[0].marks).toMatchObject([{ kind: 'symbol', symbol: '🐦', issuer: { domain: { kind: 'project', id: snake, name: 'Snake Flight' } } }]);
    expect((await nic.marks({ slot: 'member', subjects: [{ did: martl.identity.author }] }))[0].marks).toEqual([]);
    expect((await nic.markServices({ space: 'Snake Flight' })).map((s) => s.name)).toEqual(['Badges']);
  });

  it('shows the mark services Weave ships without taking them in, checked by their digest; From Weave hears only the Weave project', async () => {
    const martl = person('martl', SHIPPED);
    const nic = person('Nic', SHIPPED);
    const weave = await martl.createProject({ name: 'Weave' });
    for (const node of [martl, nic]) node.config = { ...node.config, updates: { project: weave.id } };

    // Everyone's own from the start, Weave's: no project, a bare check.
    expect(await nic.markServices()).toMatchObject([
      { service: 'weave-badges', name: 'Badges', shipped: true, domain: { kind: 'user' } },
      { service: 'from-weave', name: 'From Weave', shipped: true, domain: { kind: 'user' } },
    ]);
    expect((await nic.markServices())[0]).not.toHaveProperty('project');

    await martl.setOfficial({ subject: { did: martl.identity.author }, note: 'runs Weave' });
    await nic.joinSpace(await martl.invite('Weave'));
    sync([martl, nic]);
    const [m] = await nic.marks({ slot: 'author', subjects: [{ did: martl.identity.author }] });
    expect(m.marks).toEqual([{ kind: 'check', tooltip: 'From Weave: runs Weave', issuer: expect.objectContaining({ service: 'from-weave', weave: true, digest: expect.stringMatching(/^sha256:/) }) }]);

    // A look-alike saying the same about Nic gets nothing: only the Weave project's maintainers count.
    await nic.createProject({ name: 'Weave (real)' });
    await nic.publish({ kind: 'weave.official', body: { subject: { did: nic.identity.author }, on: true }, space: 'Weave (real)' });
    expect((await nic.marks({ slot: 'author', subjects: [{ did: nic.identity.author }] }))[0].marks).toEqual([]);
    await expect(nic.setOfficial({ subject: { did: nic.identity.author } })).rejects.toThrow(/only the maintainers/);
    // Nor can a project's service take the name of one Weave ships.
    await nic.releaseService({ project: 'Weave (real)', image: 'ghcr.io/martl/from-weave:1.0' });
    await expect(nic.addMarks({ project: 'Weave (real)', approve: true })).rejects.toThrow(/the name of one Weave ships/);

    // Taken back: no longer from Weave.
    await martl.setOfficial({ subject: { did: martl.identity.author }, on: false });
    sync([martl, nic]);
    expect((await nic.marks({ slot: 'author', subjects: [{ did: martl.identity.author }] }))[0].marks).toEqual([]);

    // Turned off, it stays off until turned on again.
    await nic.removeMarks({ service: 'from-weave' });
    expect((await nic.markServices()).map((s) => s.service)).toEqual(['weave-badges']);
    expect(await nic.markServices({ off: true })).toMatchObject([{ service: 'weave-badges' }, { service: 'from-weave', off: true }]);
    await nic.addMarks({ shipped: 'from-weave' });
    expect((await nic.markServices()).map((s) => s.service)).toEqual(['weave-badges', 'from-weave']);

    // A component that isn't exactly what this Weave ships shows nothing, and says why.
    const tampered = person('Tam', tamperedShipped());
    const [none] = await tampered.marks({ slot: 'author', subjects: [{ did: martl.identity.author }] });
    expect(none.marks).toEqual([]);
    expect((await tampered.markServices()).find((s) => s.service === 'from-weave')?.problem).toMatch(/isn't what this Weave ships/);
  });

  it('runs the starter: labels from its settings, folded again when they change', async () => {
    const lena = person('Lena');
    const phil = person('Phil');
    await lena.createProject({ name: 'My labels' });
    await lena.releaseService({ project: 'My labels', image: 'ghcr.io/martl/labels:1.0' });
    await lena.addMarks({ project: 'My labels', approve: true, settings: { labels: { [phil.identity.author]: 'friend from the climbing gym' } } });
    const [m] = await lena.marks({ slot: 'chat', subjects: [{ did: phil.identity.author }, { space: 'not-a-person' }] });
    expect(m.marks).toMatchObject([{ kind: 'label', text: 'friend from the', tooltip: 'On your list: friend from the climbing gym' }]);
    await lena.addMarks({ project: 'My labels', approve: true, settings: { labels: { [phil.identity.author]: 'colleague' } } });
    expect((await lena.marks({ slot: 'chat', subjects: [{ did: phil.identity.author }] }))[0].marks).toMatchObject([{ kind: 'label', text: 'colleague' }]);
  });

  it('tells the app the marks may have changed only for what a service reads, not for every event', async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Weave Badges' });
    await martl.releaseService({ project: 'Weave Badges', image: 'ghcr.io/martl/badges:1.0' });
    await martl.addMarks({ project: 'Weave Badges', approve: true });
    const series = await martl.createBadgeSeries({ project: 'Weave Badges', name: 'Helper', symbol: '🛟' });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
    await settle(); // taking it in said so already
    const seen: string[] = [];
    const controller = new AbortController();
    void martl.watch((item) => seen.push(item.kind), controller.signal);
    await martl.say({ space: 'Weave Badges', text: 'hello' });
    await settle();
    expect(seen.filter((k) => k === 'weave.marks')).toEqual([]);
    await martl.giveBadge({ series: series.id, who: martl.identity.author });
    await settle();
    expect(seen.filter((k) => k === 'weave.marks')).toEqual(['weave.marks']);
    controller.abort();
  });

  it('keeps answers to the vocabulary and to what was asked', () => {
    const ola = { did: 'did:key:z6MknXmKwnZeniyakNsBzjTgmYMXAct3B9izvVdkzKyCCd5g' as const };
    const raw = [
      { subject: ola, marks: [{ kind: 'label', text: 'a very long label that goes on', tooltip: '<b>hi</b>\nthere' }, { kind: 'html', text: '<script>' }, { kind: 'symbol', symbol: '✓' }, { kind: 'symbol', symbol: 'W' }, { kind: 'count', count: 3 }, { kind: 'image', image: 'https://evil.example/x.png' }, { kind: 'check' }] },
      { subject: { did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }, marks: [{ kind: 'check' }] },
    ];
    const checked = checkMarkAnswer(raw, [ola]);
    expect([...checked.keys()]).toEqual([ola.did]);
    expect(checked.get(ola.did)).toEqual([{ kind: 'label', text: 'a very long labe', tooltip: '<b>hi</b> there' }, { kind: 'count', count: 3 }, { kind: 'check' }]);
  });
});
