# v2 stage 19: mark services

From the conversation in docs/badge-services.md (2026-10-28). Comes before stage 18: reputation is built as mark services.

## What it's for

- **Seeing who and what something is, at a glance:** next to a name, what the services you chose say about them: "From Weave", "Weave: trusted", "Snake Flight: core team", "Acme: verified".
- **Every grouping its own:** a project, community or group runs its own service, with its own rules, shown only in its own place. You take in what you want to see everywhere, and can remove anything.
- **One way for reputation, verification and badges to show:** stage 18 becomes a mark service instead of a mark of its own.

Not for hints about your own state (counts, unread, running): those stay app code (built: counts in Places, by rules).

**Words.** A *mark* is a claim next to a subject, from an issuer. A *mark service* is an issuer: a pure WebAssembly component every node runs. Its *domain* is where it may mark and show. A *slot* is a place in the app that asks for marks.

Code says `marks`, because `weave.badge` is already the numbered badges of badge series (which can show as marks too, see 8).

## 1. The component

```wit
/// A mark service: pure like a board's lens (no clock, randomness, network or key), run by every node, so the
/// same events give the same marks.
world marks {
  /// Take new items into the state, oldest first: the state is the service's own (JSON).
  /// domain: {kind: user|group|project|community, id}; settings: its rules, as its domain set them.
  export fold: func(domain: string, settings: string, state: option<string>, items: string) -> string;
  /// Marks for these subjects, at this slot: [{subject, marks: [{kind, text?, symbol?, tooltip?}]}].
  /// slot: {kind, space?}; subjects: [{did} | {space} | {post}]; viewer: {did}.
  export ask: func(slot: string, subjects: string, state: string, viewer: string) -> string;
}
```

Its manifest says what it reads and where it answers:

```json
"marks": { "reads": ["weave.vouch", "weave.badge"], "slots": ["member", "author", "chat", "profile"], "subjects": ["did"] }
```

## 2. Domains, and taking a service in

| Domain | Who takes it in | Event | Marks | Shown |
|---|---|---|---|---|
| project, community | its maintainers | `weave.marks.pin` in the space | its members, posts, boards | only in that space's views |
| group | its members' managers | `weave.marks.pin` in the group | anyone | only to the group's members |
| user | you | `weave.marks.mine`, private | anyone, anything | only in your own views |

```
weave.marks.pin   {service, origin: {project, release} | {shipped, digest}, settings, on}   latest per service counts
weave.marks.mine  {service, origin, settings, on}                                          private; latest counts
```

