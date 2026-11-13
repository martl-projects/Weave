import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { closeOpenStores, StorageNode, textSocket, WeaveNode, type StorageOptions } from '@weave/node';
import { addWay, arriveAccount, createAccount, findBox, lockState, recoverAccount, removeWay, storageLink, unlockAccount, WORDS, type WayIn } from '../src/account.ts';
import { handOnAgain, useStorage } from '../src/host/net.ts';
import { openingFrom, openingFromWords } from '../src/lock.ts';

/*
 * An account in a browser, with what a computer gives a test: the same account code and the same SwarmNode as in a page,
 * on real files and a real storage node, and a real person on the other side of it. Only the passkey is a stand-in: its
 * PRF value is 32 bytes here.
 */

vi.mock('@weave/net', async (original) => ({ ...(await original<typeof import('@weave/net')>()), SwarmNode: (await import('../src/host/net.ts')).SwarmNode }));

const dirs: string[] = [];
const temp = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), `weave-web-${name}-`));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
});

async function until(ready: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (!(await ready())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

const passkey = (fill: number): WayIn => ({ id: `passkey-${fill}`, opening: openingFrom(new Uint8Array(32).fill(fill)) });

/** Every file under a folder, as text. */
function allText(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((path) => (statSync(path).isDirectory() ? allText(path) : readFileSync(path).toString('latin1')))
    .join('\n');
}

async function world() {
  const { node: lena, words: lenaWords } = WeaveNode.create('Lena', temp('lena'));
  await lena.createGroup('Climb');
  await lena.say({ space: 'Climb', text: 'the rope is in the van' });
  const lenaSessions: PeerSession2[] = [];
  const network: StorageOptions['network'] = (replica, access, blobs) => {
    const sessions: PeerSession2[] = [];
    return {
      // A new topic is a new connection, as on the DHT: a storage node turns away one that shares no space with it yet.
      join: async () => {
        const [a, b] = duplexPair();
        const hers = new PeerSession2(lena.replica, b, { access: lena.sessionAccess(), blobs: lena.blobs });
        lenaSessions.push(hers);
        sessions.push(new PeerSession2(replica, a, { access, blobs }), hers);
      },
      leave: async () => {},
      announce: () => sessions.forEach((session) => session.announce()),
      want: (hashes) => sessions.forEach((session) => session.want(hashes)),
      refreshPublic: () => sessions.forEach((session) => session.refreshPublic()),
      destroy: async () => {},
    };
  };
  const dir = temp('storage');
  const storage = await StorageNode.open({ dir, network });
  const server = createServer((_req, res) => res.end());
  server.on('upgrade', (req, socket, head) => void storage.accept(textSocket(req, socket, head)!).catch(() => {}));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const stop = async () => {
    server.closeAllConnections();
    server.close();
    await storage.close();
    await lena.close();
  };
  return { lena, lenaWords, lenaSessions, storage, dir, url, stop };
}

const texts = async (node: WeaveNode) => (await node.messages('Climb')).map((m) => m.text);

describe('an account in a browser', { timeout: 60_000 }, () => {
  it('leaves nothing open at rest, and opens with a way in and nothing else', async () => {
    const dir = temp('rest');
    expect(lockState(dir)).toEqual({ exists: false, ways: [] });
    const { node, words } = createAccount(dir, 'Web', passkey(1));
    await node.createGroup('Mine');
    const did = node.identity.did;
    await node.close();
    expect(lockState(dir).ways.sort()).toEqual(['passkey-1', WORDS].sort());

    const onDisk = allText(dir);
    expect(onDisk).not.toContain(words.split(' ').slice(0, 3).join(' '));
    expect(onDisk).not.toContain('"keystore"');

    expect(() => unlockAccount(dir, passkey(2))).toThrow("that isn't a way into this account");
    expect(() => unlockAccount(dir, { id: 'passkey-1', opening: passkey(2).opening })).toThrow("that doesn't open this account");
    expect(() => unlockAccount(dir, { id: WORDS, opening: openingFromWords('abandon '.repeat(23) + 'art') })).toThrow("that doesn't open this account");

    const byPasskey = unlockAccount(dir, passkey(1));
    expect(byPasskey.identity.did).toBe(did);
    expect((await byPasskey.spaces()).map((s) => s.name)).toContain('Mine');
    await byPasskey.close();
    const byWords = unlockAccount(dir, { id: WORDS, opening: openingFromWords(words) });
    expect(byWords.identity.did).toBe(did);
    await byWords.close();
  });

  it('comes to a new browser with its passkey alone: spaces, history, and a device key of its own', async () => {
    const { lena, storage, dir: storageDir, url, stop } = await world();
    try {
      const first = temp('first');
      const { node, words } = createAccount(first, 'Web', passkey(1));
      useStorage(storageLink(first, node, url, { invite: storage.invite() }));
      await node.goOnline();
      await node.joinSpace(await lena.invite('Climb'));
      await until(async () => (await texts(node)).includes('the rope is in the van'));
      await node.say({ space: 'Climb', text: 'from the first browser' });
      await until(async () => (await texts(lena)).includes('from the first browser'));
      const firstDevice = node.identity.did;
      const person = node.identity.author;
      // The box follows the space it joined.
      await until(async () => !!(await findBox(url, passkey(1).opening)) && (await findBox(url, passkey(1).opening))!.length > 500);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await node.close();

      // The operator holds the boxes, and they open nothing for it.
      const held = allText(storageDir);
      expect(held).not.toContain(words.split(' ').slice(0, 3).join(' '));

      await lena.say({ space: 'Climb', text: 'said while nobody was there' });

      const second = temp('second');
      expect(await findBox(url, passkey(9).opening)).toBeUndefined();
      const data = (await findBox(url, passkey(1).opening))!;
      await expect(arriveAccount(temp('wrong'), { id: 'x', opening: passkey(2).opening }, data)).rejects.toThrow("that doesn't open this account");
      const arrived = await arriveAccount(second, passkey(1), data);
      useStorage(storageLink(second, arrived, url));
      await arrived.goOnline();
      expect(arrived.identity.author).toBe(person);
      expect(arrived.identity.did).not.toBe(firstDevice);
      expect((await arrived.spaces()).map((s) => s.name)).toContain('Climb');
      await until(async () => {
        const seen = await texts(arrived);
        return seen.includes('from the first browser') && seen.includes('said while nobody was there');
      });

      // Its own key is taken for this person's, by the people in the space.
      await arrived.say({ space: 'Climb', text: 'from the second browser' });
      await until(async () => (await texts(lena)).includes('from the second browser'));
      expect((await lena.messages('Climb')).find((m) => m.text === 'from the second browser')?.by.did).toBe(person);
      expect(lena.replica.forks.size).toBe(0);
      await arrived.close();

      // It opens again here, with the same passkey, and the words are a way in here too.
      const again = unlockAccount(second, passkey(1));
      expect(again.identity.author).toBe(person);
      await again.close();
      expect(lockState(second).ways.sort()).toEqual(['passkey-1', WORDS].sort());
    } finally {
      await stop();
    }
  });

  it('joins a space long after it connected, with its session open all the while', async () => {
    const { lena, storage, url, stop } = await world();
    try {
      const dir = temp('later');
      const { node } = createAccount(dir, 'Web', passkey(1));
      useStorage(storageLink(dir, node, url, { invite: storage.invite() }));
      await node.goOnline();
      await until(async () => (await node.status()).peers === 1);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await node.joinSpace(await lena.invite('Climb'));
      await until(async () => (await texts(node)).includes('the rope is in the van'));
      await node.say({ space: 'Climb', text: 'joined late' });
      await until(async () => (await texts(lena)).includes('joined late'));
      await node.close();
    } finally {
      await stop();
    }
  });

  it('keeps pictures: the ones made here while the tab is closed, and brings others to it', async () => {
    const { lena, lenaSessions, storage, dir: storageDir, url, stop } = await world();
    const picture = (fill: number) => Buffer.alloc(40_000, fill).toString('base64');
    try {
      const dir = temp('pictures');
      const { node } = createAccount(dir, 'Web', passkey(1));
      useStorage(storageLink(dir, node, url, { invite: storage.invite() }));
      await node.goOnline();
      await node.joinSpace(await lena.invite('Climb'));
      await until(async () => (await texts(node)).length > 0);

      // From the other side: the node has it from nowhere, asks, and the browser gets it through it.
      const theirs = await lena.putBlob({ data: picture(1), type: 'image/png' });
      expect((await node.blob(theirs)).data).toBe(picture(1));

      // From here: it goes to the node as it's made, and stays there when the tab closes.
      const mine = await node.putBlob({ data: picture(2), type: 'image/png' });
      const hash = /^wblob:([^.]+)\./.exec(mine)![1];
      await until(() => allText(storageDir).length > 0 && readdirSync(join(storageDir, 'accounts')).some((f) => existsSync(join(storageDir, 'accounts', f, 'blobs', hash))));
      await node.close();
      await lena.blobs.fetch(hash, (hashes) => lenaSessions.forEach((session) => session.want(hashes)), 5_000);
      expect((await lena.blob(mine)).data).toBe(picture(2));

      // A file that lies at the node is sealed: its bytes say nothing.
      expect(allText(storageDir)).not.toContain(Buffer.alloc(100, 2).toString('latin1'));
    } finally {
      await stop();
    }
  });

  it('takes a second passkey, and lets one go', async () => {
    const { storage, url, stop } = await world();
    try {
      const dir = temp('ways');
      const { node } = createAccount(dir, 'Web', passkey(1));
      useStorage(storageLink(dir, node, url, { invite: storage.invite() }));
      await node.goOnline();
      await until(async () => (await node.status()).peers === 1);

      addWay(dir, node, passkey(2));
      handOnAgain();
      await until(async () => !!(await findBox(url, passkey(2).opening)));
      expect(lockState(dir).ways.sort()).toEqual(['passkey-1', 'passkey-2', WORDS].sort());

      expect(() => removeWay(dir, node, WORDS)).toThrow('always open');
      removeWay(dir, node, 'passkey-1');
      handOnAgain();
      await until(async () => !(await findBox(url, passkey(1).opening)));
      expect(await findBox(url, passkey(2).opening)).toBeDefined();
      await node.close();

      expect(() => unlockAccount(dir, passkey(1))).toThrow("that isn't a way into this account");
      const again = unlockAccount(dir, passkey(2));
      await again.close();
    } finally {
      await stop();
    }
  });

  it('comes to a new browser with the words, without any passkey', async () => {
    const { lena, storage, url, stop } = await world();
    try {
      const first = temp('words');
      const { node, words } = createAccount(first, 'Web');
      useStorage(storageLink(first, node, url, { invite: storage.invite() }));
      await node.goOnline();
      await node.joinSpace(await lena.invite('Climb'));
      await until(async () => (await texts(node)).length > 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const person = node.identity.author;
      await node.close();

      const way = { id: WORDS, opening: openingFromWords(words.toUpperCase().replaceAll(' ', '  ')) };
      const arrived = await arriveAccount(temp('words2'), way, (await findBox(url, way.opening))!);
      expect(arrived.identity.author).toBe(person);
      await arrived.close();
    } finally {
      await stop();
    }
  });

  it('comes to a browser with the words of an account made on a computer, from that computer through the storage node', async () => {
    const { lena, lenaWords, storage, url, stop } = await world();
    try {
      const dir = temp('fromdesk');
      // Her computer keeps its list of her spaces in her own space, as its daemon does.
      await lena.reconcile();
      // Nothing waits at the storage node for these words: this account never had a browser.
      expect(await findBox(url, openingFromWords(lenaWords))).toBeUndefined();
      const node = await recoverAccount(dir, lenaWords, { url, invite: storage.invite(), use: useStorage }, passkey(7), 15_000);
      expect(node.identity.author).toBe(lena.identity.author);
      expect(node.identity.did).not.toBe(lena.identity.did);
      // Her spaces come after, from her computer.
      await until(async () => (await node.reconcile(), (await texts(node).catch((): string[] => [])).includes('the rope is in the van')), 20_000);
      // And from now on a box: the next browser finds the account with the words, or with the passkey made here.
      await until(async () => !!(await findBox(url, passkey(7).opening)));
      expect(lockState(dir).ways).toEqual([WORDS, 'passkey-7']);
      await node.close();
    } finally {
      await stop();
    }
  });

  it('says so when none of the words\' devices can be reached, and leaves the browser empty', async () => {
    const { storage, url, stop } = await world();
    try {
      const dir = temp('nobody');
      const { words } = WeaveNode.create('Nobody', temp('nobodydesk'));
      await expect(recoverAccount(dir, words, { url, invite: storage.invite(), use: useStorage }, undefined, 2_000)).rejects.toThrow(/couldn't find your identity/);
      expect(lockState(dir).exists).toBe(false);
    } finally {
      await stop();
    }
  });
});
