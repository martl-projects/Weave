# v2 stage 1: the v2 wire format, members-only sync, migration (v0.4)

The breaking release. Built on stage 0 (docs/v2-stage0.md). Spec: "Scaling: the v2 wire format", changes 1–5, 14; Work board item "v2 stage 1".

After it:
- events are v2 (control chained per signer and space; content standalone over a body hash);
- a space's events go only to peers that prove, on this very connection, that they hold its key: no flooding, no envelopes for outsiders, no handshake listing every key;
- meeting points in the DHT rotate with a space's key epoch;
- every node has re-signed its own history once; references to old ids keep working.

## Decisions

### 1. A per-signer counter for revocation (`n`)

v1 revokes a stolen key "after seq N": the chain means a thief can't put events into the past. v2 content has no chain, so a thief could sign backdated posts. The spec doesn't say how revocation works then.

**Decision:** every v2 event (control and content) carries `n`, a counter per signing key across all spaces, counting up by one, **continuing the key's v1 numbering**: re-signed events keep their v1 seq as their `n`, new ones go on from the highest. So one number space per key covers both versions, and the existing `weave.revoke {subject, afterSeq}` keeps its meaning for v1 and v2 events alike (Authority compares a record's number with the cutoff and needs no change). Two different events of one key with the same number are equivocation, and the key is marked forked, as v1 does with seq; a v2 event whose `was` is the v1 event with that number is the same event, not a fork.

What's left: a thief who also knows which numbers were used could fill a number whose original event everyone has forgotten. Forgetting is a stage-3 feature, the window is narrow (only numbers below the cutoff that no node still holds), and the person sees the forged event signed by their revoked key. Documented as a known limit.

