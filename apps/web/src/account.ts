import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b64u, KEY_KINDS, newRecoveryWords, normalizeWords, randomBytes, type Json, type Sealed } from '@weave/core';
import { readSecretJson, resolveHome, saveSpace, useHomeKey, vaultOf, WeaveNode, writeSecretJson, loadSpaces, type BrowserHandover, type RecoveredKeys, type StoredSpace } from '@weave/node';
import { accountOf, accountRecord, handOnAgain, socketTo, StorageClient, type StorageLink } from './host/net.ts';
import { openBox, openHomeKey, openingFromWords, sealBox, sealHomeKey, type Opening } from './lock.ts';

/*
 * An account in a browser (docs/web-stage2.md, step 7). Nothing that opens anything lies open here:
 *
 *   lock.json     this browser's home key, sealed once per way in (a passkey, the words); not secret itself
 *   the home      sealed with that home key, as on a computer; the key is never written down open
 *   a box         at the storage node, per way in: the identity's current root and encryption keys, the keys of the
 *                 spaces, the identity's key events, what a new device needs. Sealed with the key of that way in, found
 *                 by its token.
 *
 * A new browser doesn't get this one's device key. Two devices signing with one key would sign different events with the
 * same number, which everyone takes for a stolen key. It makes its own and signs it with the root from the box.
 * The box holds today's keys, never the words: whoever gets a passkey has today's root and no more, and rotating with
 * the words, which stay on paper, shuts them out. (Boxes from before held the words; they're replaced as they go up.)
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
  /** The identity's current keys. None on a linked browser (linkAccount): it has a key one of the person's computers gave it, and no box. */
  keys?: KeptKeys;
  /** How boxes were before: the words themselves. Turned into keys when this browser next goes online. */
  words?: string;
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

type KeptKey = { did: string; publicKey: string; secretKey: string };
export interface KeptKeys {
  author: string;
  root: KeptKey;
  enc: KeptKey[];
}
const keptKey = (k: RecoveredKeys['root']): KeptKey => ({ did: k.did, publicKey: b64u.encode(k.publicKey), secretKey: b64u.encode(k.secretKey) });
const keyOf = (k: KeptKey) => ({ did: k.did as RecoveredKeys['author'], publicKey: b64u.decode(k.publicKey), secretKey: b64u.decode(k.secretKey) });
const keptKeys = (k: RecoveredKeys): KeptKeys => ({ author: k.author, root: keptKey(k.root), enc: k.enc.map(keptKey) });
export const keysOf = (k: KeptKeys): RecoveredKeys => ({ author: k.author as RecoveredKeys['author'], root: keyOf(k.root), enc: k.enc.map(keyOf) });

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
  writeSecretJson(home, keepingFile(dir), { keys: keptKeys(node.currentKeys(words)), account: null, ways: ways.map(wayOf) });
  lockHome(dir, homeKey, ways);
  return { node, words };
}

/**
 * A browser with nothing, and the words of an account made elsewhere (on a computer, so no box waits for it): the same
 * person from the words alone, as `weave restore` does. Its key events come from the person's other devices through the
 * storage node, so one of them has to be online; its spaces come after, as they reach this browser. It gets a box from
 * then on, so the next browser finds it with the words or a passkey.
 */
export async function recoverAccount(dir: string, words: string, link: { url: string; invite: string; status?: StorageLink['status']; use(link: StorageLink): void }, passkey?: WayIn, timeoutMs = 60_000): Promise<WeaveNode> {
  if (lockState(dir).exists) throw new Error('this browser has an account already');
  const clean = normalizeWords(words);
  const ways = [{ id: WORDS, opening: openingFromWords(clean) }, ...(passkey ? [passkey] : [])];
  const home = resolveHome(dir);
  const homeKey = randomBytes(32);
  useHomeKey(home, homeKey);
  writeSecretJson(home, keepingFile(dir), { account: null, ways: ways.map(wayOf) });
  let node: WeaveNode;
  try {
    node = await WeaveNode.restore(clean, dir, { online: true, timeoutMs, beforeOnline: (n) => link.use(storageLink(dir, n, link.url, { invite: link.invite, status: link.status })) });
  } catch (error) {
    // Nobody of theirs online, or the words don't fit: the browser stays empty, and it can be tried again.
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  // Its keys as they are now, for the boxes; with them, the boxes go up.
  writeSecretJson(home, keepingFile(dir), { ...keeping(dir, node), keys: keptKeys(node.currentKeys(clean)) });
  handOnAgain();
  lockHome(dir, homeKey, ways);
  return node;
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

/** Set up this browser from a box: the same person, with a device key of its own, signed by the root in the box. */
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
  // A box from before holds the words: the keys are made of them here, and only the keys are kept.
  const { words: old, ...kept } = box.keeping;
  let node: WeaveNode;
  try {
    node = old ? await WeaveNode.restore(old, dir, { events: box.events }) : await WeaveNode.restoreFromKeys(keysOf(kept.keys!), dir, { events: box.events });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  writeSecretJson(home, keepingFile(dir), { ...kept, ...(old ? { keys: keptKeys(node.currentKeys(old)) } : {}) } as unknown as Json);
  // The words open this browser too: their way in is kept (its key, not the words).
  const words = kept.ways.find((w) => w.id === WORDS);
  const ways = [...(words ? [{ id: WORDS, opening: openingOf(words) }] : []), ...(way.id === WORDS ? [] : [way])];
  lockHome(dir, homeKey, ways);
  return node;
}

/**
 * A browser linked to the person's computers (linkBrowser): their account here with the key one of them gave it, opened
 * by a passkey. No words come here, and no box goes to the storage node: another browser is linked on its own, so a
 * passkey here opens this browser, and whoever takes it has a key the person revokes on their computer.
 */
export async function linkAccount(dir: string, way: WayIn, handover: BrowserHandover): Promise<WeaveNode> {
  if (lockState(dir).exists) throw new Error('this browser has an account already');
  const home = resolveHome(dir);
  const homeKey = randomBytes(32);
  useHomeKey(home, homeKey);
  const node = await WeaveNode.fromBrowserLink(handover, dir);
  writeSecretJson(home, keepingFile(dir), { account: null, ways: [wayOf(way)] });
  lockHome(dir, homeKey, [way]);
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
  if (readLock(dir).filter((e) => e.id !== id).length === 0) throw new Error('that is the only way into this browser: add another passkey first');
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
      // From before: the words kept here become today's keys, and the boxes that held them are replaced below.
      const before = keeping(dir, node);
      if (before.words) {
        const { words, ...rest } = before;
        writeSecretJson(node.home, keepingFile(dir), { ...rest, keys: keptKeys(node.currentKeys(words)) } as unknown as Json);
      }
      const box = boxOf(dir, node);
      // A linked browser keeps no box: the next browser is linked by the person's computer too.
      if (box.keeping.keys) for (const way of box.keeping.ways.map(openingOf)) await client.putBox(way.token, sealBox(way, box as unknown as Json));
      for (const token of box.keeping.gone ?? []) await client.removeBox(b64u.decode(token));
      if (box.keeping.gone?.length) writeSecretJson(node.home, keepingFile(dir), { ...keeping(dir, node), gone: [] });
    },
  };
}
