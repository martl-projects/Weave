# v2 stage 0: storage, indexes and the v2 event format

Part of the v2 plan (spec: "Scaling: the v2 wire format", changes 1–19; Work board item "v2 stage 0").
Stage 0 changes Weave's insides and nothing anyone else sees: no wire change, no break with v0.3 peers.
It can ship as a normal update. Stage 1 (v0.4) then switches the wire to the v2 format defined here.

## Why

Measured in the code today (see "Where it costs" below):

- Every log is loaded into memory at start (`FileStore`, one JSONL per signer).
- After **every** appended event the decoded view (`#decoded`) is thrown away and rebuilt: a full scan of all logs, `authority.check` on each, a full sort, and every sealed event decrypted again.
- `#state(space)` and `#entries(space)` are not cached and run several times per API call; each pass re-hashes the id of every entry.
- `nameOf(person)` scans every signer's whole log, per call. `feed()` calls it per item: O(N²).
- `resolve`, `#allPosts`, `post(ref)`, `#noticeFor` and friends re-fold everything.

That is fine for three people and a few hundred events; it is what breaks at "hundreds of thousands of events per node" in the spec's table. Stage 1 also needs a store that can hold events per space, bodies apart from events, and missing bodies.

## Goals

1. **SQLite store** (`node:sqlite`, built into Node 24 and Electron's Node 24, no native module): events indexed by id, signer and seq, space, kind and time. Nothing has to be held in memory as a whole.
2. **Incremental decoding:** decrypt each event once; on a new event, decode just that one. Rebuild only when keys change in a way that can turn unreadable events readable (new space or board key) or valid events invalid (revocation, rotation).
3. **Cached views per space:** `#state`, `#entries` and the folds on top keyed by a per-space revision; event ids computed once and stored.
4. **Person index:** latest name, theme and public projects per person, kept up to date as events arrive (replaces `#eventsOf` scans).
5. **The v2 event format in `@weave/core`**, specified, signed, verified and tested, but not used on the wire yet.
6. **Same behaviour:** all 166 tests pass unchanged (apart from tests that construct a `FileStore`), plus new ones for the store and the format.

Not in stage 0: sync changes, members-only sync, re-signing history, body separation on the wire (all stage 1).

## 1. Store

### Schema

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);           -- schema version, import marker
CREATE TABLE events (
  id     TEXT PRIMARY KEY,          -- eventId (b64u sha256), computed once at insert
  signer TEXT NOT NULL,
  seq    INTEGER NOT NULL,
  author TEXT NOT NULL,
  time   TEXT NOT NULL,
  kind   TEXT NOT NULL,             -- outer kind (weave.sealed for sealed events)
  scope  TEXT NOT NULL,             -- public | self | <kind>:<space id>
  v      INTEGER NOT NULL,          -- 1 now; 2 from stage 1
  json   TEXT NOT NULL,             -- the signed event as received
  UNIQUE (signer, seq)
);
CREATE INDEX events_scope ON events (scope, time);
CREATE INDEX events_time  ON events (time, signer, seq);
CREATE INDEX events_kind  ON events (kind);
-- stage 1 adds: bodies (hash PRIMARY KEY, data BLOB, dropped INTEGER) and per-space control chains
```

- **WAL mode**, `synchronous = NORMAL`: an append is one `INSERT`, safe against crashes, and fast.
- `<home>/weave.db`. The home lock (`node.lock`) already guarantees one writer.

### `SqliteStore implements LogStore`

The `LogStore` interface stays (`head`, `get`, `range`, `append`, `signers`); `node:sqlite` is synchronous like it. Heads are cached in memory (one number per signer). `MemoryStore` stays for tests and `core`.

### Migration from JSONL

On first open with an empty database and existing `logs/*.jsonl`:

1. import every file in one transaction, in seq order per signer (stopping at a torn line, as `FileStore` does today);
2. compare counts per signer with the files; on any mismatch roll back and keep running on JSONL (and say so in the log);
3. on success set `meta.imported`, and rename `logs/` to `logs.v1-imported/` (kept, never deleted by Weave).

A `weave export --jsonl <dir>` writes the logs back out, for backups and for rolling back to an older Weave.

## 2. Replica

- `events(filter)` keeps its signature and order, but reads `ORDER BY time, signer, seq` from SQLite instead of sorting in memory.
- New `eventsSince(cursor)` and `eventsIn(scope)` for the decode layer.
- Ingest, the pending pool, fork detection and authority are unchanged.

## 3. Decode layer

A `DecodedIndex` in the node replaces the `#decoded` array:

| Holds | Updated |
|---|---|
| `byId: Map<id, Decoded>` (id stored, never re-hashed) | on every accepted event: decode just that event |
| `bySpace: Map<spaceId, Decoded[]>` in replica order | append (events arrive mostly in order; out-of-order inserts by binary search on (time, signer, seq)) |
| `unreadable: Map<spaceId, Set<id>>` | events whose space or board key we don't have yet |
| `revision: Map<spaceId, number>`, `globalRevision` | bumped on any change in that space / any key event |

**Full rebuild** only when: a key event arrives (`weave.delegate`, `revoke`, `identity`, `rotate`), or `#saveEncryption`, `rotateRoot`, `revokeKey`, `leave`. These are rare.
**Partial retry:** when a space or board key arrives (`#takeKeys`, `#takeBoardKeys`, join), only that space's `unreadable` events are decoded again.

## 4. Cached views

- `#state(space)` and `#entries(space)` memoized on `(space revision, global revision)`.
- The folds (`postsOf`, `issuesOf`, `proposalsOf`, `accessOf`, `roomsOf`, …) memoized the same way per space and per call shape.
- `#allPosts`, `post(ref)`: a `postIndex` (id and 8-char prefix → space) kept with the decode layer, so a lookup reads one space instead of all.

## 5. Person index

`PersonIndex`, fed by the decode layer: per person the latest profile name, theme, public projects and tier offers, from their public events. `nameOf`, `themeOf`, `publicProjectsOf`, `#tierOffers` read it. `feed()` becomes O(N).

## 6. The v2 event format (core only, wired in stage 1)

```ts
interface ControlEventV2 {        // chained per (signer, space): members, roles, keys, rules, identity, delegation
  v: 2; class: 'control';
  author: Did; signer: Did; space: string;     // 'public' | 'self' | '<kind>:<id>'
  seq: number; prev: string | null;            // within (signer, space)
  time: string; kind: string; body: Json; sig: string;
}
interface ContentEventV2 {        // standalone: posts, chat, votes, reactions, edits
  v: 2; class: 'content';
  author: Did; signer: Did; space: string;
  time: string; kind: string;                  // sealed spaces: 'weave.sealed', the inner kind is inside the body
  body: string;                                // hash of the body (b64u sha256 of its canonical JSON)
  was?: string;                                // the v1 id this event re-signs (stage 1 migration)
  sig: string;
}
```

- Signed as `'weave/event/v2\n' + canonicalJson(unsigned)`; the id is the hash of the signed event, as today.
- A content event's body travels and is stored apart (`bodies` table in stage 1) and may be missing; the event stays valid and verifiable without it.
- Which kinds are control and which are content is a fixed table in `core`, checked on ingest.
- v1 identity events (`weave.identity`, `weave.rotate`, root delegations) stay accepted forever as the foundation of identity (they need the root key, which isn't on disk).

Stage 0 ships: types, `signEventV2`, `verifyEventV2`, `eventIdV2`, `bodyHash`, `isWellFormedV2`, the kind table, and test vectors.

## Where it costs, before and after (to measure)

A benchmark script (`scripts/bench.ts`) builds a home with 1k, 10k and 100k events across a few projects, communities and direct chats, and times: start-up, `feed()`, `posts()` of a busy project, `post(ref)`, an append with an open view, and memory. Run before and after; the numbers go in the Work item.

### Measured (stage 0 done)

`node --expose-gc scripts/bench.ts run <dir>` on a home of three people with 10,014 events (1,548 posts, the rest chat and upvotes), v0.3.2 against v2 stage 0, same history:

| | v0.3.2 | v2 stage 0 |
|---|---|---|
| feed (50 items), again | 5,669 ms | 155 ms |
| posts of the busy project | 1,036 ms | 24 ms |
| one post by id | 2,109 ms | 40 ms |
| write a message, then read posts | 1,396 ms | 67 ms |
| members | 87 ms | 1.7 ms |
| open | 27 ms | 39 ms (first open imports the logs once: 271 ms) |
| heap after these reads | 21 MB | 24 MB |

What's left on the write path is folding a space's entries and posts again after each event in it; that becomes incremental with the per-space storage of stage 1 and the member-held content of stage 4.

## Tests

- **Store equivalence:** the same random sequence of appends into `MemoryStore` and `SqliteStore` gives identical `head`, `get`, `range`, `signers`.
- **Migration:** JSONL homes (including a torn last line) import exactly; a failing import rolls back and leaves JSONL in use; `weave export --jsonl` round-trips.
- **Decode layer:** incremental results equal a full rebuild after each step of a scripted history (joins, key arrivals, revocations, board keys, removals).
- **v2 format:** sign/verify, tampering, ids, body hash, missing body, the kind table.
- **All existing tests** unchanged; the tests that construct a `FileStore` move to `SqliteStore`.

## Order of work (each a commit, tests green)

1. v2 event format in `core`, with tests.
2. `SqliteStore` with the equivalence test; node opens it; JSONL import and export.
3. Decode layer (incremental), with the equivalence test against full rebuilds.
4. Cached `#state`, `#entries` and folds; stored ids.
5. Person index; `nameOf` and friends.
6. Benchmark before/after; numbers into the Work item.

## Risks

- **`node:sqlite` prints an "experimental" warning** in Node 24. Filter that one warning at start-up; the API is stable enough for our use (sync, prepared statements, transactions).
- **A corrupt database:** WAL makes it unlikely; the imported JSONL stays, and `weave export --jsonl` gives a way back.
- **Hidden order dependencies:** several folds rely on `replica.events()` being sorted by (time, signer, seq) (`#page`, `#app`, `reposOf`, `#selfBodies` users). The decode layer keeps exactly that order; the equivalence test guards it.
