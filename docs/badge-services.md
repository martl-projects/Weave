# Badge services (draft)

From a conversation on 2026-10-28, while adding counts next to chats in Places. Not planned into a stage yet; to post as an idea in the Weave project.

## Two systems, one place to show them

What shows next to a name is one of two different things, and they must never look alike.

| | Hints | Claims |
|---|---|---|
| Examples | 2 unread, running, waiting for you | trusted, verified, core team, checked business |
| About | your state | the person or project |
| Comes from | the app, computed here | an issuer: a badge service |
| Signed, shared | never | signed, checkable, revocable |
| Decides anything | no | yes: gates, budgets, whom you write to |
| Looks like | a plain number on the right | a mark at the name; on hover, always **who says so** |

They share only the **slots**: where something may show (next to a name in Places, a project's member list, a post's author, a profile).

Hints are built: counts next to chats, places, boards and channels until you open them, with rules for who and where (View → Notifications…).

## Claims: badge services

A badge service is an issuer. It runs on everyone's node, like any Weave service (WebAssembly, no network, checked by digest), over what that node holds. Its rules are its settings.

### Domains

Every service belongs to a domain, which decides whom it may mark and where it may show:

| Domain | Set up by | Marks | Shows |
|---|---|---|---|
| Project | its maintainers | members, posts, boards of the project | only in that project's views |
| Community | its moderators | members, posts of the community | only in that community |
| Group | its members | anyone | only to the group |
| User | you | anyone, anything | only in your own views |

You can **take a service into your own domain**: add the Weave community's trust service, and its marks show everywhere you look. Weave may ship some taken in by default; you can remove them. Nothing shows outside its domain unless the viewer chose it.

### Asking, not pushing

Weave asks at each slot: "marks for Phil, in Snake Flight's member list?" It asks only services that

- you added (user domain) or the space chose (its domain), **and**
- whose domain matches the slot, **and**
- declared that they answer this kind of slot and subject.

The asker enforces the domain: a service never sees questions from outside it.

An answer is a fixed vocabulary: a count, a check, a short label or a symbol, with a tooltip and the issuer. No HTML, no links, so a service can't take over the page or pass as Weave.

Asking tells a service what you're looking at: so services run locally and can't reach the network. Questions are batched per view, cached, and time-limited; a slow service shows nothing.

## Reputation as badge services

Stage 18 (docs/v2-stage18.md, not built yet) becomes the first reputation service rather than the one algorithm. Its trust is already "seen from somewhere": from you, or from those who run a space. That is a domain.

Every grouping can run its own reputation platform:

| Platform | In Weave | Seed | Seen by |
|---|---|---|---|
| your friends, private | a group | the group | its members |
| the Weave community, global | the Weave project or a community | its maintainers | whoever takes it in |
| business people | a company (attestor) or a business group | the company | its members, or whoever takes it in |

Same algorithm (personalized PageRank, sharing by weight so fakes gain nothing), configured per platform: the seed, which signals count and how much, the levels and their names.

### Where a platform's graph comes from

No data is handed to anyone. Each node computes over what it holds:

- a global platform counts public signals (vouches) and those inside its own space;
- a private group's inside stays inside.

A group can **vouch as a whole**: its service publishes, signed, "the group trusts these people". In a wider platform that's one edge per person, weighted as that platform's maintainers decide (or not counted at all). So platforms stack: friends and business groups feed the Weave community's graph without showing their insides.

### Computing it, or taking a snapshot

1. **Compute it yourself:** private and checkable; costs time (hard on a phone); knows only what you hold. Display may differ slightly between people, as it's their view.
2. **A signed snapshot:** the platform's service computes now and then and publishes "Phil: known, as of today". Cheap for everyone and can use more data; it is a claim, trusted for its issuer, and anyone can recompute.

Gates in a space use (1) over what every member holds (public signals and the space itself), with the service the space pinned by digest: every node reaches the same answer. Hiding a service changes what you see, not the gate.

### One data layer, many views: no fragmenting

The graph is made of signals (vouches, credits, upvotes, badges), public events that exist anyway, not of who uses which service. Removing Weave trusted hides its marks from you; your vouches and credits still count in it. Every platform reads the same public events with its own seed and weights: many views of one graph, not many graphs.

