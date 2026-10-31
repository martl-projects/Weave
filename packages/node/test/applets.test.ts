import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { checkManifest } from '@weave/core';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { dockerRunning, testImage } from './helpers/docker.ts';
import { publishRelease, shippedCheckout } from './helpers/releases.ts';

/*
 * Applets (block 5): a release whose manifest declares a contract. Installed, it becomes a service of the installer's
 * own, under its own key with exactly that contract, pinned to the release; a newer one runs only once taken, and one
 * asking for other rights changes the key's grant.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/** A bot: it answers every request addressed to it with its version, its greeting setting and the text. */
const botCode = (version: string) => `const api = process.env.WEAVE_SERVICE_API;
const headers = { authorization: 'Bearer ' + process.env.WEAVE_SERVICE_TOKEN, 'content-type': 'application/json' };
const answered = new Set();
async function round() {
  const { result } = await (await fetch(api + '/events', { headers })).json();
  for (const item of result ?? []) {
    if (item.kind !== 'weave.service.request' || answered.has(item.id)) continue;
    answered.add(item.id);
    await fetch(api + '/answer', { method: 'POST', headers, body: JSON.stringify({ request: item.id, text: ${JSON.stringify(version)} + ' ' + process.env.GREETING + ': ' + (item.body?.text ?? '') }) });
  }
}
setInterval(() => round().catch(() => {}), 200);
`;

