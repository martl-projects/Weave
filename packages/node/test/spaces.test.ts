import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { loadConfig, resolveHome, saveConfig, startDaemon, WeaveNode, type Daemon, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'weave-groups-'));
  dirs.push(dir);
  return dir;
}
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function until(condition: () => Promise<boolean> | boolean, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const texts = (items: FeedItem[]) => items.map((i) => (i.body as { text: string }).text);

describe('projects, groups and the social graph between daemons', () => {
  let testnet: Testnet;
  const daemons: Daemon[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
  });
  afterEach(async () => {
    while (daemons.length) await daemons.pop()!.stop();
  });
  afterAll(async () => {
    await testnet.destroy();
  });

  /** A person on the testnet. Only Alice is told the bootstrap; others learn it from her invite. */
  function person(name: string, withBootstrap: boolean): string {
    const dir = tempHome();
    WeaveNode.init(name, dir);
    if (withBootstrap) {
      const home = resolveHome(dir);
      saveConfig(home, { ...loadConfig(home), bootstrap: testnet.bootstrap });
    }
    return dir;
  }

  it('invites, encrypts, removes with key rotation, and keeps outsiders out', async () => {
    const aliceDir = person('Alice', true);
    const bobDir = person('Bob', false);
    const carolDir = person('Carol', false);

    // Alice starts a group and invites Bob and Carol while everyone is offline.
    const aliceOffline = WeaveNode.open(aliceDir);
    await aliceOffline.createProject({ name: 'Synths' });
    const inviteBob = await aliceOffline.invite('Synths');
    const inviteCarol = await aliceOffline.invite('Synths');
    await aliceOffline.publish({ kind: 'weave.post', body: { text: 'welcome to the synth group' }, space: 'Synths' });
    await aliceOffline.publish({ kind: 'weave.post', body: { text: 'public hello' } });
    await WeaveNode.open(bobDir).joinSpace(inviteBob);
    await WeaveNode.open(carolDir).joinSpace(inviteCarol);
    expect(loadConfig(resolveHome(bobDir)).bootstrap).toEqual(testnet.bootstrap); // learned from the invite

    const alice = await startDaemon(aliceDir);
    const bob = await startDaemon(bobDir);
    const carol = await startDaemon(carolDir);
    daemons.push(alice, bob, carol);

    // Members read the group; the founder sees the invite chain.
    await until(async () => texts(await bob.node.feed({ space: 'Synths' })).includes('welcome to the synth group'));
    await until(async () => (await alice.node.members('Synths')).length === 3);
    const members = await alice.node.members('Synths');
    expect(members.find((m) => m.name === 'Bob')?.invitedByName).toBe('Alice');

    // Relays only ever see sealed events.
    const onDisk = readdirSync(resolveHome(carolDir).logs).map((f) => readFileSync(join(resolveHome(carolDir).logs, f), 'utf8')).join('');
    expect(onDisk).not.toContain('welcome to the synth group');

    // Alice removes Bob; the key rotates; Bob can't read what comes next, Carol can.
    await until(async () => (await carol.node.members('Synths')).length === 3);
    await alice.node.removeMember('Synths', 'Bob');
    await alice.node.publish({ kind: 'weave.post', body: { text: 'after bob' }, space: 'Synths' });
    await until(async () => texts(await carol.node.feed({ space: 'Synths' })).includes('after bob'));
    await until(async () => (await bob.node.status()).events >= (await alice.node.status()).events);
    expect(texts(await bob.node.feed({ space: 'Synths' }))).not.toContain('after bob');
    expect((await carol.node.spaces('project'))[0].epoch).toBe(1);
  });

  it('brings a group into a project, asks about newcomers, and follows standing rules', async () => {
    const aliceDir = person('Alice', true);
    const noahDir = person('Noah', false);
    const lenaDir = person('Lena', false);
    const kofiDir = person('Kofi', false);

    // Alice has a group "Friends" with Noah in it, and a project "XY".
    const aliceOffline = WeaveNode.open(aliceDir);
    await aliceOffline.createGroup('Friends');
    await WeaveNode.open(noahDir).joinSpace(await aliceOffline.invite('Friends'));
    await aliceOffline.createProject({ name: 'XY', description: 'Something we build' });
    await aliceOffline.publish({ kind: 'weave.post', body: { text: 'project kickoff' }, space: 'XY' });

    const alice = await startDaemon(aliceDir);
    const noah = await startDaemon(noahDir);
    daemons.push(alice, noah);
    const noahDid = noah.node.identity.author;
    await until(async () => (await alice.node.members('Friends')).some((m) => m.did === noahDid));

    // Inviting the group admits everyone in it now, and hands them the project's keys.
    await alice.node.inviteGroup({ project: 'XY', group: 'Friends' });
    await until(async () => (await noah.node.spaces('project')).some((s) => s.name === 'XY'));
    await until(async () => texts(await noah.node.feed({ space: 'XY' })).includes('project kickoff'));
    expect((await alice.node.members('XY')).find((m) => m.did === noahDid)?.via?.name).toBe('Friends');

    // Lena joins Friends later (invited by Noah): the maintainers are asked.
    await WeaveNode.open(lenaDir).joinSpace(await noah.node.invite('Friends'));
    const lena = await startDaemon(lenaDir);
    daemons.push(lena);
    const lenaDid = lena.node.identity.author;
    await until(async () => (await alice.node.admissions('XY')).some((a) => a.did === lenaDid && a.change === 'join'));
    expect((await lena.node.spaces('project')).length).toBe(0); // not in until someone says yes

    // Alice lets her in and ticks "allow for all projects with group Friends".
    await alice.node.admit({ project: 'XY', who: lenaDid, group: 'Friends', always: true });
    await until(async () => (await lena.node.spaces('project')).some((s) => s.name === 'XY'));
    expect((await alice.node.project('XY')).groups).toEqual([{ id: expect.any(String), name: 'Friends', auto: true }]);

    // Kofi joins Friends: the rule admits him without asking.
    await WeaveNode.open(kofiDir).joinSpace(await alice.node.invite('Friends'));
    const kofi = await startDaemon(kofiDir);
    daemons.push(kofi);
    await until(async () => (await kofi.node.spaces('project')).some((s) => s.name === 'XY'), 30_000);
    expect(await alice.node.admissions('XY')).toEqual([]);
  });

  it('derives friends from mutual follows and hides blocked people', async () => {
    const aliceDir = person('Alice', true);
    const bobDir = person('Bob', true);
    const malloryDir = person('Mallory', true);
    for (const dir of [aliceDir, bobDir, malloryDir]) {
      const home = resolveHome(dir);
      saveConfig(home, { ...loadConfig(home), topics: ['town-square'] });
    }
    const alice = await startDaemon(aliceDir);
    const bob = await startDaemon(bobDir);
    const mallory = await startDaemon(malloryDir);
    daemons.push(alice, bob, mallory);

    await mallory.node.publish({ kind: 'weave.post', body: { text: 'spam' } });
    await until(() => alice.node.nameOf(bob.node.identity.did) === 'Bob' && alice.node.nameOf(mallory.node.identity.did) === 'Mallory');
    await until(() => bob.node.nameOf(alice.node.identity.did) === 'Alice');

    await alice.node.setEdge({ edge: 'follow', who: 'Bob', on: true });
    await bob.node.setEdge({ edge: 'follow', who: 'Alice', on: true });
    await alice.node.setEdge({ edge: 'block', who: 'Mallory', on: true });

    await until(async () => (await alice.node.social()).friends.length === 1);
    expect((await alice.node.social()).friends[0].name).toBe('Bob');
    expect((await alice.node.social()).blocked[0].name).toBe('Mallory');
    expect(texts(await alice.node.feed({ kinds: ['weave.post'] }))).not.toContain('spam');

    // The block is private: Mallory receives the event but can't read it.
    await until(async () => (await mallory.node.status()).events >= (await alice.node.status()).events);
    expect((await mallory.node.feed({ kinds: ['weave.block'] })).length).toBe(0);
    expect((await mallory.node.social()).followers).toHaveLength(0);
  });
});
