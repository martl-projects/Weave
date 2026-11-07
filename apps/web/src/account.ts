import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b64u, KEY_KINDS, newRecoveryWords, randomBytes, type Json, type Sealed } from '@weave/core';
import { readSecretJson, resolveHome, saveSpace, useHomeKey, vaultOf, WeaveNode, writeSecretJson, loadSpaces, type StoredSpace } from '@weave/node';
import { accountOf, accountRecord, socketTo, StorageClient, type StorageLink } from './host/net.ts';
import { openBox, openHomeKey, openingFromWords, sealBox, sealHomeKey, type Opening } from './lock.ts';

/*
 * An account in a browser (docs/web-stage2.md, step 7). Nothing that opens anything lies open here:
 *
 *   lock.json     this browser's home key, sealed once per way in (a passkey, the words); not secret itself
 *   the home      sealed with that home key, as on a computer; the key is never written down open
 *   a box         at the storage node, per way in: the words, the keys of the spaces, the identity's key events, what
 *                 a new device needs. Sealed with the key of that way in, found by its token.
 *
 * A new browser doesn't get this one's device key. Two devices signing with one key would sign different events with the
 * same number, which everyone takes for a stolen key. It makes its own, from the words, as `weave restore` does.
 * That's why the box holds the words, and why a passkey here is worth as much as the words themselves.
 */

/** A way in: a passkey (by its credential id) or, without one, the words. */
export interface WayIn {
  id: string;
  opening: Opening;
}

interface LockEntry {
  id: string;
  home: Sealed;
}

/** What's kept sealed in the home so the boxes can follow the spaces. */
interface Keeping {
  words: string;
  account: ReturnType<typeof accountRecord>;
  ways: Array<{ id: string; key: string; token: string }>;
  /** Tokens of boxes to take away from the storage node. */
  gone?: string[];
}

interface Box {
  v: 1;
  keeping: Keeping;
  spaces: StoredSpace[];
  events: unknown[];
}

export const WORDS = 'words';

const lockFile = (dir: string) => join(dir, 'lock.json');
const keepingFile = (dir: string) => join(dir, 'keeping.json');

const readLock = (dir: string): LockEntry[] => (existsSync(lockFile(dir)) ? (JSON.parse(readFileSync(lockFile(dir), 'utf8') as string) as LockEntry[]) : []);

