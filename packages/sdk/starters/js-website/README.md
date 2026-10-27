# A Weave website in JavaScript: a buzzer quiz

A small multiplayer game, built into a WebAssembly component. Weave runs it itself and does the rest: it serves the files in `site/`, makes the website reachable for the project's people through Weave's encrypted tunnel, and holds the players' connections. The game only handles what they say. Nobody installs anything, the host included.

```
npm install
npm run build              # → game.wasm
weave service add quiz --wasm game.wasm --site site --offers-website --reads nothing --spaces <project>
```

The project needs Weave's website service (`weave service add website --builtin website --spaces <project>`): the quiz then shows up in its websites. You're the host: ask a question, the others buzz, you judge.

## How it fits together

- `site/` is the page: plain HTML and JavaScript. It opens a WebSocket to `/weave/socket` and talks JSON.
- `src/game.js` is the game. Weave calls it:

| | |
| --- | --- |
| `onJoin(player)` | someone connected: `{ id, did, name, host, member, maintainer }`, as Weave vouches for them (nobody can pretend to be someone else, or the host) |
| `onMessage(id, message)` | what a player sent |
| `onLeave(id)` | their connection ended |
| `onTick()` | its timer, every `tickEvery(ms)` |

And the game answers with `send(id, message)`, `broadcast(message)`, `disconnect(id)` and `tickEvery(ms)` from `weave:service/players`, plus `load`/`save` (the scores, in its own folder) and the rest of `weave:service/host` (`wit/service.wit`).

Use `did` to tell people apart: it stays the same across devices and reconnects, so a player keeps their points.

**One thing to know:** code at the top level of your module runs while the component is built (componentize-js takes a snapshot then), when Weave's functions aren't there yet. Call them from the exported functions, or on first use there, never at the top level.

## Releasing it

`weave.app.json` says what it is and where its parts are:

```json
{ "app": "quiz", "name": "Buzzer quiz", "service": { "reads": "nothing", "writes": [], "website": true, "version": "1.0" }, "wasm": { "component": "game.wasm", "site": "site" } }
```

Release an archive with `game.wasm` and `site/` on GitHub (`weave app release v1.0 --asset wasm=quiz.tar.gz -p <project>`), or an image for `wasi/wasm` with the manifest in its `dev.weave.service` label (`weave service release <image:tag> -p <project>`). People then install it from the project, or from a catalog it's listed in, and host their own quiz.
