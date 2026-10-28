# A Weave mark service in JavaScript: labels for people you list

What shows next to names. Take this service into your own domain and its labels show next to the people on its list, everywhere you look in Weave; a project's maintainers can pin it to their project instead, and then it shows only there, to every member. It's built into a WebAssembly component that Weave runs itself, with no key, no network and no files.

```
npm install
npm run build              # → marks.wasm
```

## How it fits together

`src/marks.js` is the logic. Weave calls it (`wit/service.wit`, the `marks` world):

| | |
| --- | --- |
| `fold(domain, settings, state, items)` | new events of the kinds it reads (`marks.reads`), oldest first, from public events and its domain; its state so far (none the first time). Returns the new state, as JSON. An item has `"home": true` when it's in the project the service comes from, by one of its maintainers |
| `ask(slot, subjects, state, viewer)` | what to show for these subjects (`{did}`, `{space}` or `{post}`) at a slot (`author`, `member`, `chat`, `profile`): `[{subject, marks: [...]}]` |

A mark is `check`, `label` (`text`, at most 16 characters), `count`, `symbol` (an emoji) or `image` (a `wblob:` picture), with a `tooltip` and a `ref` (an event a click opens). Weave drops anything else, keeps three per subject, and always shows who says so: a service can't pass as another, and a bare check is From Weave's alone.

Both must be pure: every node that took it in folds the same events into the same marks.

`weave.app.json` says where its component is, what it reads and where it answers.

## Releasing it and taking it in

Release an archive with `marks.wasm` on GitHub (`weave app release v1.0 --asset wasm=marks.tar.gz -p <project>`), or an image for `wasi/wasm` with `weave.app.json` in its `dev.weave.service` label (`weave service release <image:tag> -p <project>`). Then:

```
weave marks add <project> --settings '{"labels": {"did:key:z6Mk…": "friend"}}'   # yours, everywhere
weave marks add <project> --space <project>                                      # pinned there (maintainers)
weave marks <who>                                                                # what your services say
weave marks list                                                                 # yours
```
