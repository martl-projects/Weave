# Services Weave ships

Each folder here is a Weave service built into a WebAssembly component that ships with Weave: `weave.app.json` (its
contract, settings and `wasm.component`) and `src/service.js`. `node packages/shipped/build.ts` builds them into
`dist/`, with `shipped.json` listing each component's SHA-256.

Some live in repositories of their own instead, and Weave ships one release of each: `pinned.json` names its
repository, tag, archive and the archive's SHA-256 (`pinned.ts` fetches it once into `.cache/`, with GH_TOKEN or the GitHub CLI login,
checks it and unpacks it). Their source is only there, and what Weave ships is the very file their Weave project
releases. A new version: tag it there, release it in its project, then move its pin here.

The packaged daemon carries those digests (apps/desktop/package.ts): a component that isn't exactly what Weave ships
doesn't start, and a service's profile names its digest, so every member's Weave can tell whether it runs what their
own Weave ships. Add one with `weave service add --shipped <name> --spaces <project>`.

The build isn't reproducible yet (componentize-js snapshots differ between builds): the digest proves "the file this
Weave's build made", not "what anyone building this source gets".

A folder whose manifest says `marks` is a mark service (docs/v2-stage19.md): what shows next to names. Weave's own
(`badges`, `from-weave`) are everyone's, in their own domain, until they turn one off (View → Marks…, or `weave marks
remove`); only these may show a bare check. Their source is bundled with what it imports of Weave's core.

A folder whose manifest says `hints` is a hint service (docs/v2-stage20.md): numbers, tints and signs about your own
state next to places and on messages. Weave's own (Unread and Spotlight, both pinned) are everyone's until they
turn one off (View → Notifications…, or `weave hints remove`); Unread's settings are the rules for what counts,
Spotlight's say which boards and people stand out (it shows nothing until they do).

A folder whose manifest says `fetcher` instead of `service` is a fetcher: a client app of each person, not a project's
service (`weave fetcher add <name> --spaces <project>`). A provider names it in its contract (`"fetcher":
"github-checkout"`); what the provider answers is a grant for it, which the asker's Weave hands to their fetcher.
