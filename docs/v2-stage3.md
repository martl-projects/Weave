# v2 stage 3: forgetting, with transparency

Built on stages 1–2. Spec: change 16 (forgetting by rule and by value, its two guarantees) and change 17 (shredding, carry-forward); Work board item "v2 stage 3".

Nothing is forgotten until someone who manages a space sets a rule. Spaces from before keep everything. v0.5 peers ignore the new kinds and keep what they hold, so this ships as v0.6 without a break.

## 1. Board rules

`weave.board.rule {board, keepDays, maxMB}`, a control event in projects and communities, set by maintainers (moderators in communities). `keepDays: null` and `maxMB: null` mean no limit; no rule means keep everything.

- Shown in the board and its settings, with who set it and when.
- **Permanent, whatever the rule:** pinned posts, issues, proposals, and the releases board.
- **No surprises:** a rule never makes a post go sooner than 14 days after the rule was set (the grace period), so nothing vanishes the moment a rule changes.

## 2. How long a post stays

```
until = max(active + keepDays × (1 + log2(1 + upvotes)) days,  rule set + 14 days)
```

- `active`: the newest of the post, its edits, its chat, its upvotes, and "Keep" (below).
- `upvotes`: the people upvoting it (not the score): every upvote is a vote to keep.
- `maxMB`: if a board's posts (with their chat) take more than this, the ones that would go soonest go first, not the oldest; permanent ones never.

When a post's time is up, honest nodes **forget it**: they drop the bodies of the post, its edits and its chat, and remember that they did (a tombstone per body), so they don't fetch them again from peers that haven't forgotten yet. The events stay (signed, without bodies), so chains and ids keep working.

## 3. The guarantees

- **Your own work never vanishes by itself:** your node never drops what you wrote, and keeps everything of the spaces you own (founded or were handed). Others forget by the rules; your devices keep yours.
- **Nothing is dropped for space:** forgetting follows rules only; there's no "disk full, delete oldest".
- **Warned ahead:** 14 days before a post of yours is forgotten, it shows in your Inbox with **Keep** (counts as activity: its time starts again) and, for those who manage the space, **Pin** (permanent).
- **Always visible:** each post says how long it stays and why ("stays until 12 March, 4 upvotes added 60 days", "kept: pinned", "kept: issues stay", "kept: no rule here"); each board shows its rule, who set it and when.

"Held by …" on posts comes with stage 4 (members holding content); until then every member holds everything they're allowed to.

## 4. Shredding and carrying forward (replicated spaces)

Forgetting by honest nodes can't recall copies others kept. Shredding can: `weave.space.shred {epochs}`, by whoever manages the space, tells every member to delete those epoch keys, so every remaining copy of what they sealed becomes unreadable.

- **Carry forward first:** before shredding, what the rules still keep from those epochs (posts not yet due, permanent ones, their chat) and the space's control events are restated under the current key in a carry (`weave.space.carry`, as for newcomers in stage 2), with their original ids, authors and times.
- **Who is trusted to carry:** a node takes a carry from whoever handed it the space's keys (a newcomer) or from someone who manages the space by the state it read itself, before the carry (never from the carry itself).
- The current epoch can't be shredded; a space with rules gets a new key every month (as `30d` history does), so old months can be shredded.
- `weave shred <space> --before <date>`: the epochs that ended before that date. After shredding, members also drop the bodies sealed with those keys.

## Order of work

1. Rules: kind, fold, `setBoardRule` (node, CLI), BoardInfo; tests.
2. Lifetimes and forgetting: `lifetimeOf` in core, tombstones in the stores and the session, the node's forgetting pass (in `reconcile`), the guarantees; tests.
3. Transparency: PostInfo `lifetime`, `fading()` with Keep and Pin, Inbox and post UI, board rule UI; tests.
4. Shredding: kind, carry-forward, trust for carries, monthly keys for spaces with rules, `weave shred`; tests.
5. Release v0.6 with a release post.