/** A version's image: what its container runs (the bot), by its ref@digest. */
function botImage(version: string): { image: ReturnType<typeof testImage>; script: Record<string, string> } {
  const image = testImage('ghcr.io/martl/bot', version);
  const file = join(tempDir('weave-applet-'), 'bot.cjs');
  writeFileSync(file, botCode(version));
  return { image, script: { [`${image.ref}@${image.digest}`]: file } };
}

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-applets-home-'));
  nodes.push(node);
  return node;
}

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('applets', { timeout: 60_000 }, () => {
  it('reads an applet from its manifest: a contract instead of a web page', () => {
    const applet = checkManifest({ app: 'bot', name: 'Bot', service: { reads: 'addressed', writes: ['weave.post'], version: '1.0' } });
    expect(applet.problems).toEqual([]);
    expect(applet.manifest?.service).toEqual({ reads: 'addressed', writes: ['weave.post'], version: '1.0' });
    expect(checkManifest({ app: 'bot', name: 'Bot' }).problems.join()).toMatch(/says what it does: its web page \("services"[^]*its contract \("service"\), or both/);
    expect(checkManifest({ app: 'bot', name: 'Bot', service: { reads: 'nothing' } }).problems.join()).toMatch(/a service's contract/);
  });

  it("installs another project's applet as your service, with its contract, pinned to its release", async () => {
    // Each version an image of its own, run in a container (Weave runs no programs from releases).
    const v10 = botImage('v1.0');
    const v11 = botImage('v1.1');
    const manifest = (writes: string[], image: ReturnType<typeof testImage>) => ({
      app: 'echo-bot',
      name: 'Echo bot',
      version: 1,
      service: { reads: 'addressed', writes, actions: [{ name: 'greetings', label: 'See the greetings', who: 'members' }, { name: 'greet', label: 'Greet one', who: 'members', input: [{ name: 'id', label: 'Who' }] }], version: '1.0' },
      // Its list, like any service's: a program's, not only a WebAssembly one's, not only Weave's own.
      lists: [{ name: 'greetings', title: 'Greetings', item: 'greeting', list: 'greetings', use: { action: 'greet', label: 'Greet' } }],
      start: { image: image.ref, command: ['node', 'bot.cjs'] },
      install: { image },
      env: [{ name: 'GREETING', label: 'Greeting' }],
    });
    const martl = person('martl');
    const lena = person('Lena');
    dockerRunning(lena, tempDir('weave-applets-docker-'), { ...v10.script, ...v11.script });
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    await publishRelease(martl, { project: 'Bots', tag: 'v1.0', repo: 'martl/bot', manifest: manifest([], v10.image) });
    syncAll([martl, lena]);

    // Lena sees an applet: a service that reads only what's asked of it, run in a container.
    const [artifact] = await lena.artifacts('Bots');
    expect(artifact).toMatchObject({ tag: 'v1.0', website: false, applet: { reads: 'addressed', writes: [] }, runs: 'container' });

    // She installs it in her own group: approved first, with its setting.
    await lena.createGroup('Friends');
    // The names Weave's own services go by are known from the shipped services: built for the test (a checkout
    // without a build, CI say, has no packages/shipped/dist).
    lena.wasmSetup.shippedDir = await shippedCheckout();
    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    try {
      lena.runServices({ port: api.port });
      await expect(lena.addService({ artifact: { project: 'Bots' }, spaces: ['Friends'] })).rejects.toThrow(/approve it first: Weave would run "[^"]* run [^"]*ghcr\.io\/martl\/bot@sha256:[0-9a-f]{64}" from Echo bot v1\.0, released in Bots, as a service that reads only what is asked of it; writes only its answers/);
      await expect(lena.addService({ artifact: { project: 'Bots' }, spaces: ['Friends'], approve: true })).rejects.toThrow(/Echo bot needs Greeting/);
      // Never by a name of Weave's own: nothing passes for one of those.
      await expect(lena.addService({ name: 'github-checkout', artifact: { project: 'Bots' }, spaces: ['Friends'], approve: true, settings: { GREETING: 'Hello' } })).rejects.toThrow(/"github-checkout" is the name of one Weave ships/);
      const bot = await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Friends'], approve: true, settings: { GREETING: 'Hello' } });
      expect(bot).toMatchObject({ name: 'echo-bot', contract: { reads: 'addressed', writes: [], version: '1.0' }, artifact: { tag: 'v1.0', project: { name: 'Bots' } } });
      // Its card shows its list as Weave's own services' do: read from the release it runs, as checked here.
      expect(await lena.serviceLists({ space: 'Friends', service: bot.did })).toEqual([{ name: 'greetings', title: 'Greetings', item: 'greeting', list: 'greetings', use: { action: 'greet', label: 'Greet', mine: true } }]);
      expect(lena.replica.authority.grant(bot.did)?.permissions.sort()).toEqual(['weave.service.profile', 'weave.service.result']);
      const ready = (await lena.serviceReady('echo-bot')).artifact;
      expect(ready?.error).toBeUndefined();
      expect(ready).toMatchObject({ installed: true });

      // It answers in Friends, as "Lena · echo-bot".
      await lena.askService({ space: 'Friends', service: bot.did, text: 'are you there?' });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Friends' }))[0].results.map((r) => r.text)).toEqual(['v1.0 Hello: are you there?']), { timeout: 15_000, interval: 200 });

      // martl releases v1.1, which also posts. Lena's bot stays on v1.0 until she takes it, and then may post.
      await publishRelease(martl, { project: 'Bots', tag: 'v1.1', repo: 'martl/bot', manifest: manifest(['weave.post'], v11.image) });
      syncAll([martl, lena]);
      expect((await lena.services()).find((s) => s.name === 'echo-bot')?.artifact).toMatchObject({ tag: 'v1.0', latest: 'v1.1' });
      await expect(lena.setService({ name: 'echo-bot', artifact: {} })).rejects.toThrow(/approve it first[^]*writes weave\.post and its answers/);
      const updated = await lena.setService({ name: 'echo-bot', artifact: {}, approve: true });
      expect(updated).toMatchObject({ contract: { writes: ['weave.post'] }, artifact: { tag: 'v1.1' } });
      expect(updated.artifact?.latest).toBeUndefined();
      expect(lena.replica.authority.grant(bot.did)?.permissions).toContain('weave.post');
      await lena.serviceReady('echo-bot');
      await lena.askService({ space: 'Friends', service: bot.did, text: 'and now?' });
      await vi.waitFor(async () => expect((await lena.serviceRequests({ space: 'Friends' })).flatMap((r) => r.results.map((x) => x.text))).toContain('v1.1 Hello: and now?'), { timeout: 15_000, interval: 200 });

      // Installed again elsewhere: the one she runs joins there too, with that group's setting, rather than running twice.
      await lena.createGroup('Neighbours');
      const again = await lena.addService({ artifact: { project: 'Bots' }, spaces: ['Neighbours'], approve: true, settings: { GREETING: 'Hi' } });
      expect(again).toMatchObject({ name: 'echo-bot', did: bot.did });
      expect(again.spaces.map((s) => s.name).sort()).toEqual(['Friends', 'Neighbours']);
      expect((await lena.services()).filter((s) => s.artifact)).toHaveLength(1);
      // Another project's release by the same name is another service: numbered, not refused.
      await martl.createProject({ name: 'More bots' });
      await lena.joinSpace(await martl.invite('More bots'));
      await publishRelease(martl, { project: 'More bots', tag: 'v1.1', repo: 'martl/bot', manifest: manifest([], v11.image) });
      syncAll([martl, lena]);
      expect(await lena.addService({ artifact: { project: 'More bots' }, spaces: ['More bots'], approve: true, settings: { GREETING: 'Hey' } })).toMatchObject({ name: 'echo-bot-2', artifact: { project: { name: 'More bots' } } });
    } finally {
      await lena.removeService('echo-bot-2').catch(() => {});
      await lena.removeService('echo-bot').catch(() => {});
      await api.close();
    }
  });

  it('never starts a program from a release: one built per platform runs nowhere, and says why', async () => {
    const sha = 'ab'.repeat(32);
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    // As Weave released them before: a program per platform, no image, no WebAssembly.
    const manifest = { app: 'old-bot', name: 'Old bot', version: 1, service: { reads: 'addressed', writes: [], version: '1.0' }, start: { release: { [`${process.platform}-${process.arch}`]: ['./old-bot'] } } };
    await publishRelease(martl, { project: 'Bots', tag: 'v0.9', repo: 'martl/bot', manifest: { ...manifest, install: { assets: { [`${process.platform}-${process.arch}`]: { file: 'old-bot.tar.gz', sha256: sha, size: 10 } } } } });
    syncAll([martl, lena]);
    const [artifact] = await lena.artifacts('Bots');
    expect(artifact.runs).toBeUndefined();
    expect(artifact.command).toBeUndefined();
    await expect(lena.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true })).rejects.toThrow(/Old bot v0\.9 has nothing Weave runs: no container image and no WebAssembly/);
  });

  it('installs an applet on an always-on node: approved on the computer, fetched and run by the node, its secret sealed to it', async () => {
    const v10 = botImage('v1.0');
    const manifest = { app: 'echo-bot', name: 'Echo bot', version: 1, service: { reads: 'addressed', writes: [], version: '1.0' }, start: { image: v10.image.ref }, install: { image: v10.image }, env: [{ name: 'GREETING', label: 'Greeting', secret: true }] };
    const martl = person('martl');
    await martl.createProject({ name: 'Bots' });
    await publishRelease(martl, { project: 'Bots', tag: 'v1.0', repo: 'martl/bot', manifest });
    const boxDir = tempDir('weave-applets-box-');
    const linked = await martl.linkNode({ request: WeaveNode.nodeRequest(boxDir, 'nas') });
    const box = await WeaveNode.completeNodeLink(linked.answer, boxDir);
    nodes.push(box);
    // The node runs it in a container, with its own Docker.
    dockerRunning(box, tempDir('weave-applets-docker-'), v10.script);
    syncAll([martl, box]);
    await box.reconcile();

    const bot = await martl.addService({ artifact: { project: 'Bots' }, spaces: ['Bots'], approve: true, settings: { GREETING: 'Hi' }, node: 'nas' });
    expect(bot).toMatchObject({ name: 'echo-bot', node: { name: 'nas' }, artifact: { tag: 'v1.0', installed: false }, settings: ['GREETING'] });
    // The secret went to the node only: it isn't in anything the computer can read.
    expect(JSON.stringify(martl.replica.events().map((e) => martl.itemFor(e)))).not.toContain('"Hi"');

    const api = await startApi(box, 0, { service: (token) => box.serviceGate(token) });
    try {
      box.runServices({ port: api.port });
      syncAll([martl, box]);
      await box.reconcile();
      await vi.waitFor(async () => expect((await box.services())[0]).toMatchObject({ name: 'echo-bot', running: true, artifact: { installed: true } }), { timeout: 15_000, interval: 200 });

      await martl.askService({ space: 'Bots', service: bot.did, text: 'up there?' });
      await vi.waitFor(
        async () => {
          syncAll([martl, box]);
          expect((await martl.serviceRequests({ space: 'Bots' }))[0].results.map((r) => r.text)).toEqual(['v1.0 Hi: up there?']);
        },
        { timeout: 15_000, interval: 300 },
      );
    } finally {
      await martl.removeService('echo-bot').catch(() => {});
      syncAll([martl, box]);
      await box.reconcile();
      await api.close();
    }
  });
});