It would fragment only if people stopped giving public signals. So vouches are public by default (as in stage 18), private groups still contribute through a group vouch, and credits and upvotes in public spaces come about without anyone deciding to take part.

What you choose is only what you give (your vouches) and what you see (your services), never what others show about you. Personal labels ("I trust Phil", for your eyes only) stay private and feed nothing.

### Not feeding itself

Badges count as trust edges in stage 18. A freely configured badge service counts toward a trust graph only when that platform says so; otherwise anyone could mint trust with a service of their own.

## On the node

A badge service is a third kind of WebAssembly service, next to `service` and `board`, and built like a board's lens (client services): pure (no clock, randomness, network or key), run by every node, pinned by digest, so the same events give the same marks.

```wit
/// A badge service: pure like a lens, run by every node; no key, no network.
world badges {
  /// Take new events into the state (incrementally): the PageRank runs here.
  /// domain: {kind: user|group|project|community, id}; settings: the service's rules.
  export fold: func(domain: string, settings: string, state: option<string>, items: string) -> string;
  /// A slot asks: marks for these subjects, batched. Cheap: a lookup.
  /// slot: {kind: "member-list", space?}; subjects: [{did} | {space} | {post}]; viewer: {did}
  export ask: func(slot: string, subjects: string, state: string, viewer: string) -> string;
}
```

1. **Taking it in.** A space's maintainers pin a release, its digest and its settings with an event, as with `weave.board.lens`. Your own domain's services are a private event in your data; onboarding puts Weave trusted and From Weave there.
2. **Feeding it.** Its manifest names the kinds it reads (`weave.vouch`, credits, upvotes, badges). The node hands it only those, and only from public data and its own domain: the domain holds on the way in, not only on the way out.
3. **Folding.** On new matching events, debounced, in the background; the state cached per service and domain. Fuel and state size are capped.
4. **Asking.** The app calls `marks({slot, subjects})`. The node picks the services whose domain and declared slots match, calls each one's `ask` once for the whole view, checks the answer against the vocabulary (check, label, count, symbol; short text; tooltip) and drops anything else. **The node** adds the issuer (the service's name, domain and digest): a service can't claim to be another.
5. **Gates.** The node asks the space's pinned service at a fixed slot, `gate`, for the level. Pure and pinned, so every node decides alike.

Compute-yourself and snapshots are the same world with other inputs. A platform that publishes snapshots runs an ordinary keyed `service` on its own node, publishing `weave.badge.snapshot` events ("Phil: known, as of today"); the badge service on your node folds those, checking they're signed by the platform's service. From Weave is the same: it folds a registry of what's official, signed by Weave's keys.

### Code from releases, data from events

A badge service's code comes from the artifact system like any release: its identity is its digest, so GitHub is only one way to fetch it; any provider in the project serves the same bytes.

Its data doesn't go into the release. A list of what's verified is signed events in the issuer's project, e.g. `weave.official {subject, on, note}` signed by Weave's keys:

- **Open to everyone by replication:** every node holding the project has the whole history, append-only and signed: a transparency log, with no GitHub needed.
- **Revoked at once:** one event, no new release or pin.
- **GitHub at most as a mirror:** export the list to a repository for people to read, or to propose changes by pull request; the signed events stay the source of truth.

From Weave has a centre by nature, Weave's keys: only Weave can say what's from Weave. It stays decentralized in that anyone can run a list of their own, anyone can remove From Weave, and anyone can check every entry. Like certificate authorities, except you choose whom to believe, and the log is with everyone.

Hints (the counts) aren't services: they stay app code. Agents get `weave_marks`, the same marks you see.

## Onboarding: two services on from the start

A new person starts with two services taken into their own domain:

- **Weave trusted:** the Weave community's reputation platform (trusted · known · new, with the facts).
- **From Weave:** marks only what really comes from Weave: its projects, releases, services and agents, the people who run it. Checked against Weave's keys, so a look-alike name gets no mark.

Onboarding says so in one step ("These show marks next to names; you can remove them") rather than adding them silently. Both can be removed any time, like any other service. Removing From Weave is allowed, with one line on what it costs: without it, a look-alike of Weave can't be told apart at a glance.

## Open

- Telling platforms apart: a claim always shows its issuer ("Weave: trusted"); only a service From Weave confirms may use Weave's name and logo; a bare check with no issuer is Weave's alone?
- Which slots first: Places, member lists, post authors, profiles.
