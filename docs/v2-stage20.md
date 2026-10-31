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

The hint service Weave ships (Unread: its repository martl-projects/weave-unread, pinned in `packages/shipped/pinned.json`).

- **What it folds:** `weave.notice` and `weave.seen`.
- **What it counts:** notices in a place newer than when you last opened what shows them: the whole place, its channel (general by default), its board, or the post.
- **Its settings are the rules** that used to be this computer's (View → Notifications…): `{rules: [{who?, space?, board?, count, notify}]}`, the most specific one winning. Without a rule, messages to you count.
- **What the app does with the rules:** `notify` is still the app's to act on (system notifications), read from these settings.

## 5. Tints, signs and messages

From the same day: "Projekt hat Nachricht vom internal board: gelber Hintergrund, meine Freundin hat ein Herz unter der Nummer", and people standing out in the chat (favorites, contacts). Built as a second service Weave ships, Spotlight, to find where the model had to grow:

- **Vocabulary:** besides `count`, `{kind: "tint", tone}` (the place's or message's background) and `{kind: "sign", sign}` (a small symbol under the number, or next to the author). Tones (`yellow`, `green`, `blue`, `red`, `purple`) and signs (`heart`, `star`, `flag`, `bell`) are names the app draws in its own look, in every skin: a service never picks a color or an image, so it can't imitate Weave's own marks or anything else.
- **Several at once:** an answer entry is `{subject, hint}` or `{subject, hints: [...]}`, at most one of each kind per service. The app puts services together: counts add up, the first tint wins, signs side by side (up to three).
- **Slot `message`:** subject `{message: {space, id}}`, tints and signs only (a number on a message says nothing). The chat asks for every row it shows, in one batch.
- **Your address book as input:** `weave.contact` (sealed to you) is read like any kind; a hint service is about you, so it may.
- **Settings in `ask`:** the marks world's `ask` gets no settings. A change of settings folds again from the start (they're part of the fold's key), so a service keeps what it needs of them in its state.

**Spotlight** (martl-projects/weave-spotlight, pinned like Unread) shows nothing until its settings say who and what:

```
{"boards": [{"board": "internal", "tone": "yellow"}],
 "people": [{"who": "did:key:…", "name": "Mia", "sign": "heart", "tone": "red"}],
 "contacts": {"tone": "blue"}}
```

A place with something you haven't opened from such a board gets its tone, one where such a person wrote gets their sign; their messages get their tone and sign in the chat, and your contacts' messages too. Its settings are edited as JSON in View → Notifications… → Counts and highlights (`Settings…`), or `weave hints set Spotlight --settings <json>`.

**Where the model may grow next:**
- **Picking people:** `who` is a did:key in JSON; a person's menu ("Highlight Mia…") would write the settings of a service that says it takes people.
- **Settings a service describes:** a hint service could declare its settings (as a website's `settings`), so the app draws a form instead of JSON.
- **Agents:** a message an agent signs has the agent's key as author; a person's sign doesn't cover their agents yet.
- **Posts and the Inbox** as subjects; the phone.

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
- **Tints, signs, messages (section 5):** `HINT_TONES`, `HINT_SIGNS`, `checkHint(raw, slot)`, `checkHintAnswer(raw, asked, slot)` returning a list per subject; Places draws them in `TreeLink`, the chat on `msg-row` and next to the author (`HintSigns`, `useHints(slot, subjects)` in notify.tsx).
- **Tests:** `packages/node/test/hints.test.ts` (Unread; Spotlight's internal board, someone close to you, contacts; the vocabulary).
