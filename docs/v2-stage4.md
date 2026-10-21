# v2 stage 4: communities and project content held by members

Built on stages 1–3. Spec: change 15 (communities and projects held by their members); Work board item "v2 stage 4".

Small spaces keep replicating fully: every member holds everything. A space becomes **pulled** once it has more than 12 members (communities, and the boards of projects). In a pulled space:

- every member holds every **envelope** (the signed events, a few hundred bytes each: who, when, which space);
- **bodies** (what a post or message says) are held by some members, by rule, and fetched from them when someone wants to read.

Groups, direct chats and tiers stay replicated, and so does a project's **core**: control events, issues, proposals and their votes, releases, the page, pinned posts. Formal votes need exact counts.

## Who holds a body

A member's node keeps the body of a content event in a pulled space if any of these holds:

| Why | |
|---|---|
| **Recent** | active within the last 14 days (everyone online gets the recent window) |
| **Yours** | you wrote it, or you own the space |
| **Kept** | you upvoted, saved or opened it in the last 30 days, or you follow its board |
| **Core** | pinned, issues, proposals, releases (projects) |
| **Share** | you're one of the 3 members with the lowest `H(event id ‖ member)`: every event has at least 3 holders without anyone coordinating |

A post's chat and edits go with the post. Everything else is **released**: its body is dropped (no tombstone: it can be fetched again), the envelope stays. Releasing runs in `reconcile`. Forgetting (stage 3) is separate: a forgotten body is never fetched again.

## Sync in pulled spaces

`HeldSpace` says when a space is pulled (and its window). Then the session:

- asks for full items only in the recent window (`sync {since: now − 14 days}`),
- and for envelopes of everything (`sync {since: '', bare: true}` → `have {bare: true}` → `fetch {bare: true}`), taking bodies too for the ids the node wants (`access.wantsBody`: its share, what it keeps).
- **Load older:** `fetchOlder(space, before)` asks the members for the 30 days before `before` with bodies (`sync {since, until}`); what comes is "opened", so it's kept for 30 days.

## Held by

Each post in a pulled space says roughly who holds it: "Held by about 7: its author, 3 members by share, 3 who upvoted" (and "everyone online" while recent). It's an estimate, computed from what every node knows: no reports, no tracking of who reads what.

## Order of work

1. Holding policy and releasing: `pulled` spaces, the share hash, `releaseBody` in the stores, the release pass, the "kept" set (opened, fetched).
2. Sync: `bare` envelopes, `wantsBody`, the window for pulled spaces, `sync {until}`, `fetchOlder`.
3. App: "held by" on posts, "Load older" at the end of a pulled board; PostInfo `heldBy`.
4. Release v0.7 with a release post.

## As built

- **Owners hold everything** of their own spaces (no pulling for them), so a big space always has one full copy wherever its owner runs Weave.
- **Opening a post keeps it** (30 days), as does asking for older content; the list of what you opened is sealed at rest (it says what you read).
- **Held by** is an estimate: the author, the share holders other than the author, and the net upvotes; "everyone online" while recent. It doesn't count what others opened (that stays private).
- **Envelopes always travel** in full, so every member knows what exists (and can compute shares and fetch on demand); only bodies are held partly. Large-community scale beyond that (helpers, indexers, Negentropy) is stages 5–7.
- Shown in the app: "Held by …" on posts, "Load older" at the end of a big space's board (and `weave older <space>`).