function writeLock(dir: string, entries: LockEntry[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(lockFile(dir), JSON.stringify(entries));
}

/** Whether this browser has an account, and the ways into it: what a page can know before anything is open. */
export const lockState = (dir: string): { exists: boolean; ways: string[] } => {
  const ways = readLock(dir).map((e) => e.id);
  return { exists: ways.length > 0, ways };
};

const wayOf = (way: WayIn) => ({ id: way.id, key: b64u.encode(way.opening.key), token: b64u.encode(way.opening.token) });
const openingOf = (way: { key: string; token: string }): Opening => ({ key: b64u.decode(way.key), token: b64u.decode(way.token) });

function lockHome(dir: string, homeKey: Uint8Array, ways: WayIn[]): void {
  writeLock(dir, ways.map((way) => ({ id: way.id, home: sealHomeKey(way.opening, homeKey) })));
}

/** A new person. `words` go to them once; the words are also a way in, and with no passkey the only one. */
export function createAccount(dir: string, name: string, passkey?: WayIn): { node: WeaveNode; words: string } {
  if (lockState(dir).exists) throw new Error('this browser has an account already');
  const words = newRecoveryWords();
  const ways = [{ id: WORDS, opening: openingFromWords(words) }, ...(passkey ? [passkey] : [])];
  const home = resolveHome(dir);
  const homeKey = randomBytes(32);
  useHomeKey(home, homeKey);
  const { node } = WeaveNode.create(name, dir, { words });
  // The account at the storage node is made when it first connects; it has no key before that.
  writeSecretJson(home, keepingFile(dir), { words, account: null, ways: ways.map(wayOf) });
  lockHome(dir, homeKey, ways);
  return { node, words };
}

/** Open this browser's account. A way in that isn't one of this account's says so, and nothing has changed. */
export function unlockAccount(dir: string, way: WayIn): WeaveNode {
  const entries = readLock(dir);
  const entry = entries.find((e) => e.id === way.id);
  if (!entry) throw new Error("that isn't a way into this account");
  let homeKey: Uint8Array;
  try {
    homeKey = openHomeKey(way.opening, entry.home);
  } catch {
    throw new Error("that doesn't open this account");
  }
  useHomeKey(resolveHome(dir), homeKey);
  return WeaveNode.open(dir);
}

/** A browser with nothing: what the storage node keeps for this way in, or nothing if it keeps none. */
export async function findBox(url: string, opening: Opening): Promise<string | undefined> {
  const client = await StorageClient.connect(await socketTo(url));
  try {
    return await client.open(opening.token);
  } finally {
    client.close();
  }
}

/** Set up this browser from a box: the same person, with a device key of its own. */
export async function arriveAccount(dir: string, way: WayIn, data: string): Promise<WeaveNode> {
  if (lockState(dir).exists) throw new Error('this browser has an account already');
  let box: Box;
  try {
    box = openBox<Box>(way.opening, data);
  } catch {
    throw new Error("that doesn't open this account");
  }
  const home = resolveHome(dir);
  const homeKey = randomBytes(32);
  useHomeKey(home, homeKey);
  for (const space of box.spaces) saveSpace(home, space);
  writeSecretJson(home, keepingFile(dir), box.keeping as unknown as Json);
  const node = await WeaveNode.restore(box.keeping.words, dir, { events: box.events });
  const ways = [{ id: WORDS, opening: openingFromWords(box.keeping.words) }, ...(way.id === WORDS ? [] : [way])];
  lockHome(dir, homeKey, ways);
  return node;
}

const keeping = (dir: string, node: WeaveNode) => readSecretJson<Keeping>(node.home, keepingFile(dir))!;

/** Another way in, for an account that's open. Its box goes to the storage node with the next list. */
export function addWay(dir: string, node: WeaveNode, way: WayIn): void {
  const entries = readLock(dir);
  if (entries.some((e) => e.id === way.id)) return;
  writeLock(dir, [...entries, { id: way.id, home: sealHomeKey(way.opening, vaultOf(node.home).key) }]);
  const kept = keeping(dir, node);
  writeSecretJson(node.home, keepingFile(dir), { ...kept, ways: [...kept.ways, wayOf(way)] });
}

/** A way in no more: here, and on a new browser, once its box is gone from the storage node. The words stay: nothing else is sure to be there. */
export function removeWay(dir: string, node: WeaveNode, id: string): void {
  if (id === WORDS) throw new Error('your recovery words always open your account');
  writeLock(dir, readLock(dir).filter((e) => e.id !== id));
  const kept = keeping(dir, node);
  const leaving = kept.ways.filter((w) => w.id === id).map((w) => w.token);
  writeSecretJson(node.home, keepingFile(dir), { ...kept, ways: kept.ways.filter((w) => w.id !== id), gone: [...(kept.gone ?? []), ...leaving] });
}

/** What a new device needs, as it stands now. */
function boxOf(dir: string, node: WeaveNode): Box {
  const me = node.identity.author;
  const events = node.replica.events((r) => r.author === me && KEY_KINDS.has(r.kind)).map((r) => r.wire);
  return { v: 1, keeping: keeping(dir, node), spaces: loadSpaces(node.home), events };
}

/** The storage node this account goes online through, with its account there and its boxes kept up. */
export function storageLink(dir: string, node: WeaveNode, url: string, options: { invite?: string; status?: StorageLink['status'] } = {}): StorageLink {
  return {
    url,
    invite: options.invite,
    status: options.status,
    account: () => {
      const { account } = keeping(dir, node);
      return account ? accountOf(account) : undefined;
    },
    keepAccount: (account) => writeSecretJson(node.home, keepingFile(dir), { ...keeping(dir, node), account: accountRecord(account) }),
    afterHold: async (client) => {
      const box = boxOf(dir, node);
      for (const way of box.keeping.ways.map(openingOf)) await client.putBox(way.token, sealBox(way, box as unknown as Json));
      for (const token of box.keeping.gone ?? []) await client.removeBox(b64u.decode(token));
      if (box.keeping.gone?.length) writeSecretJson(node.home, keepingFile(dir), { ...keeping(dir, node), gone: [] });
    },
  };
}
