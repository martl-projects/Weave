# A Weave service in JavaScript

A service that answers what it's asked, built into a WebAssembly component. Weave runs it itself, sandboxed: nobody who uses it installs anything (no Docker, no Node.js), and it can do exactly what its contract says, nothing more.

Every service in Weave comes from a release: a project's, signed by a maintainer and pinned by its fingerprint. While you work on it, release it from this folder into a test project of yours, without GitHub: Weave keeps the files as blobs in the project (at most 32 MB), and the project's Weave releases service publishes them (add it once: `weave service add --shipped weave-releases --spaces <test project>`).

```
npm install
npm run build                                       # → service.wasm
weave app release dev-1 --from . -p <test project>  # reads weave.app.json, releases what it names
weave service add my-bot --artifact <test project>@dev-1 --spaces <test project>
```

Then ask it from anywhere in the project: `weave service ask my-bot "hi" -p <test project>`. Change `src/service.js`, build again, release the next tag and move the service to it:

```
npm run build
weave app release dev-2 --from . -p <test project>
weave service set my-bot --update dev-2
```

`weave.app.json` says what it is: its contract (`service`), its component (`wasm`) and the settings it asks for (`env`), like `GREETING` (`--setting GREETING=Hi` when you add it).

## What it gets

`src/service.js` exports `onEvent(item)`: Weave hands it what its contract lets it read, one item at a time, in order, also what came while it was off. Items are JSON (`{ id, kind, space, author, authorName, body, time }`); a request is `kind: "weave.service.request"` with `body.text` and `body.data`.

What it may do comes from `weave:service/host` (`wit/service.wit` says it all):

| | |
| --- | --- |
| `me()` | who it is: name, key, contract, its spaces (JSON) |
| `setting(name)` | a setting its person gave it (`--setting GREETING=Hi`, one its `env` names), kept sealed on their node |
| `answer(request, text, data, error)` | answer a request addressed to it |
| `publish(space, kind, body)` | sign an event of a kind its contract writes (`"writes": ["weave.msg"]`), say a chat message |
| `load(name)` / `save(name, value)` | what it keeps between runs, in its own folder |
| `log(message)` | a line for `weave service log` |

Each item has 10 seconds: one that takes longer is given up, and the service starts again.

## Calling an API

It reaches nothing until its contract names the hosts: in `weave.app.json`, `"service": { …, "net": ["api.example.com"] }` (or `*.example.com` for any subdomain). Whoever installs it reads those hosts in its contract. Then `fetch` works for them, over HTTPS only; anything else is refused, and `weave service log` says why. Return the promise from `onEvent` (an `async function`), so Weave waits for it:

```js
export async function onEvent(text) {
  const item = JSON.parse(text);
  const res = await fetch('https://api.example.com/v1/answer', { headers: { authorization: `Bearer ${setting('API_KEY')}` } });
  answer(item.id, await res.text(), undefined, undefined);
}
```

A key it needs is a setting (in `env`, then `--setting API_KEY=…`), so it never sits in the code. Give a POST (or PUT) a body, `'{}'` if nothing else: one without never finishes sending. Hosts on the node's own networks (localhost, 192.168.…) are never reached, whatever their name says, and redirects aren't followed.

**One thing to know:** code at the top level of your module runs while the component is built (componentize-js takes a snapshot then), when Weave's functions aren't there yet. Call them from the exported functions, or on first use there, never at the top level.

## Releasing it for others

The same `weave.app.json` goes with every release. For a project's people, release it from Weave as above, in their project. Or attach `service.wasm` (or an archive with it and `weave.app.json`) to a GitHub release and `weave app release v1.0 --asset wasm=service.wasm -p <project>`. Or build an image for `wasi/wasm` with the manifest in its `dev.weave.service` label and `weave service release <image:tag> -p <project>`. Either way, people install it from the project, or from a catalog it's listed in.