Changes to the stage-0 format: `n` on both classes; `was` allowed on control events too (a project's create event is also its post, and gets upvoted by id).

### 2. Records: one shape for v1 and v2 events inside the node

`replica.events()` today returns signed v1 events, and node code reads `kind`, `author`, `signer`, `time`, `scope`, `body`, `seq` from them. v2 introduces a **record**:

```ts
interface WeaveRecord {
  id: string;          // canonical id (below)
  v: 1 | 2;
  author: Did; signer: Did;
  kind: string; time: string;
  scope: string;       // v2: its `space`
  seq: number;         // v1: seq; v2: n
  body: Json;          // v2 content: the body itself (resolved), or null when missing
  missing?: true;      // a content event whose body isn't here
  wire: WeaveEvent | { event: EventV2; body?: Json };   // what travels and is verified
}
```

Node code keeps reading the same field names. `replica.ingest()` accepts a record or a wire item, so the tests' sync helper (`events().forEach(e => to.ingest(e))`) keeps working.

### 3. Canonical ids

- New v2 events: `eventIdV2`.
- Re-signed events: **their old v1 id** (`was`), so `weave:post:` links, upvotes, edits, replies, claims and votes that point at it keep working, from frozen v1 events too.
- Where a v1 event and its v2 re-signing are both present, the v2 one counts and the v1 one is hidden.

### 4. Wire

An item is `{e: EventV2, b?: Json}`: the event, and for content the body if the sender has it. The body is checked against `e.body` (its hash); a wrong body is dropped and the event kept as missing.

## Storage

```sql
CREATE TABLE events2 (
  id     TEXT PRIMARY KEY,   -- canonical id
  v2id   TEXT UNIQUE NOT NULL,
  class  TEXT NOT NULL,      -- control | content
  author TEXT NOT NULL, signer TEXT NOT NULL,
  space  TEXT NOT NULL,
  n      INTEGER NOT NULL,   -- per signer
  seq    INTEGER,            -- control: per (signer, space)
  time   TEXT NOT NULL, kind TEXT NOT NULL,
  json   TEXT NOT NULL,
  UNIQUE (signer, n)
);
CREATE INDEX events2_space ON events2 (space, time);
CREATE UNIQUE INDEX events2_chain ON events2 (signer, space, seq) WHERE seq IS NOT NULL;
CREATE TABLE bodies (hash TEXT PRIMARY KEY, json TEXT NOT NULL);
```

The v1 `events` table stays: the identity foundation (identity, rotate, root delegations: they need the root key, which isn't on disk) and frozen history of people who haven't upgraded.

## Replica

- v2 ingest: well-formed, signature, body against hash (if given), equivocation on `(signer, n)`, control chain per `(signer, space)` with pending on gaps and fork on conflict, authority check (see below), store, notify.
- v1 ingest stays for the identity foundation and for frozen history.
- `events(filter)` returns records of both, in the same order as today (time, signer, then seq/n).
- `append(identity, fields)` signs v2: the class from the kind, or `fields.class` for sealed events (sealFor sets it from the inner kind); control events chain to the signer's head in that space; `n` is the signer's next.

## Authority

- Takes key events from both: v1 (foundation) and v2 control events in `public` (device and agent delegation, revocation).
- `revoke {afterSeq}` covers both: v1 seq and v2 `n` are one number space per key.
- `check(record)` works on records, comparing the record's number (seq or n).

## Sync protocol v2 (`session2.ts`)

1. **Hello:** `{t: 'hello', v: 2, tags: [...]}`. A tag per space this node holds: `HMAC(authKey(space), handshakeHash)`, where `authKey` is derived from the space's current epoch key (and the previous one, so a member who hasn't got the new key yet still meets the others). The handshake hash is unique to this connection and known only to its two ends, so a tag can't be replayed elsewhere and tells an outsider nothing.
2. **Shared spaces:** each side computes the tags of its own spaces and intersects. `public` is always shared; `self` only between devices of the same person; a direct chat only between its two people (its key is their pair key).
3. **Per shared space:**
   - control: `{t: 'heads', space, heads: {signer: seq}}` → send what the other lacks;
   - content: `{t: 'have', space, since, ids}` for the recent window (default 7 days) → `{t: 'want', ids}` → `{t: 'items', items}`;
   - older content and missing bodies on request (`want` with ids or body hashes).
4. **Live:** a new event goes to every connected peer that shares its space, and is relayed onward only within that space.
5. **v1 peers:** a v0.3 node sends `heads` first. v0.4 answers in v1, send-only: it pushes its frozen v1 log, which ends with the farewell message (below), and takes nothing.

Messages are line-delimited JSON as today, capped per frame.

## Meeting points

A space's DHT topic becomes `H("weave/rendezvous/v2" ‖ key(epoch))` for its current epoch and the previous one. Removed members can't find a space's peers after a rekey. A person's own topic (their did) stays, for contacts and followers; `public` sync happens on any connection.

## Migration (first start of v0.4)

1. **Backup:** copy the home to `~/.weave-backup-v0.3` (next free name if it exists).
2. **Re-sign:** for every key on this computer (device and agents), walk its v1 log in order:
   - identity, rotate and root-signed delegations stay v1 (the foundation);
   - everything else is re-signed as v2 with its original time, `was` = its v1 id, and `n` in order. Sealed events keep their sealed body; the class comes from the inner kind where this node can open it, else content.
3. **Farewell:** one v1 chat message per shared group or project: "I've moved to Weave 0.4. Please update: <release link>". It goes to v0.3 peers through the send-only v1 session.
4. Mark `meta.migrated`. A migration that stops halfway starts again from the backup's logs (it writes only `events2`, `bodies` and the marker, in one transaction).

## Tests

- Format: `n`, `was` on control; equivocation across versions; revocation by `afterSeq` on v2 events.
- Replica: v2 ingest (chain, pending, fork, missing bodies, wrong bodies), records of both versions in order.
- Session v2: tags (shared, not shared, replay on another connection fails), members-only (an outsider connected to both gets nothing of the space), heads, recent window, live relay inside the space only, v1 peer gets the farewell.
- Migration: a v0.3 home re-signs into v2 with the same views (posts, members, chats, votes, upvotes by old ids), its backup exists, a second start does nothing.
- All existing node tests run on v2.
- Two homes over a real DHT testnet: v0.4 ↔ v0.4 syncs; v0.3 ↔ v0.4 delivers the farewell.

## Order of work

1. Format additions (`n`, `was` on control); storage tables; replica v2 ingest and records.
2. Authority on records (one number space per key, `afterSeq` as is).
3. Node writes v2 (append, sealFor with class), decodes both, canonical ids.
4. Session v2 with tags; swarm uses it; v1 send-only.
5. Rotating meeting points.
6. Migration, backup, farewell.
7. End-to-end over a testnet; release v0.4 with a release post and a "please update" note.
