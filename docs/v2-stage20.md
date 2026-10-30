# v2 stage 20: hint services

From the conversation on 2026-10-30, after stage 19's mark services. The second system of docs/badge-services.md, "hints" (2 unread, running, waiting for you), becomes a kind of service too, so the counts next to places are no longer this computer's alone and other services can give counts of their own.

## What it's for

- **Counts that follow you:** what you opened on your computer counts no more on your phone, and the other way round.
- **Rules that follow you:** which people and places count is the same on every device.
- **Counts from services:** a project's service may count what waits for you ("3 cards for you", "a build failed"), as Unread counts messages.

Hints stay what docs/badge-services.md said they are: about **your** state, computed on your node, never signed or shared, deciding nothing, shown as a plain number on the right. They never look like marks.

## 1. The component

A hint service is a component of the **marks world** (packages/sdk/wit/service.wit: `fold`, `ask`), pure like a mark service: no key, no network. Its manifest says `hints` instead of `marks`:

```
"hints": {"component": "unread.wasm", "reads": ["weave.notice", "weave.seen"], "slots": ["place"], "subjects": ["space", "board", "channel"]}
```

- **Slot:** `place`, next to a place in Places.
- **Subjects:** `{space}`, `{board: {space, name}}`, `{channel: {space, name}}`.
- **Vocabulary:** `{kind: "count", count, tooltip?}`, one per subject. A count of 0 says nothing. Anything else is dropped.
- A manifest is a mark service or a hint service, never both.

## 2. What it's fed

Yours only (the user domain). It folds what your node holds of the kinds it reads, **sealed to you too**: unlike a mark service, it's about you. Two kinds are new:

```
weave.seen    {space, view: "all" | "channel" | "board" | "post", name?, time} or {all: true, time}   sealed to you
weave.notice  not an event: one per event your node works out is a notice for you
              {type, category, from, space, board?, channel?, post?}, at the event's time
```

- **`weave.seen`:** the app writes one when you open a place where something waits (a whole chat, a channel, a board, a post). `{all: true}` is written once, at the first start: nothing before it counts.
- **`weave.notice`:** worked out by the node, as notifications are, without their one-day limit, only since the latest `{all: true}`, and kept per event.

## 3. Taking one in

As mark services after their alignment (stage 19, "taken in like keyvaults and fetchers"):

```
weave.hints.mine  {service, origin, manifest, settings, on} or {service, shipped: true, settings?, on}   sealed to you
```

- **A project's release:** taken in only with your yes to exactly that release (`addHints {approve}`). A newer one shows as `newer` and runs only with another yes.
- **Weave's own:** everyone's until turned off. Their settings are kept the same way.
- **Names:** no release takes the name of anything Weave ships.

## 4. Unread

The hint service Weave ships (`packages/shipped/unread`).

- **What it folds:** `weave.notice` and `weave.seen`.
- **What it counts:** notices in a place newer than when you last opened what shows them: the whole place, its channel (general by default), its board, or the post.
- **Its settings are the rules** that used to be this computer's (View → Notifications…): `{rules: [{who?, space?, board?, count, notify}]}`, the most specific one winning. Without a rule, messages to you count.
- **What the app does with the rules:** `notify` is still the app's to act on (system notifications), read from these settings.

## As built

- **Core** (`packages/core/src/hints.ts`):
  - the kinds, subjects and vocabulary (`checkHint`, `checkHintAnswer`), `parseSeen`, and the manifest's `hints` part (`parseAppHints`);
  - artifact kind `hints`;
  - `parseMarkService` and `markServicesOf` take a part (`marks` or `hints`).
- **Node:**
  - **`Folder`** (marks.ts) runs services of the marks world, and mark and hint services share it: fetching or the shipped file, starting, incremental folds, asks within a time.
  - **`Hints`** (`packages/node/src/hints.ts`) is the domain logic.
  - **Notices:** the node works them out per held event (`#heldNotices`, cached).
  - **Live signal:** `weave.hints` (debounced, 150 ms) fires when a notice comes in, you open something, or the services or their settings change.
- **Node API:** `hints`, `hintServices`, `addHints`, `setHints`, `removeHints`, `seen`.
- **CLI:** `weave hints` (what waits where), `hints list`, `hints add <project> --approve`, `hints add --shipped <name>`, `hints set <service> --settings <json>`, `hints remove <service>`.
- **Desktop:**
  - Places asks the node (batched per render, again only on `weave.hints`) instead of counting in `localStorage`.
  - Opening a place where something waits writes `weave.seen`, and so does a notice for what you're looking at.
  - The rules are Unread's settings; ones this computer kept before move over once.
  - View → Notifications… lists the hint services (where each comes from, turn off, update, take one in), and the release list offers "Take in…" for a project's.
- **Not yet built:**
  - the phone's counts;
  - a starter (`service new --hints`);
  - bold "unread" names in Places, which still compare against this computer's `localStorage`;
  - counts for posts and the Inbox.
- **Tests:** `packages/node/test/hints.test.ts`.
