import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { recoveryRoot, signContentEventV2, signEvent } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-keys-'));
  dirs.push(dir);
  return dir;
};

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const allEvents = (node: WeaveNode) => node.replica.events();

describe('identities with a recovery kit', () => {
  it('creates an identity whose root keys never touch the disk', async () => {
    const dir = tempDir();
    const { node, words } = WeaveNode.create('Martin', dir);
    expect(words.split(' ')).toHaveLength(24);
    const me = await node.whoami();
    expect(me.did).toBe(recoveryRoot(words, 0).did);
    expect(me.signer).not.toBe(me.did); // a device key signs day to day
    expect(me.name).toBe('Martin');
    expect(await node.identityInfo()).toMatchObject({ recoverable: true, rotations: 0, forks: [] });

    const onDisk = ['identity.json', 'encryption.json'].map((f) => readFileSync(join(dir, f), 'utf8')).join();
    expect(onDisk).not.toContain(Buffer.from(recoveryRoot(words, 0).secretKey).toString('base64url'));
    expect(onDisk).not.toContain(Buffer.from(recoveryRoot(words, 1).secretKey).toString('base64url'));
    expect(existsSync(join(dir, 'recovery.json'))).toBe(false);
  });

  it('sets up a second device from the words, which reads everything the first could', async () => {
    const { node: laptop, words } = WeaveNode.create('Martin', tempDir());
    const lena = WeaveNode.init('Lena', tempDir());
    await laptop.setEdge({ edge: 'follow', who: lena.identity.author, on: true });
    await lena.setEdge({ edge: 'follow', who: laptop.identity.author, on: true });
    await laptop.setEdge({ edge: 'block', who: lena.identity.author, on: false }); // something private, sealed to myself
    sync(lena, laptop);
    const chat = await laptop.openChat('Lena');
    await laptop.say({ space: chat.id, text: 'hi from the laptop' });

    const desktop = await WeaveNode.restore(words, tempDir(), { events: [...allEvents(laptop), ...allEvents(lena)] });
    expect((await desktop.whoami()).did).toBe(laptop.identity.author);
    expect(desktop.identity.did).not.toBe(laptop.identity.did);
    expect((await desktop.keys()).filter((k) => k.role === 'device')).toHaveLength(2);
    expect((await desktop.messages(chat.id)).map((m) => m.text)).toEqual(['hi from the laptop']);
    await desktop.say({ space: chat.id, text: 'and from the desktop' });
    sync(desktop, lena);
    expect((await lena.messages((await lena.chats())[0].space.id)).map((m) => m.text)).toEqual(['hi from the laptop', 'and from the desktop']);

    await expect(WeaveNode.restore('abandon '.repeat(23) + 'zoo', tempDir())).rejects.toThrow(/valid recovery kit/);
    await expect(WeaveNode.restore(words, tempDir())).rejects.toThrow(/couldn't find your identity/);
  });

  it('rotates the root from the words and leaves a stolen old root powerless', async () => {
    const { node, words } = WeaveNode.create('Martin', tempDir());
    const info = await node.rotateRoot({ words });
    expect(info.rotations).toBe(1);
    await node.setProfile({ name: 'Martin S.' }); // the device keeps signing after a rotation
    expect((await node.whoami()).name).toBe('Martin S.');

    const old = recoveryRoot(words, 0);
    const thief = { author: node.identity.author, did: old.did, keys: old };
    const forged = signEvent(thief, node.replica.store.head(old.did), { kind: 'weave.profile', body: { name: 'Hacked' } });
    expect(node.replica.ingest(forged)).toMatchObject({ status: 'rejected' });
    await expect(node.rotateRoot({ words: WeaveNode.create('Eve', tempDir()).words })).rejects.toThrow(/don't belong/);
  });

  it('rotates the encryption key and still reads what was encrypted to the old one', async () => {
    const { node, words } = WeaveNode.create('Martin', tempDir());
    await node.createGroup('Friends');
    await node.setEdge({ edge: 'mute', who: WeaveNode.init('Noise', tempDir()).identity.author, on: true });
    const before = (await node.identityInfo()).encryptionKey;
    const after = await node.rotateRoot({ words, encryption: true });
    expect(after.encryptionKey).not.toBe(before);
    expect((await node.social()).muted).toHaveLength(1);
  });

  it('revokes agents from the device, devices with the words, and gives a revoked own device a fresh key', async () => {
    const { node, words } = WeaveNode.create('Martin', tempDir());
    await node.addAgent('forge', ['weave.msg']);
    expect((await node.keys()).map((k) => [k.role, k.name])).toEqual([
      ['device', expect.any(String)],
      ['agent', 'forge'],
    ]);
    const keys = await node.revokeKey({ key: 'forge' });
    expect(keys.find((k) => k.name === 'forge')?.revokedAfter).toBe(0);
    await expect(node.publish({ kind: 'weave.msg', body: { text: 'x' }, as: 'forge' })).rejects.toThrow(/not accepted/);

    const oldDevice = node.identity.did;
    await expect(node.revokeKey({ key: oldDevice })).rejects.toThrow(/recovery words/);
    await node.revokeKey({ key: oldDevice, words, since: new Date(Date.now() + 60_000).toISOString() });
    expect(node.identity.did).not.toBe(oldDevice);
    await node.setProfile({ name: 'Martin, new device' });
    expect((await node.whoami()).name).toBe('Martin, new device');
    expect((await node.keys()).find((k) => k.did === oldDevice)?.revokedAfter).toBeGreaterThan(0);
  });

  it('raises the alarm when one of my keys signs two different events at the same place', async () => {
    const { node } = WeaveNode.create('Martin', tempDir());
    // A copy of this home signs its next event with a number this one already used.
    const copy = signContentEventV2(node.identity, { n: node.replica.number(node.identity.did), kind: 'weave.post', body: { text: 'from a copied home' } });
    expect(node.replica.ingest({ e: copy.event, b: copy.body })).toMatchObject({ status: 'rejected', reason: 'conflicting event (fork)' });
    expect((await node.identityInfo()).forks).toEqual([node.identity.did]);
    expect((await node.keys())[0].forked).toBe(true);
  });
});
