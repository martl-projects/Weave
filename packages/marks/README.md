# Weave's own mark services

What shows next to names in Weave, from Weave itself (docs/v2-stage19.md). Each folder is a mark service: `weave.app.json` (its manifest, with `marks`) and `src/service.js`.

- `from-weave`: a check next to what really comes from Weave. It folds `weave.official` events in its own project, by its maintainers (`weave official <who> -p <project>`).
- `badges`: the badges of badge series, checked with core's `badgesOf`.

They don't ship inside the app. Each is released in a project of its own (a project has one app), and the app's bundle takes it into newcomers' own domain once Weave's free tier has brought them into that project:

```
node packages/marks/build.ts                        # → dist/<component>.wasm, with its SHA-256
weave app release v1.0 -p "From Weave" --asset wasm=<archive with from-weave.wasm>
```

In `weave.bundle.json`: `"marks": [{"project": "<From Weave's project id>", "app": "from-weave"}, {"project": "<Weave Badges' id>", "app": "weave-badges"}]`.
