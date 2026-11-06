import { b64u, createIdentity, KIND_MSG, openIn, Replica, spaceScope, spaceTopics, type Did, type SigningIdentity, type SpaceKeys } from '@weave/core';
import { authKey, StorageClient, type TextSocket } from '@weave/net/browser';
import { SqlStore } from '@weave/node/web';
import { openWasmDatabase } from './wasmdb.ts';

/*
 * The node in a Worker (docs/web-stage2.md, steps 4 and 5). So far the first cut through it: a store on OPFS, a sync with
 * the storage node over a WebSocket, and reading a space. It speaks {id, method, args} to the page, as /ws does.
 * The account key lies in the database as it is, and the space comes from the page: both are for step 7.
 */

declare const self: { onmessage: ((event: { data: Call }) => void) | null; postMessage(message: unknown): void };

interface Call {
  id: number;
  method: string;
  args: unknown[];
}

function socketTo(url: string): Promise<TextSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('error', () => reject(new Error(`no connection to ${url}`)));
    ws.addEventListener('open', () =>
      resolve({
        send: (text) => ws.send(text),
        close: () => ws.close(),
        onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
        onClose: (handle) => ws.addEventListener('close', () => handle()),
      }),
    );
  });
}

let store: SqlStore | undefined;
let replica: Replica | undefined;
let space: SpaceKeys | undefined;

function account(): { identity: SigningIdentity; fresh: boolean } {
  const kept = store!.meta('account');
  if (kept) {
    const { did, publicKey, secretKey } = JSON.parse(kept) as { did: Did; publicKey: string; secretKey: string };
    return { identity: { author: did, did, keys: { publicKey: b64u.decode(publicKey), secretKey: b64u.decode(secretKey) } }, fresh: false };
  }
  const identity = createIdentity();
  store!.setMeta('account', JSON.stringify({ did: identity.did, publicKey: b64u.encode(identity.keys.publicKey), secretKey: b64u.encode(identity.keys.secretKey) }));
  return { identity, fresh: true };
}

const epochs = (s: SpaceKeys) => Object.keys(s.keys).map(Number).sort((a, b) => b - a);

const methods: Record<string, (...args: never[]) => unknown> = {
  /** A tab's turn: the files of the database open for one tab at a time. Answers when it is this tab's. */
  async open() {
    const turn = new Promise<void>((resolve) => void navigator.locks.request('weave-node', () => (resolve(), new Promise(() => {}))));
    const waiting = await navigator.locks.query();
    if (waiting.held?.some((lock) => lock.name === 'weave-node') && waiting.pending?.some((lock) => lock.name === 'weave-node')) self.postMessage({ event: 'waiting' });
    await turn;
    const started = performance.now();
    store = new SqlStore(await openWasmDatabase('weave.db'));
    replica = new Replica(store);
    return { ms: Math.round(performance.now() - started), events: store.all2().length };
  },

  async connect(url: string, invite: string, keys: SpaceKeys) {
    space = keys;
    const client = await StorageClient.connect(await socketTo(url));
    const { identity, fresh } = account();
    if (fresh) await client.register(identity, invite);
    else await client.signIn(identity);
    const secrets = epochs(keys).map((epoch) => b64u.decode(keys.keys[String(epoch)]));
    await client.hold([{ space: spaceScope(keys), auths: secrets.map(authKey), topics: spaceTopics(keys) }]);
    await client.sync(replica!, { spaces: () => [{ space: spaceScope(keys), keys: secrets }] });
    return { fresh };
  },

  messages() {
    const scope = space && spaceScope(space);
    const records = replica!.events((r) => r.scope === scope);
    const texts = records.flatMap((record) => {
      const inner = openIn(space!, record);
      return inner?.kind === KIND_MSG ? [(inner.body as { text?: string }).text ?? ''] : [];
    });
    return { events: records.length, texts };
  },
};

self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    self.postMessage({ id, result: await (methods[method] as (...a: unknown[]) => unknown)(...args) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) });
  }
};
