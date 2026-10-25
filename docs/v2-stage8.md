# v2 stage 8: abuse budgets (part 1)

From the idea "Abuse budgets: a fair share per person, and trust gates later" in the Weave project. Spec: "Publishing budgets for everyone". Part 2 (an optional trust gate per space or board) waits on reputation.

## 1. A fair share per person, in storage

Builds on the board rules of stage 3. In a board with a rule:

- **Fair share:** the board's posts (with their chat) divided among the people who wrote them: `fair = total bytes / authors`.
- **Over the share:** an author's `overuse = their bytes / fair`. Up to twice the share nothing changes (small boards are rarely even). Beyond, their posts that nobody else upvoted stay `2 / overuse` as long: four times the share, half the time; ten times, a fifth. The grace after a rule (14 days) still holds.
- **Over the board's size:** posts go by `overuse` first (biggest over-users first), then by what would go soonest.
- **Upvotes from others** undo the squeeze for that post: a prolific poster whose posts people value keeps them.

## 2. A rate budget per author, in sync

Each node keeps a budget per author per space for **live** content (events claiming a time within the last hour), counted from what it holds:

| who (seen from this node, in that space) | events / hour | bytes / hour |
|---|---|---|
| those who manage the space; yourself | no limit | no limit |
| members for 30 days or more, and your friends | 1,200 | 10 MB |
| members for a day or more | 300 | 2 MB |
| newer members, and anyone in public | 60 | 512 KB |

(First numbers, to tune with use: 60 an hour lets a newcomer chat at a message a minute.)

- Beyond the budget, the node **refuses** the event: it isn't stored and isn't passed on, so a flood stays with the flooder's own connections. Refused isn't lost: it's still with the sender, and a later sync (stage 7) brings it in once the hour has moved on, so a flood trickles in at the budget.
- **Control events are never limited** (members, keys, rules): nothing may block a rekey.
- **History isn't live:** events claiming an older time pass (a newcomer catching up, a peer back after a week). A flooder backdating posts puts them in the past, where the fair share and the board's rule deal with them.
- Budgets differ a little from node to node (friendship is personal): views converge as the budget allows.
- `weave status` says how many events were held back.

## Order of work

1. Fair share: `lifetimeOf` takes overuse, `overBudget` orders by it; the node computes shares per board; tests.
2. Rate budget: `replica.admit`, the node's tiers, the held-back count; tests (a flood stops at the budget, history passes, control passes, managers unlimited, later sync brings the rest).
3. Release v0.11.

## As built

- **Gentler on small boards:** up to twice the fair share is untouched; the squeeze starts beyond.
- **Budgets doubled from the first sketch** (60 / 300 / 1,200 events an hour), so a newcomer can chat at a message a minute. Tune with use.
- **A bug it shook loose:** deciding on an event now reads the space's state mid-sync, which decoded views earlier than before; a re-signed v2 event then sat beside the v1 event it stands for. Now it replaces it.
- Tools that load whole histories as if live (the benchmark) turn budgets off (`node.budgets = false`).
