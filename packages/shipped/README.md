# Services Weave ships

Each folder here is a Weave service built into a WebAssembly component that ships with Weave: `weave.app.json` (its
contract, settings and `wasm.component`) and `src/service.js`. `node packages/shipped/build.ts` builds them into
`dist/`, with `shipped.json` listing each component's SHA-256.

The packaged daemon carries those digests (apps/desktop/package.ts): a component that isn't exactly what Weave ships
doesn't start, and a service's profile names its digest, so every member's Weave can tell whether it runs what their
own Weave ships. Add one with `weave service add --shipped <name> --spaces <project>`.

The build isn't reproducible yet (componentize-js snapshots differ between builds): the digest proves "the file this
Weave's build made", not "what anyone building this source gets".