- A space pins a release the way it pins a board's lens: every member's node fetches and runs it without asking, as it has no key and no network.
- Taking one into your own domain is how a space's service shows beyond its space: your choice, never its.
- Onboarding puts two in your domain, fetched at the first start (see 7), and says so in one step: **From Weave** and, once stage 18 is built, **Weave trusted**. Both can be removed; removing From Weave says what it costs (a look-alike of Weave can't be told apart at a glance).

## 3. Feeding and folding

- The node hands a service only the kinds its manifest reads, and only from public events and its own domain (for a space: that space; for you: what you hold). The domain holds on the way in.
- Folded incrementally, debounced, in the background, on new matching events; the state is cached per service and domain, and kept across restarts.
- Fuel per call and a state of at most 1 MB; over that, the service shows nothing and its log says why.

## 4. Asking

```
marks({slot, subjects}) → [{subject, marks: [{kind, text?, symbol?, tooltip?, issuer: {name, domain, digest, weave?: true}}]}]
```

- The node picks the services whose domain fits the slot (a space's service only for slots in that space; yours everywhere) and whose manifest names the slot and subject kind.
- One `ask` per service for the whole view, batched; cached until its next fold; 50 ms at most, or it shows nothing this time.
- **The vocabulary:** `check`, `label` (at most 16 characters), `count`, `symbol` (from a fixed set), `image` (a wblob: reference, served by the node, never an address elsewhere). A tooltip of at most 200 characters, plain text. `ref`: an event the mark is about (a badge), which a click opens in the app's own view of it. Anything else is dropped.
- **The node** adds the issuer: the service's name, its domain and its digest. A service can't claim to be another.

## 5. Shown

- One component, `<Marks>`, at each slot: member lists, a post's author, chats in Places, profiles.
- The issuer always shows on hover. From Weave first, then your own services, then the space's; three at most, the rest behind "+n".
- **Telling issuers apart:** a bare ✓ is From Weave's alone; every other check shows its issuer's initial. Only a service From Weave confirms may be named or shown as Weave.

## 6. Gates (for stage 18)

A fixed slot, `gate`, asked of the service a space pinned for it (`weave.marks.pin {…, gate: true}`): a level for a person. Pure and pinned, so every node holding the space decides alike. This stage only adds the slot; stage 18 uses it.

## 7. Delivery

- Releases as today: a release event fingerprints the component; any provider or GitHub delivers; the node checks the SHA-256.
- Later, not in this stage: a component of at most 2 MB carried as a Weave blob in its release event, so members pass it on to each other and nothing waits on GitHub.

### Weave's own, through the app's bundle

(Superseded: they ship with Weave instead; see "As built".)

From Weave and Weave trusted don't ship inside the app: a new account gets them the way it already gets its start, through the app's bundle (weave.bundle.json: contacts, and free tiers to join).

- **A project per official service:** besides the Weave project, Weave's free tier takes newcomers into a project for each service that comes from Weave: From Weave, Weave Badges, later Weave trusted, Websites, Kanban and others. A project has one app, so each service gets its own project and releases there, as any project does.
- **The bundle names what to take in:** a new entry, `marks: [{project, app}]`. Once the tier's membership arrives and the project's release is there, the node fetches it like any release (as a member, through the project's provider or GitHub), checks it against the release's fingerprint, and takes it into your domain (`weave.marks.mine`). Until then, no marks; nothing waits on it.
- **Onboarding says so** in one step: the projects you join, and the two mark services, each with a way out.
- **Updates:** as a member you see the project's new releases; a newer release of a service the bundle took in replaces the old one in your domain. A mark service is pure, so it needs no approval; View → Marks… says it changed. One you removed stays removed.
- **Not wanting any of it:** a machine-wide `weave.bundle.json` (next to `weave.policy.json`) replaces the app's own, as companies already do; and anyone can leave the projects and remove the services later.
- **Gates aren't affected:** a space's gate uses the release the space pinned, not the latest.

## 8. The first services

1. **From Weave** (a release of the Weave Marks project, taken in through the bundle). Marks what really comes from Weave: its projects, releases, services and agents, and the people who run it. It folds `weave.official {subject, on, note}` events in the Weave Marks project, by its maintainers, so its list changes without a new release; every member holds the whole list and its history.
2. **Badges** (a release of the Weave Marks project, taken into your domain through the bundle): the badges of badge series, as they show next to names today. No data moves: the `weave.badge*` events stay as they are, and so do giving, passing on and personal notes (the node's, as notes need keys). The service is `badgesOf` from core as its fold (limits, numbers given twice, transfers), answering up to three valid badges per person (`image` or `symbol`, `ref` to the badge, so a click opens the badge card with its note). It replaces `NameBadges` in chat and posts; the hub's full list stays. In your domain it shows every valid badge everywhere, as today; a project that pins it too shows its own first. Until it's fetched at first start, a newcomer sees no badges.
3. **A starter:** `weave service new --marks`, a service that labels people from a list in its settings ("friends", "colleagues"), for your own domain.

## 9. Where to find it

- **CLI:** `weave marks <who> [--slot …] [--space …]`, `weave marks add|remove <service> [--space …]`, `weave service new --marks`.
- **MCP:** `weave_marks` (what the services say about someone, with issuers).
- **Node API:** `marks`, `pinMarks`, `myMarks`.
- **Desktop:** `<Marks>` at the four slots; your services in View → Marks…; a space's in its settings; the onboarding step.

## Order of work

1. Core: the events (`weave.marks.pin`, `weave.marks.mine`, `weave.official`), the manifest's `marks`, the vocabulary and its check. Tests.
2. Node: running components of the `marks` world (from the lens runtime), feeding by domain, folding and caching, `marks` with batching and time limits, the issuer added. Tests: a domain doesn't leak, a slow or oversized service shows nothing, the vocabulary holds.
3. The bundle's `marks`: taking a project's release into your domain once its membership arrives, and following its new releases. The Weave Marks project in Weave's free tier, with From Weave as its first release.
4. CLI and MCP.
5. Desktop: `<Marks>`, the four slots, View → Marks…, space settings, onboarding.
6. Then stage 18, as mark services.

## Open

- Code name `marks`, UI name "Marks" or "Badges"? (Badges already means badge series in the app.)
- Projects every newcomer joins grow to many members: their participant lists and what each node holds of them must stay light (read-mostly boards; members not listed by default?).
- Who in a group may pin: its managers, or any member for themselves?

## As built

- **Core** (`packages/core/src/marks.ts`): `weave.marks.pin`, `weave.marks.mine`, `weave.official`; the manifest's `marks: {component, reads, slots, subjects}`; `markServicesOf` (the latest per service, `on: false` takes it away); the vocabulary check (`checkMark`, `checkMarkAnswer`: only subjects that were asked, three per subject, labels cut to 16 characters, tooltips to 200, no control characters). The WIT's `world marks` is in `packages/sdk/wit/service.wit`.
- **Symbols:** not a fixed set after all, since badge series already have free emoji. A symbol is up to 8 characters with no letters, digits or spaces, and never a check (✓ ✔ ☑ ✅ √).
- **Node** (`packages/node/src/marks.ts`): it runs components of the marks world through the lens runtime (`releaseFolder` is now shared with lenses).
  - **Feeding by domain:** yours gets everything this node holds; a space's gets public events plus that space. Each item carries `home: true` when it's in the service's own project and by one of its maintainers, which is how From Weave ignores look-alikes.
  - **Folding** is incremental. It refolds from the start when an item comes in older than the last one folded, or when the settings change. The state is capped at 1 MB. It is not yet kept across restarts.
  - **Answers** are cached per fold version, slot and subject.
  - **Timing:** a fold the app waits on longer than 1.5 s shows nothing, and the app is told when it's ready (live update). An ask has 200 ms (`MARKS_TIMING`), not 50 ms: a component parses its state on every ask.
- **Weave's own, shipped with Weave** (changed from the bundle plan in 7, once main's services Weave ships were there): Badges and From Weave are in `packages/shipped` (`badges`, `from-weave`), built by its `build.ts` (bundled with esbuild, as Badges takes `badgesOf` from core) and checked by their digest like every service Weave ships.
  - They're everyone's own, in the user domain, without any event; `weave.marks.mine {service, on: false}` turns one off, `{service, shipped: true, on: true}` back on (`weave marks add --shipped <name>`, View → Marks… "Turn on").
  - `issuer.weave` (a bare ✓) is true only for these, and a component that isn't exactly what this Weave ships doesn't run (the service shows its problem). No project's service may take their app ids, in your domain or a space's.
  - From Weave's `home` is the Weave project (where Weave announces its versions, `config.updates.project`): `weave official <who>` is said there by its maintainers. No From Weave or Weave Badges projects, no bundle entries, no `pendingMarks`.
  - Updates come with Weave's own updates; a new Weave's components fold again from the start.
  - **Badges** keeps the badge events in its state and refolds them with `badgesOf`. Its tooltip names the issuer, not the project: the node's own check that a series' project is really the issuer's (`#allBadges`) needs the project's maintainers, which a pure service doesn't get. The badge card a click opens is the node's checked view.
- **Starter:** `packages/sdk/starters/js-marks` (labels from its settings), made with `weave service new --marks`.
- **CLI:** `weave marks [who]`, `marks list`, `marks add <project>`, `marks add --shipped <name>`, `marks remove <service>`, `weave official <who>`.
- **MCP:** `weave_marks`.
- **Node API:** `marks`, `markServices` (`off`: Weave's own you turned off, too), `addMarks`, `removeMarks`, `setOfficial`.
- **Live signal `weave.marks`:** the node says the marks may have changed (debounced, 150 ms) when an event arrives of a kind some service here reads, when the services change (taken in, removed, pinned, a new release), or when a fold the app couldn't wait for finishes. A chat message changes no marks, so it asks nothing.
- **Desktop:** `<Marks>` (batched per slot and space, asked again only on `weave.marks`, kept across navigation) replaces `NameBadges` in chat and posts; a click on a badge mark opens the badge card. View → Marks… lists your services, turns Weave's own off and on, and takes one in from a project.
- **Not yet built:**
  - the member, chat (Places) and profile slots in the desktop;
  - a space's services in its settings;
  - the onboarding step;
  - the group domain;
  - the gate slot's use (stage 18).
- **Still to do outside the code:** `weave official` for what comes from Weave, by a maintainer of the Weave project. Badges show next to names as soon as people run a Weave with this in it.
- **Tests:** `packages/node/test/marks.test.ts`.
