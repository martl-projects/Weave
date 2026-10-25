# v2 stage 7: set reconciliation (Negentropy-style)

Built on stages 1–6. Spec: "Compare summaries, fetch differences" (range-based set reconciliation, as in Nostr's Negentropy); Work board item "v2 stage 7".

Today two peers compare a space's content by **id lists**: one asks for a time range, the other sends every id it holds in it (`have`), and the first fetches what it lacks. That costs bytes in proportion to the size of the space, every connection, even when both hold the same. Stage 4's big spaces made it worse: envelopes of everything travel as id lists on each connection.

## Range-based reconciliation

Both sides sort their items by `time ‖ id` and compare **ranges** by fingerprint:

1. The initiator sends one range covering everything, with its fingerprint and count.
2. The other side computes its own fingerprint for that range:
   - equal: nothing to do for that range;
   - different, and it holds few items there (≤ 32): it sends its ids for the range;
   - different and many: it splits its items there into 16 ranges and sends their fingerprints.
3. Whoever receives ids for a range knows exactly what it lacks there (and fetches it) and what the other lacks (it answers once with its own ids, marked final).
4. Repeat until no ranges are left.

Rounds grow with log₁₆ of the space's size; bytes grow with the differences. The fingerprint is `SHA-256(Σ H(id) mod 2²⁵⁶ ‖ count)` (first 16 bytes): order-independent, cheap to recompute.

## In the session

- `hello` says `features: ['neg']`. Between two peers that both have it, `neg {space, since, until?, bare?, ranges}` replaces `sync`/`have`; the same `fetch` follows, with the same rules for pulled spaces (bodies only where wanted, envelopes otherwise).
- Peers without it (v0.4–v0.9) get id lists as before.
- Load older (`fetchRange`) reconciles the asked range the same way.

Not NIP-77's binary encoding: JSON like the rest of the session, with the same idea. A bridge to Nostr relays would need the binary form; nothing here depends on it.

## Order of work

1. `core/reconcile.ts`: fingerprints, the step, tests (random sets, edge cases, rounds and bytes).
2. Session: feature flag, `neg`, fallback; tests with and without.
3. Measure on a busy space: bytes and rounds of id lists vs reconciliation, with few and with many differences.
4. Release v0.10.

## As built

- **Bounds are short:** a range's lower bound is left out where it's the previous range's upper, and cut points are the shortest start of a key that still separates two items (as Negentropy does).
- **Whoever starts an exchange fetches**, by its own rules (pulled spaces: bodies only where wanted); the other side only answers, and fetches in the exchange it starts itself. As with id lists.
- **Two kinds of set:** events with their bodies (recent window, full sync), and all envelopes (`bare`, for pulled spaces).
- With ranges, a full comparison costs only its differences, so peers compare everything on every connection instead of the last week.

### Measured

Two peers, one space of 10,000 messages, the exchange from hello to everything fetched (sync, have/neg and fetch messages):

| differences | id lists | ranges |
|---|---|---|
| none | 899 KB, 6 messages | under 1 KB, 4 messages |
| 2 | 899 KB, 8 | 14 KB, 16 |
| 100 | 903 KB, 8 | 29 KB, 16 |
| 1,000 | 899 KB, 7 | 145 KB, 15 |

A few more messages (rounds grow with log₁₆ of the size), a small fraction of the bytes.
