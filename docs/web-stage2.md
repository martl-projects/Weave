# Weave Web, stage 2: the node in the browser, with a storage node

The plan in OVb4TP5x had two stages: first a hosted node per person, later a node in the browser. martl decided (6.11.2026) to go straight to the second, with fixed nodes taking the place keepers had: a browser's node holds the keys and reads, and a storage node the person chose holds their spaces without being able to read them.

## Why not keepers again

Keepers were taken out on 6.11.2026 (docs/v2-stage5.md) for three reasons, and a storage node answers each:

- Nobody agreed to what was on their disk: a storage node offers storage, and a person chooses it.
- A deletion couldn't reach a keeper who was offline: a storage node is always on.
- Copies of abandoned accounts stayed: a storage node knows its accounts, so a deletion and a time limit reach everything.

It isn't a friend's computer and it isn't chosen at random. Nothing in it is offered to, or taken from, friends.

## The shape

```
browser (a Worker)                 storage node (fixed, always on)             everyone else
keys, reading, signing   ──wss──▶  auth keys and topics, no keys      ◀──DHT──▶ peers
storage in OPFS                    sealed events, blobs, a quota
PeerSession2                       PeerSession2                                 PeerSession2
```

**The browser is not on the DHT.** It needs no relay: it speaks PeerSession2 to its storage node over a WebSocket, and the storage node is on the DHT. That takes `@hyperswarm/dht-relay` out of the plan.

**Blind holding (built, `HeldSpace.blind`).** Sync never needed a space's key, only what comes from it through a hash:

- `authKey(key)` proves the space to a peer (the tag is an HMAC under it);
- `topicOfKey(key)` is where the space's peers meet;
- the events travel sealed, and a Replica checks their signatures without opening them.

So a person hands their storage node one auth key and one topic per key of a space. With those it finds the peers, takes the events and passes them on, and can't open one. `packages/node/test/blindholder.test.ts`: it carries a space between two people who are never online together; it holds no plaintext; the auth key of another space gets it nothing.

**When a key rotates** while the tab is closed, the holder falls behind: it holds only the old auth key, so it gets no new events of that space until the person's browser comes back, takes the new key from a peer and hands on the new auth key. It is tested. That is the price of not holding the key: a space that rotated waits for one visit.

**What a storage node sees:** which account it serves, which spaces by id, the events' envelopes (who signed, when, how large, and the class of event) and how much is stored. Any member's device sees that much too, but here it is one operator and it knows the account. This goes in the privacy policy.

**What it can't do:** read a sealed event or sign one. Public events it can read, as anyone can. A person can leave it by telling it to delete, and the auth keys it held open nothing.

**What a browser still has to trust:** the JavaScript it is served. Whoever controls martl.io could serve code that reads the keys. Strict CSP, no third-party scripts and builds from release tags with published hashes make that checkable, not impossible.

## What is left

In order, each one usable and tested before the next:

1. **Blind holding:** done.
2. **PeerSession2 over a WebSocket:** done (`packages/net/src/wspeer.ts`, `@weave/net/browser`, `packages/node/test/wspeer.test.ts`). A session now needs only a `PeerStream`. TLS gives no handshake hash a page can read, so the two ends agree on one with fresh X25519 keys: whoever sits in between has a different hash on each side, and a tag seen on one connection is worth nothing on another. It authenticates nobody, and it isn't encryption: who may connect is step 3's, and privacy on the way is TLS's and the seals'. A long message goes as several frames, so the 1 MB limit of `websocket.ts` doesn't break images. Tested between a real server and a real client, not yet from a page in a browser.
3. **Storage node service:** the core is done (`packages/node/src/storagenode.ts`, the client in `packages/net/src/storageclient.ts`; `storagenode.test.ts`, and `storageswarm.test.ts` on a DHT testnet).
   - Accounts by invitation (one use, only a hash kept). An account's id is a key of its own, not the person's identity, so the node needn't know who it serves.
   - **No WebAuthn on the server.** A token only the person can make (from their passkey's PRF value, or their words) finds a sealed box with their keys, and the node keeps its hash. A passkey never talks to the node. Wrong tokens count against the connection.
   - Each account has its own log, its own Hyperswarm and a quota. Over it, it stops collecting; at twice it, a browser can't sync either. Deleting an account deletes a folder.
   - A rotated key or a new space reaches the node by a new `hold` on the next connection.
   - **Still to do before it is hosted:** images (blobs aren't held or passed on yet, so a browser sees no pictures); a program to run it (`StorageNode` is a class, `apps/server` doesn't start it yet); limits per address, an idle timeout and backpressure on the WebSocket, and the quadratic `Buffer.concat` from the review; whether a Hyperswarm per account holds up with many accounts (they may have to share one DHT).
4. **Stores for the browser:** the log is done, tried in a real page (`apps/web`, `npm run dev -w @weave/web`; the store in `apps/web/test/wasmdb.test.ts`). `SpaceStorage`, `SecretStorage` and `LogStore` are synchronous, and OPFS is synchronous only in a Worker, so the whole node runs in a Worker, and the page speaks the same `{id, method, args}` to it that it speaks over `/ws` today.
   - `SqlStore` (`packages/node/src/sqlstore.ts`) is the store without a file: `SqliteStore` puts it on node:sqlite, `apps/web/src/wasmdb.ts` on sqlite-wasm's SAH pool on OPFS, which needs no cross-origin isolation.
   - The page opens a space through a storage node, reads a message live, finds it again after a reload, and gets what was said while it was away. Not yet tried outside the app's Chromium: Safari and Firefox are open.
   - **One tab at a time:** the pool holds its files, and a second tab would fail. A Web Lock makes it wait, says so, and it takes over when the first tab goes. Tabs that work side by side are still to do.
   - **What it costs** (in the app's Chromium): opening about 3,700 events takes 19 ms, reading them 22 ms. A commit costs about 10 ms, and no PRAGMA changes that (journal modes, `synchronous = OFF`), so a sync takes each batch of 256 as one write (`Replica.batch`): 1.2 ms an event, signing included, instead of 12.
   - **Still to do:** `SpaceStorage` and `SecretStorage` (the account key lies open in the database for now, and the page hands the Worker the space: both go with step 7).
5. **The node in the browser:** done, differently than planned. There is no `WebNode`: the real `WeaveNode` runs in the Worker. It turned out to need little of a computer (15 file calls in `node.ts`, 1.6 MB bundled, before minifying), so a second composition root would only have copied its glue, and every change on main would have had to be made twice. `apps/web/build.ts` answers at the edges instead, from `apps/web/src/host/`:
   - `fs` is a table in the node's own database, so a home works as it is, sealed files included; `path`, `os`, `crypto` and `url` are small stand-ins, tested against what Node says.
   - `SwarmNode` (`host/net.ts`) has the storage node for a network: what the node joins, the storage node joins, by auth keys. A change goes over a second, short connection, since a connection that became a session takes no more requests. Someone else's meeting point isn't handed on, because a storage node announces where a node only looks.
   - `sqlitestore.ts` and `lock.ts` are swapped for the store on OPFS and the Web Lock.
   - Every other module of Node (processes, sockets) is its names, each saying it isn't there when called.
   - What a page may ask is `WEB_METHODS` (`apps/web/src/methods.ts`), one by one; it grows with the screens. The spike's list (22 refused on the everyday screens, 186 in all) is where that goes on.
   - Tried in a real page against a real `WeaveNode` on the other side of a storage node: joining by an invitation link, reading, writing (the other person reads it), members, the feed, a reload (66 ms), and what was said while the tab was away. `apps/web/test/swarm.test.ts` holds the connection's cases against a real storage node. The DHT is a stand-in in `apps/web/dev.ts`; `storageswarm.test.ts` covers that part on its own.
   - The price: the bundle holds code that can't run here (companies, payments, services). All of it is 0.8 MB gzipped, half of that SQLite, so size isn't the reason to cut. Nothing reaches it from a page that isn't on `WEB_METHODS`. If it matters, the swaps can cut whole modules later.
   - **Open:** images (step 3), and a storage node doesn't pass on a look-only topic, so finding a friend through their meeting point is untested and probably doesn't work yet.
6. **Hint services in the browser:** Unread and Spotlight are WebAssembly components that run in a worker thread today. Either they run in the page through the same transpiled code, or the counts wait. To be tried early, since counts are what issue jZO2 was about.
7. **Account and passkey:** words, keys and a passkey with PRF in the browser; the secrets in OPFS sealed under the PRF key, and a sealed copy at the storage node, so a synced passkey opens the account on a new device. This needs the PRF matrix of the spike. Without PRF: the recovery words each time.
8. **Web mode of the UI:** what isn't there is hidden, the onboarding screens, a PWA.
9. **Rooms:** a room's tunnel goes through the DHT, so a browser needs the storage node to carry it. Later.
10. **Deploy on martl.io:** Hetzner, Caddy, monitoring, and the law (privacy policy, terms, deletion on request).

## The PRF matrix (https://martl.io/prf.html)

| Browser and provider | PRF at create | PRF at sign-in | Same again, unwraps | Across devices |
|---|---|---|---|---|
| Safari on iPhone (iOS 18.7), iCloud Keychain | yes, with a value | yes | same secret across a reload of the page | not tried yet |

Safari doesn't answer `getClientCapabilities()` for PRF ("not said") and PRF works there all the same: an account has to try it, not ask first.

## What a new device gets

The passkey opens the sealed secrets at the storage node, the browser syncs from it over one connection, and it reads. No friend has to be online. A browser that evicted its storage gets the same.

## Open

- Is a storage node for one person's spaces also open to a person's own server (a Weave Server they run)? The design allows it; martl.io comes first.
- Sealed envelopes show who signed and when. Whether that's fine for an operator holding many accounts is for the privacy policy, and it may want padding later.
- Quota and price per account.
- Push: the storage node knows something arrived, so a Web Push saying only "there's something new" is possible.
