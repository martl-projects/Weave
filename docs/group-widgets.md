# Group widgets: mini-apps in a chat

A group widget is a small app that anyone in a chat sends into it: a game of Word Tiles, a poll, a shared list. The message that sends it is one **instance**. Everyone in the chat who approved the release sees it in the message's bubble, compact, and opens it large with a click; what they do in it are events they sign themselves.

It's the same thing as a board's lens (a client service, `packages/node/src/lenses.ts`), anchored to one chat message instead of a board: the same WIT world (`board` in `packages/sdk/wit/service.wit`), the same pure component (`fold` and `act`), the same renderer in a sandboxed frame with the same postMessage protocol (`apps/desktop/src/renderer/lens.tsx`). One release can be both.

## Kinds

```
weave.widget  {app: {project, release, tag}, manifest, title, channel?, post?, replyTo?}
<its kinds>   {target: <the weave.widget's id>, ...}
```

- `weave.widget` is a chat message (`packages/core/src/widgets.ts`): in a channel of a group, tier, project or community (default `general`), or in a post's chat (`post`), like `weave.msg`. It shows in `messagesOf` as a message carrying `widget` (its text is empty). `weave.post.delete {target}` takes it down like any message: its author, or the space's maintainers and moderators. Direct chats have no widgets.
- `manifest` is the release's manifest as its project published it. Members who aren't in that project need it to fetch the files and check them (the same reason `weave.board.lens` carries it); members who are in it check that it matches the release (below).
- Its own events are the kinds its manifest lists in `widget.writes`, each with `target`: the widget message's id. An instance is folded from exactly those (`widgetEventsOf`): another instance of the same release is never in it.
- Who writes them: the members of the chat. Only members' events count in a space (`visibleIn`); in a post's chat the widget and its events belong to that post's board, so a limited board's rules apply to them (`access.ts`).

## Manifest

```json
{
  "app": "word-tiles",
  "name": "Word Tiles",
  "client": { "component": "board.wasm", "site": "site", "writes": ["weave.post", "tiles.join", "tiles.move", "tiles.doubt"] },
  "widget": { "component": "board.wasm", "site": "site", "writes": ["tiles.join", "tiles.move", "tiles.doubt"], "size": { "height": 480 } }
}
```

`widget` is checked like `client` (`checkManifest`): `component` a `.wasm` in the package, `site` its renderer's folder, `writes` up to 20 kinds, and `size.height` how tall it is in the bubble (120 to 720 pixels; 320 when left out). `writes` names kinds of its own only: a manifest listing a `weave.` kind is refused. Released like a client service: a release file for `wasm` (released from Weave, or GitHub) or an image for wasi/wasm. A release with only `widget` is an artifact of kind `widget`.

## What fold and act get

- `fold(about, items)`: `about` is `{widget: <message id>, title, space, by: {did, name}, time}`; `items` are, oldest first, the widget message itself (`{id, kind: "weave.widget", body: {title, app}, author, authorName, time}`) and then the instance's own events in the same shape. The state is the widget's own JSON; Weave reads only its `actions`.
- `act(name, input, state, me)`: as for a lens. What it proposes is checked before anything is published (`packages/node/src/widgets.ts`): each event of a kind its manifest lists and never a `weave.` kind, with a body, about this instance only (a `target` that names anything else is refused; a missing one is set to the instance). At most 20 events; all or nothing. The member signs them with their own rights, in the chat's space.

## Trust

In a group anyone can send a widget, so nothing of it runs before its member said yes:

- **Approved once per release, by its fingerprint**: the release's id with its manifest as sent (which names every file by its SHA-256, or the image by its digest), like a service's or a client app's approval. Another version, or other files under the same tag, asks again. Sending a widget approves its release for its sender; an agent sending one approves nothing.
- **Kept on the member's node** (`widgets.json` in its home), never shared or published. `approveWidget {off: true}` takes it back.
- **Until approved**, the bubble shows a card: the title, the app's name and tag, the project it comes from, who sent it, and a button to approve and open it. Nothing is fetched, nothing runs, its view isn't served (`lensFile` refuses `widget-<release>`), and `widgetAction` refuses.
- **Checked against its project** where the member can: someone in the release's project sees whether the manifest sent is what the project released; if it isn't, it never runs, approved or not. Someone outside the project sees "only the sender vouches for this version".
- Fetching: a release from Weave's own files (blobs) is fetched from whoever holds them, so members outside its project can get it; a release only a provider hands out (GitHub releases) needs membership in its project, as before.

## Limits

A widget is pure, like a lens:

- **No secrets.** Everything in an instance is readable by every member of the chat: its events and its state. A card game with hidden hands can't be built this way.
- **No randomness.** fold must give every member the same state from the same events. Seed what needs chance from something nobody knows in advance and everyone sees, like the widget message's id (Word Tiles shuffles its bag from it).
- **No clock.** Events are dated by their signers; fold orders by that date and the id, and a move whose turn hasn't come yet should wait rather than count (see Word Tiles' `n`).
- No key, no network, no calls to anything: fold and act only.
- At most 5000 events per instance are folded, and a state of at most 1 MB.

## API

| Backend | CLI | MCP |
|---|---|---|
| `widgetReleases()` | `weave widget list` | `weave_widgets` |
| `sendWidget({space, channel?, post?, project, tag?, title?})` | `weave widget send <project>[@tag] -g <group> [-c <channel>] [--title]` | `weave_widget_send` |
| `widgetView({message})` | `weave widget view <id>` | `weave_widget_view` |
| `widgetAction({message, action, input?})` | `weave widget act <id> <action> [--input]` | `weave_widget_action` |
| `approveWidget({message, off?})` | `weave widget approve <id> [--off]` | (none: approving is the person's own) |

In Weave Web (docs/web-stage2.md, step 8) the component is transpiled in its Worker as it starts, and the view is built in a sandboxed frame of its own (`lens-frame.html`) from its files (`lensSite`).

The app shows a widget message as its card or its frame (`apps/desktop/src/renderer/widgets.tsx`), and sends one from the chat's 📎 menu, entry "Mini-App", which lists the widget releases of the projects you're in. Its view is served like a lens's: `lensBase('widget-<release>')`.
