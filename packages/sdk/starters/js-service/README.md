# A Weave service in JavaScript

A service that answers what it's asked, built into a WebAssembly component. Weave runs it itself, sandboxed: nobody who uses it installs anything (no Docker, no Node.js), and it can do exactly what its contract says, nothing more.

```
npm install
npm run build              # → service.wasm
weave service add my-bot --wasm service.wasm --reads addressed --spaces <project>
```

Then ask it from anywhere in the project: `weave service ask my-bot "hi" -p <project>`. Change `src/service.js`, build again, and `weave service set my-bot --wasm service.wasm` restarts it with the new code.

## What it gets

`src/service.js` exports `onEvent(item)`: Weave hands it what its contract lets it read, one item at a time, in order, also what came while it was off. Items are JSON (`{ id, kind, space, author, authorName, body, time }`); a request is `kind: "weave.service.request"` with `body.text` and `body.data`.

What it may do comes from `weave:service/host` (`wit/service.wit` says it all):

| | |
| --- | --- |
| `me()` | who it is: name, key, contract, its spaces (JSON) |
| `setting(name)` | a setting its person gave it (`--setting GREETING=Hi`), kept sealed on their node |
| `answer(request, text, data, error)` | answer a request addressed to it |
| `publish(space, kind, body)` | sign an event of a kind its contract writes (`--writes weave.msg`), say a chat message |
| `load(name)` / `save(name, value)` | what it keeps between runs, in its own folder |
| `log(message)` | a line for `weave service log` |

Each item has 10 seconds: one that takes longer is given up, and the service starts again.

## Calling an API

It reaches nothing until its contract names the hosts: `--net api.example.com` (or `*.example.com` for any subdomain), and in a release's `weave.app.json` `"service": { …, "net": ["api.example.com"] }`. Whoever installs it reads those hosts in its contract. Then `fetch` works for them, over HTTPS only; anything else is refused, and `weave service log` says why. Return the promise from `onEvent` (an `async function`), so Weave waits for it:

```js
export async function onEvent(text) {
  const item = JSON.parse(text);
  const res = await fetch('https://api.example.com/v1/answer', { headers: { authorization: `Bearer ${setting('API_KEY')}` } });
  answer(item.id, await res.text(), undefined, undefined);
}
```

A key it needs is a setting (`--setting API_KEY=…`), so it never sits in the code. Hosts on the node's own networks (localhost, 192.168.…) are never reached, whatever their name says, and redirects aren't followed.

**One thing to know:** code at the top level of your module runs while the component is built (componentize-js takes a snapshot then), when Weave's functions aren't there yet. Call them from the exported functions, or on first use there, never at the top level.

## Releasing it

Put a manifest next to it, `weave.app.json`, saying what it is and where the component is:

```json
{ "app": "my-bot", "name": "My bot", "service": { "reads": "addressed", "writes": [], "version": "1.0" }, "wasm": { "component": "service.wasm" } }
```

Attach `service.wasm` (or an archive with it) to a GitHub release and `weave app release v1.0 --asset wasm=service.wasm -p <project>`. Or build an image for `wasi/wasm` with the manifest in its `dev.weave.service` label and `weave service release <image:tag> -p <project>`. Either way, people install it from the project, or from a catalog it's listed in.
