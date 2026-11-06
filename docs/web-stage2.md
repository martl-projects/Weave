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
2. **PeerSession2 over a WebSocket.** It uses only `on`, `write` and `destroy` of its stream, plus a handshake hash and a role, so a small adapter is enough, without `node:stream` in the browser. Open: the handshake hash. TLS gives none that a page can read, so the two ends need a small Noise or key-agreement step of their own: without it a tag could be replayed on another connection.
3. **Storage node service:** accounts, sign-in by a key of the person's, a quota per account, blind spaces per account, joining their topics, deleting everything on request. It runs on the DHT like any node. Accounts stay apart in one process, since it holds nothing that opens anything; to be checked under load.
4. **Stores for the browser.** `SpaceStorage`, `SecretStorage` and `LogStore` are synchronous, and OPFS is synchronous only in a Worker, so the whole node runs in a Worker: sqlite-wasm on OPFS for the log, and the bridge speaks the same `{id, method, args}` to the Worker that it speaks over `/ws` today.
5. **A browser's composition root.** The largest piece. `kernel.ts`, `membership.ts`, `content.ts` and `people.ts` bundle for a browser, but `WeaveNode` itself (3,888 lines) imports `node:fs`, `node:os` and `node:crypto`, and so do `holding.ts`, `retention.ts`, `services.ts` and `sessions.ts`. A `WebNode` wires the modules that bundle to the browser's ports, and what it doesn't wire is what Weave Web doesn't do. The methods it answers are `WEB_METHODS`; the spike's list (22 refused on the everyday screens, 186 in all) is where that starts.
6. **Hint services in the browser:** Unread and Spotlight are WebAssembly components that run in a worker thread today. Either they run in the page through the same transpiled code, or the counts wait. To be tried early, since counts are what issue jZO2 was about.
7. **Account and passkey:** words, keys and a passkey with PRF in the browser; the secrets in OPFS sealed under the PRF key, and a sealed copy at the storage node, so a synced passkey opens the account on a new device. This needs the PRF matrix of the spike. Without PRF: the recovery words each time.
8. **Web mode of the UI:** what isn't there is hidden, the onboarding screens, a PWA.
9. **Rooms:** a room's tunnel goes through the DHT, so a browser needs the storage node to carry it. Later.
10. **Deploy on martl.io:** Hetzner, Caddy, monitoring, and the law (privacy policy, terms, deletion on request).

## The PRF matrix (https://martl.io/prf.html)

| Browser and provider | PRF at create | PRF at sign-in | Same again, unwraps | Across devices |
|---|---|---|---|---|
| Safari on iPhone (iOS 18.7), iCloud Keychain | yes, with a value | yes | not tried yet | not tried yet |

Safari doesn't answer `getClientCapabilities()` for PRF ("not said") and PRF works there all the same: an account has to try it, not ask first.

## What a new device gets

The passkey opens the sealed secrets at the storage node, the browser syncs from it over one connection, and it reads. No friend has to be online. A browser that evicted its storage gets the same.

## Open

- Is a storage node for one person's spaces also open to a person's own server (a Weave Server they run)? The design allows it; martl.io comes first.
- Sealed envelopes show who signed and when. Whether that's fine for an operator holding many accounts is for the privacy policy, and it may want padding later.
- Quota and price per account.
- Push: the storage node knows something arrived, so a Web Push saying only "there's something new" is possible.
