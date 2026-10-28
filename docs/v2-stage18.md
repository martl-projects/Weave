# v2 stage 18: reputation (trust, vouches, gates)

From the v2 spec ("reviews scored like PageRank"), and from the ideas "Abuse budgets: a fair share per person, and trust gates later" (its part 2) and "Credits as a stat, badges and a reputation signal". Builds on stage 8's budgets, and on stage 19: built after it, as mark services (Weave trusted in your own domain, a space's view as the space's pinned service, gates through its `gate` slot).

## What it's for

- **Finding people worth listening to:** next to a name, how far the people you trust trust them, and why.
- **Keeping a space readable without anyone online at 3 a.m.:** a space or board may ask for a minimum trust to post.
- **Budgets that grow with trust:** stage 8's tiers also follow it.

There's no global score: anyone can make a thousand accounts that vouch for each other. Trust is always **seen from somewhere**: from you, or from the people who run a space.

## 1. Vouches: saying you trust someone

```
weave.vouch  {subject, on, note}   public; the latest per (author, subject) counts, by number
```

- "I trust this person": the strongest signal. `note` (at most 280 characters) says why, shown on their profile.
- `on: false` takes it back, at once.
- Public, so others' views can use it. A company account whose policy keeps it out of public doesn't vouch.
- One per person, whichever of their keys or agents signs it. An agent vouches only with the `weave.vouch` permission.

## 2. The trust graph

Every signal Weave already has becomes a weighted edge from one person to another:

| signal | edge | weight |
|---|---|---|
| a vouch | voucher → subject | 1 |
| a confirmed co-author credit | each way between author and co-author | 0.5 per post |
| a badge from a series that isn't broken | issuer → holder | 0.5 |
| an upvote on someone's post | voter → author | 0.1 per post |
| a follow | follower → followed | 0.2 |

- An edge between two people is capped at 2, whatever it's made of: two friends crediting each other back and forth gain little.
- Downvotes don't subtract: they'd make brigading pay.
- Nobody gains from themselves, or from anyone whose key acts for them.
- Each node builds the graph from what it holds. Credits and upvotes inside a space count only where that space is held: views converge as stage 8's budgets do.
- What you blocked doesn't count in your own view: neither their edges nor them.

## 3. Scored like PageRank, from a seed

Personalized PageRank over the graph: each person passes on their trust divided among the people they point to, in proportion to the weights. Damping 0.85: at each step, 15 % goes back to the **seed**. 50 rounds at most, or until nothing moves by more than 1e-9.

- **Your view:** the seed is you.
- **A space's view:** the seed is the people who manage it (owners and maintainers), equally. Every node holding the same events gets the same answer. Gates and budgets in a space use this view.

Spreading by share, not by count, is what stops fake accounts: a person's whole weight is split among everyone they vouch for. A thousand fakes vouching for each other get nothing unless someone trusted points at them, and then only that person's share.

**From the score to a level:** `trust = score × reached`, where `reached` is the number of people the seed's trust reaches (a score above 0). Someone at 1 gets an average share.

| level | trust |
|---|---|
| **trusted** | 4 or more |
| **known** | 1 or more |
| **new** | anyone else, and anyone the seed's trust doesn't reach |

- The seed itself is always **trusted**, and so are the managers in a space's view.
- First numbers, to tune with use (like stage 8's).

## 4. Shown as a level and its facts

- The number stays inside. People see the level and why:
  > ✓ trusted · vouched for by 3 (2 you know) · credited 12 times · 3 badges · 40 upvotes from 18 people
- "You know" counts the vouchers who are themselves known or trusted in your view.
- On a profile: your view, and the view of the space you came from ("in Weave: known"). The vouches with their notes, and a **Vouch** button (a note, optional; take it back the same way).
- The desktop app: the profile panel, and the level as a small mark next to names where people are listed (members, a post's author).

## 5. A trust gate per space or board

```
weave.space.gate  {board, level}   by those who manage the space; board null: the whole space;
                                   level 'known' | 'trusted', or null: no gate. The latest counts.
```

- "To post here, at least known": posts, replies and chat in that board (or anywhere in the space). Votes, reactions, leaving, keys and membership aren't gated.
- Checked in the **space's view**, not the poster's or the reader's.
- Managers always pass.
- **Writing:** the author's own node refuses, and says what would help: *"Ideas asks for known; in Weave you're new. When someone who runs Weave or someone they trust vouches for you, you can post here."*
- **Reading:** every node checks what it reads. A post or reply from below the gate isn't shown in the board, and it isn't passed on. Gates count from when they were set, as this node first saw them (like board rules): a gate doesn't hide what was already there.
- Shown to everyone, like board rules: "Who can post: known or trusted".
- Not a substitute for removing someone: a trusted person who misbehaves is still removed by moderators.

## 6. Budgets follow trust

Stage 8's tiers take the higher of what they already give and:

| level (space's view; public: your view) | tier |
|---|---|
| trusted | 1,200 events / hour |
| known | 300 events / hour |

So a newcomer someone trusted vouched for can chat at once instead of waiting a day.

## 7. Where to find it

- **CLI:** `weave vouch <who> [--note …] [--off]`, `weave trust [who] [--space …]`, `weave gate <space> [board] known|trusted|off`.
- **MCP:** `weave_trust` (a person's level and facts, from you or a space), `weave_vouch` (needs `weave.vouch`).
- **Node API:** `vouch`, `trust`, `setGate`; `gate` on boards and spaces; `trust` on profiles.

## Order of work

1. Core (`trust.ts`): vouch events, the graph, personalized PageRank, levels, facts; gates read from events. Tests: a vouch lifts, fakes don't, caps, blocks, deterministic order.
2. Node: the graph from what it holds (memoized), the views, `vouch`, `trust`, `setGate`, refusing below a gate when writing and hiding when reading, budgets; tests.
3. CLI and MCP.
4. Desktop: the profile (level, facts, vouches, Vouch button), the mark next to names, "Who can post" in board and space settings.
5. Release v0.20.

## As built

(to fill in)
