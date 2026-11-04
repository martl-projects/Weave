# Splitting node.ts

A plan for taking `packages/node/src/node.ts` (10,783 lines at `ba48b52`) apart into a core without Node APIs, modules by concern, and one authorization function. Written for the idea post [Splitting node.ts: a plan for the 10,000 lines](http://weave.localhost:7710/weave~NqgQ/ideas/CAlM/splitting-node-ts-a-plan-for-the-10-000-lines), issue [W3wT](http://weave.localhost:7710/weave~NqgQ/issues/W3wT/structural-one-authorization-function-in-core) (one authorization function in core) and the Weave Web plan [OVb4](http://weave.localhost:7710/weave~NqgQ/ideas/OVb4/weave-im-browser-martl-io-konto-mit-passkey-ohne), stage 2 of which needs exactly this. Nothing here changes behaviour; every step is a commit with the whole suite green.

## 0. This was done once already

Issue W3wT's chat records a split on the `criticals` branch (26 Oct, on v0.20.0): `authz.ts` with `mayAct`/`mayActAt` in core (part 1), then nine module cuts, each one commit, node.ts from 9,030 to 5,221 lines. It was replayed on `merge-main` (worktree `weave-merge`, head `ecf4d96`). Neither branch reached main. What did reach main, cherry-picked on 25–26 Oct, is everything else from that review: the security fixes (`621d8f1`, `73a10dd`, `abe47a6`, `b289583`, …) and the regression tests sorted by concern (`debe015`: `membership.test.ts`, `shred.test.ts`, `spacekeys.test.ts`, `standby.test.ts`, core `authority.test.ts`).

Since then main has moved 341 commits, and node.ts alone differs from that base by about 5,000 changed lines (avatars, files in chat, sessions and the desk, invites, services and websites, the imprint). The `criticals` side moved node.ts by 7,574 lines. A git merge of the two is not a serious option: nearly every hunk conflicts, and resolving a conflict inside a moved method is doing the cut again by hand without seeing it.

So the plan is to **replay the cuts on today's main**, using `criticals` as the template: its module files (`managed.ts`, `companies.ts`, `badges.ts`, `payments.ts`, `repos.ts`, `holding.ts`, `retention.ts`, `desk.ts`) and their `…Core` interfaces say what each cut needs of the node; the code itself is copied method by method from today's node.ts, not from the branch. Its `authz.ts` can be taken nearly as it is. Afterwards `criticals` and `merge-main` can be closed.

## 1. Inventory

node.ts is one class, `WeaveNode implements Backend`, with 42 fields and about 670 methods, plus 950 lines before the class (585 of them imports: 419 names from `@weave/core`, 107 from `./backend.ts`) and 42 after it. Its sections, grouped by the concern they will belong to (lines at `ba48b52`):

| Concern | Sections in node.ts | Lines | Node APIs it touches | Other modules it leans on |
| --- | --- | ---: | --- | --- |
| **Module level** | imports, kinds, constants, `Handover`, `StoredService`, `StoredRoom`, `Decoded`, keeper and budget constants, `deskInstructions`, `ManagedRaw`, `CARRIED_STATE` | 992 | all of them (imports) | everything |
| **Class head** | fields, constructor, `open`/`close`, the per-event hook on `replica.onAppend`, clock, identity, sync | 658 | `rmSync`, `joinPath`, `homedir`, `createHash` | home, vault, keystore, sqlitestore, spacestore, blobstore, config, signin, company, services, website, gumroad, onchain |
| **Spaces, keys, membership** (the kernel) | groups and projects, communities, internals: spaces, identity and keys, moving to v0.4, moving to protocol 3, internals: reading, internals: board access, direct chats | 1,500 | `cpSync`, `existsSync`, `readFileSync`, `writeFileSync`, `createHash` (the two migrations) | spacestore (keys on disk), keystore, backend |
| **Holding and retention** | who holds what (stage 4), keepers (stage 5), budgets (stage 8), retention (stage 6.4) | 649 | `createHash`, `joinPath` | vault, spacestore |
| **Content** | posts, boards and upvotes, images, chat, working together (issues, proposals, mentions), projects, internals: posts | 1,227 | `joinPath` | home, vault, hints, blobstore |
| **People** | people (profiles, follows, avatars, themes), accounts elsewhere | 386 | none | theme, avatar, verifiers, devicecode |
| **Agents and the desk** | agent harnesses, agents asking for more, sessions and their stacks, your desk and its routines, phones | 1,169 | `existsSync`, `mkdirSync`, `writeFileSync`, `basename`, `isAbsolute`, `joinPath`, `resolvePath`, `homedir`, `randomUUID` | claudecode (spawns Claude Code), harnesses, config, home |
| **Money** | memberships (tiers), badges, treasuries, signing a Safe's transactions, paying from a wallet, ticketed events | 1,362 | `rmSync`, `joinPath` | gumroad, onchain, vault |
| **Companies** | escrowed recovery (9.2), audit (9.3), managed spaces (6), company accounts (10), company policy (11), audit in security tools and exports (12), SCIM and devices (12), the admin console (12), SSO (6.3) | 2,026 | `hkdfSync`, `readFileSync`, `cpSync`, `mkdirSync`, `readdirSync`, `statSync`, `rmSync`, `joinPath` | company, keyproviders, signin, scim, devices, mail, auditsinks, console, vault |
| **Apps, releases, services** | rooms and shared apps, updates, fetching a release, the app API, modules: services and websites (527 lines, 78 one-line delegations and the `servicesHost`/`websiteHost` host objects) | 813 | `joinPath` | services, website, lenses, marks, hints, registry, appinstall, github, artifacts, fetchers, keyvaults |

Node APIs in node.ts itself are few: `node:crypto` (`createHash`, `createPublicKey`, `createVerify`, `hkdfSync`, `randomUUID`), `node:fs` (eight functions), `node:path`, `node:os` (`homedir`, `hostname`). No `node:sqlite`, no `child_process`, no `net` directly. The host comes in through the modules the class composes: `home.ts` (paths), `vault.ts` (secret files), `spacestore.ts` (one JSON per space), `keystore.ts`, `blobstore.ts`, `sqlitestore.ts`, `config.ts`, `claudecode.ts`/`harnesses.ts`/`runtime.ts` (processes), `live.ts`/`websocket.ts` (sockets), `signin.ts`/`scim.ts`/`console.ts`/`mail.ts` (servers and mail), and `@weave/net` (`SwarmNode` over hyperswarm). Of the 65 files in `packages/node/src`, 49 import `node:*`; `@weave/core` imports none (checked: it is browser-clean today, as OVb4 says).

**State the class shares across concerns.** Of the 42 fields, these are the ones most sections reach, and the ones a split has to be careful with:

| Field | Used in sections | What it is |
| --- | ---: | --- |
| `replica` | 35 of 50 | the event log and its queries; 266 `this.replica.` calls |
| `home` | 25 | paths in the home directory (the host) |
| `clock` | 19 | injected time; tests set it |
| `config` | 17 | settings file |
| `#decoded` (+ `#decodedRevision`, `#decodedGeneration`) | 12 | the cache of all decoded sealed events; set to `undefined` at seven places to invalidate |
| `#agents` | 11 | agent keys; `servicesHost` exposes it with a setter |
| `#directs` | 11 | direct chats by scope |
| `#spaces` | (115 `this.#spaces` uses) | the `Map<string, StoredSpace>` of joined spaces |
| `#swarm` | 7 | the network |
| `#services`, `#website`, `#marks`, `#hints`, `#lenses` | 2–6 | the modules already split out |
| `#stateCache`, `#spaceCache`, `#memos`, `#rawCache`, `#arrivals`, `#personEvents`, `#policyCache` | 1–3 | caches around `#state(space)` (120 calls), `#entries` (32), memoized reads, arrival times |

**The hot path.** `replica.onAppend` (class head, lines 1150–1172) runs for every event in log order: `#seeGeneration`, arrival time, `#takeRaw` (company halves; invalidates `#decoded`), `#takeKeys` (rekeys and gifts), `#decodedAdd`, `#forgetDirects` on rotations, `#personEvents` upkeep, `#takePolicy`. Everything that reads decoded events goes through `#decodeAll()` (24 call sites) and the cache. The order of these calls and the cache's invalidation rules are the behaviour the split must not disturb.

**Where roles are decided today.** `canManage` (core `spaces.ts`, also used by the reducer at six places) and direct checks on `state.maintainers.has`, `state.founder ===`, `#managers(state)`, `#mineFounder`, `#trustedCarries`: 54 sites in node.ts (for example lines 1970, 2153, 2254, 2316, 2520, 3501, 4521, 5722, 6696, 7475, 7554, 7874, 8293, 8480, 8896, 9046, 9112, 9342), six in core's reducer (`spaces.ts` 122, 797, 876, 886, 893, 904). `mayAct` does not exist on main.

**Tests.** `npm test` runs 114 test files (91 of them in `packages/node/test`), 477 tests at `513e274`. `packages/shipped/dist` must be built first (`node packages/shipped/build.ts`) or the applets tests fail; `npm run typecheck` is `tsc -p tsconfig.json`. There is no lint step. `scripts/bench.ts` measures event sizes and read times and serves as the before/after for the hot path.

## 2. Target layout

```
packages/core/                      pure: events, spaces, keys, crypto. Already free of node:*.
  src/authz.ts                      NEW  mayAct, mayActAt: the one place that decides roles

packages/node/src/
  node.ts                           WeaveNode: composition root + the Backend facade (one-line delegations). < 1,000 lines
  ports.ts                          NEW  the interfaces the core needs of its host (see below)
  core/                             NEW  no node:* import, no import from host/: checked by a test
    kernel.ts                       spaces, keys, epochs, rekeys, carries, takeKeys/takeRaw, decode + cache, state cache,
                                    board access, reading, the onAppend hook (what is "internals: spaces/reading/board access" today)
    membership.ts                   invite, knock, join, admit, remove, leave, groups in projects, admissions, direct chats
    content.ts                      posts, boards, upvotes, chat, images, issues, proposals, mentions, pages
    people.ts                       profiles, follows, blocks, avatars, themes, accounts elsewhere, imprint
    holding.ts                      who holds what, keepers, budgets            (criticals: holding.ts)
    retention.ts                    holds, forgetting by rule, shreds           (criticals: retention.ts)
    payments.ts                     tiers, treasuries, Safe, wallets, tickets   (criticals: payments.ts)
    badges.ts                                                                   (criticals: badges.ts)
    companies.ts                    accounts, policy, escrow, audit, SSO, SCIM  (criticals: companies.ts)
    managed.ts                      the company key service: halves, unlock     (criticals: managed.ts)
    agents.ts                       agent keys, permissions, asking for more
    sessions.ts                     sessions, stacks, the desk and its routines (criticals: desk.ts)
    apps.ts                         rooms, releases, updates, the app API, repos (criticals: apps.ts, repos.ts)
    shared.ts                       kinds, constants and small helpers the modules share (so none imports node.ts for a value)
  host/                             NEW  the Node adapters, moved as they are: home, vault, spacestore, keystore, blobstore,
                                    sqlitestore, filestore, config, lock, machine, claudecode, harnesses, runtime, live,
                                    websocket, signin, scim, console, mail, auditsinks, update, appinstall, artifacts,
                                    fetchers, registry, keyvaults, keyproviders, wasmworker, untar, shipped, gumroad (OAuth part)
  services.ts, website.ts, …        stay where they are (already modules with host objects)
  backend.ts, remote.ts, client.ts  the API, unchanged
```

**The ports** (`ports.ts`), the whole of what `core/` may ask of the outside:

- `Storage`: the space files (`StoredSpace` load/save/remove), secrets (`readSecretJson`/`writeSecretJson`), blobs (`BlobStore`), the event store the replica runs on, and a small key-value area for caches and migration marks. Today: `spacestore.ts`, `vault.ts`, `blobstore.ts`, `sqlitestore.ts`, files under `home`. Tomorrow: OPFS + sqlite-wasm.
- `Network`: `SwarmNode` as it is (join/leave topics, connections, replicate, hole-punched tunnels) behind an interface in `@weave/net` that a WebSocket relay can also implement. Today: hyperswarm.
- `Clock` and `Random`: `clock()` exists; `randomUUID`/`randomBytes` come from `@noble` or `crypto.getRandomValues`, which the browser has.
- `Host`: what only a full computer does, as optional capabilities: spawn a harness (Claude Code), install and launch apps, the OS keystore, a loopback HTTP server for sign-ins, mail, the admin console and SCIM listeners, the machine's name. A web node gets a `Host` with most of it missing, and the capability list (today `PHONE_METHODS` in `remote.ts`) is derived from what is missing, not kept by hand.

**The one authorization function.** `mayAct(state, did, action)` and `mayActAt(state, event, action)` in `packages/core/src/authz.ts`, taken from `criticals` (`b7da30f`): actions `invite`, `admit`, `remove`, `manage`, `promote`, `group`, `curate`, `own`, with the reason for a no. The reducer in `spaceState` asks it for every kind it folds; `core/` asks it before every write and when judging others' events (pages, apps, repos, rekeys, carries, shreds). `canManage` and `rekeyCounts` remain as two-line wrappers for a transition and go when nothing calls them. W3wT's acceptance test, `grep canManage packages/node/src` empty, holds from step 2 on.

**The rule every module follows** (it is what `servicesHost` already does for `services.ts`): a module is a class that gets a typed `…Core` interface in its constructor, built in `WeaveNode`'s constructor from bound private methods and getters, 9 to 22 members, nothing `any`. The public `Backend` methods stay on `WeaveNode` as one-line delegations, so `backend.ts`, the RPC list, the clients, the CLI, the MCP server and every test keep working unchanged. Caches stay in the kernel; a module that changes space state calls `core.invalidateDecoded()`, never a field.

## 3. The steps

Each step is one commit on a short-lived branch, merged within the day it starts, with `npm run typecheck` and `npm test` green and `scripts/bench.ts` unchanged within noise. The order starts with the biggest gain at the smallest risk: leaf concerns first (they read the kernel, nothing reads them), then the authorization function, then the kernel itself.

| # | Step | Moves | node.ts after | Risk | Unblocks |
| --- | --- | ---: | ---: | --- | --- |
| 0 | **Guard rails.** `packages/node/test/layers.test.ts`: reads every file's imports and asserts which may import `node:*` (today's list) and that `core/` imports no host; a bench baseline committed to `docs/node-split.md`. A `shared.ts` for the kinds and constants modules will share. | 0 | 10,783 | none | the step order itself |
| 1 | **Companies and the key service** → `core/companies.ts`, `core/managed.ts` (template: `criticals` parts 2–3). The largest leaf: 2,026 lines, its own tests (`company`, `console`, `standby`, `managed`). | 2,000 | ≈ 8,800 | low: self-contained, touched by nobody else right now | |
| 2 | **One authorization function.** `core/authz.ts` + reducer + the 54 sites (template: `criticals` part 1; `authz.test.ts` as the table per space kind). Semantics must be those of main today, which has the review's fixes; the branch's table is the starting point, every difference is a reviewed decision, not a side effect. | ±300 | ≈ 8,700 | **medium**: this is the one step that touches semantics; `membership`, `spacekeys`, `shred`, `authority` tests guard it | W3wT |
| 3 | **Money** → `core/payments.ts`, `core/badges.ts` (template: parts 4–5; `treasury` and `badges` tests). | 1,360 | ≈ 7,300 | low | |
| 4 | **Holding and retention** → `core/holding.ts`, `core/retention.ts` (parts 8–9; `shred`, `holding`, `keepers` tests). Order of `applyShreds`/`forget` in the periodic sweep kept verbatim. | 650 | ≈ 6,650 | low–medium: both run in the sweep and touch keys | |
| 5 | **Agents, sessions, the desk** → `core/agents.ts`, `core/sessions.ts` (part 10, `desk.ts`). **Last of the leaves on purpose: Tessel is in these sections now** (sessions view, archived sessions); cut after their branches land. | 1,170 | ≈ 5,500 | low, timing matters | |
| 6 | **Content and people** → `core/content.ts`, `core/people.ts`. New cut (not on `criticals`); the `posts`, `collab`, `avatars`, `attachments`, `invitelook` tests guard it. | 1,600 | ≈ 3,900 | low | |
| 7 | **Apps, releases, updates** → `core/apps.ts` (parts 6–7). Shuttle works in `services.ts`/`website.ts`, which this step doesn't move; the 78 delegations stay in node.ts. | 800 | ≈ 3,100 | low, coordinate with Shuttle | |
| 8 | **The kernel** → `core/kernel.ts` and `core/membership.ts`, `ports.ts` with `Storage`/`Network`/`Clock`/`Random`/`Host` as the kernel sees them today (interfaces over the existing classes, no new implementations). The `onAppend` hook moves whole, in order. node.ts is now the composition root and the facade. | 2,100 | < 1,000 | **medium**: the hot path; bench before/after, `replicaV2`, `joinsync`, `spacekeys` tests | **Weave Web stage 2** (a core that can run elsewhere) |
| 9 | **Hosts into `host/`**, `layers.test.ts` tightened to "`core/` imports no `node:*`", migrations (`moving to v0.4`, `moving to protocol 3`) into `host/migrations.ts` behind a port. Then: `esbuild --platform=browser --bundle packages/node/src/core/kernel.ts` resolves (a test), which is the proof OVb4 stage 2 asks for. | moves only | | low | **Weave Web stage 2**: storage adapter (OPFS) and network adapter (dht-relay) can start |
| 10 | **Remote without hyperdht.** `remote.ts` split into the protocol (JSON-RPC, live events, capability check) and transports (hyperdht today, `websocket.ts` second); `PHONE_METHODS` becomes a capability list derived from the `Host`. Not a node.ts cut, but it is OVb4's milestone 2 and falls out of steps 8–9. | ≈ 300 | | low | **Weave Web stage 1** |

Steps 1, 3, 4 and 6 are independent of each other and of step 2; they could run in parallel in separate sessions if each takes a different section and they land one at a time. Steps 8 and 9 depend on everything before them. After step 5 node.ts is half its size and every authorization path is readable in one module, which is W3wT's point.

## 4. Risks and how each step answers them

- **Hidden coupling through shared state.** 42 fields, of which `#decoded`, `#spaces`, `#directs`, `#agents` and the caches are written from several sections. Answer: a module never gets a field, only methods on its `…Core` interface; a cache's invalidation stays one method in the kernel (`invalidateDecoded`), and `#agents`' setter in `servicesHost` becomes `setAgents()` in step 5. The inventory above says per concern which fields it reaches; the `…Core` interface of each cut is checked against that list in review.
- **Event order.** The `onAppend` hook and the periodic sweep (`applyShreds`, then `forget`, then rotations) encode order that tests exercise only indirectly. Answer: the hook moves as one block in step 8 and is never split across modules; modules add themselves to it through one registration point, in the order node.ts has today; steps 4 and 8 add an explicit test for the sweep order if `shred.test.ts` doesn't pin it.
- **Performance on the hot path.** `decodeAll()` returns the cached array by reference; `#state(space)` is memoized; 266 `replica` calls. Answer: `…Core` methods are bound methods, not wrappers that copy; interfaces expose the same arrays (readonly in type, same object at runtime); `scripts/bench.ts` runs before and after steps 4 and 8 with its numbers in the commit message; a step that costs more than noise is reworked, not merged.
- **Diff size for Tessel and Shuttle.** Every cut moves thousands of lines of node.ts; a branch that edits a moved method conflicts, and git resolves nothing useful. Answer: a cut is announced in the Weave project's chat the morning it starts and lands the same day; the sections they work in are cut last (step 5 for Tessel's sessions and desk) or not at all (Shuttle's `services.ts`/`website.ts`, already modules); they rebase right after a cut lands, which is a mechanical re-apply of small edits onto the new file. Nothing is cut while one of them has an unmerged node.ts change in that section.
- **Semantic drift in step 2.** The `criticals` table was written against v0.20.0; main has since fixed removals, readmission, rekeys and carries. Answer: port the function, then run the existing regression tests before touching a single call site; every site that changes its answer is listed in the commit with the test that proves which answer is right. This is the step martl reviews line by line.
- **Import cycles.** Modules need `Decoded`, `StoredSpace`, kinds and constants that live in node.ts today; `criticals` imported values from `node.ts` back into `retention.ts`. Answer: step 0's `shared.ts`; `WeaveNode` is only ever a `type` import in a module.
- **Private fields.** `#x` members are per class; a moved method loses them, which is where the real work per cut is (it was on `criticals` too). Answer: the `…Core` interfaces, 9 to 22 members each, are the measure of a cut's coupling; one above 25 means the cut line is wrong.
- **Two stale branches.** `criticals` and `merge-main` will look like the real thing to a newcomer. Answer: once step 2 is on main, both get a last commit note and are deleted (their worktrees `weave-wallet` and `weave-merge` with them, by martl).

## 5. The baseline (step 0)

`npm run typecheck` and `npm test` green at `ba48b52`. `scripts/bench.ts` on a seeded home of 3,015 events (`seed … 3000`, then `run`), the numbers every later step is held to, within noise:

| Read | ms |
| --- | ---: |
| open (first, imports logs) | 1,221 |
| open | 52 |
| feed, first | 348 |
| feed, again | 20 |
| posts of the busy project | 20 |
| posts again | 12 |
| one post by id | 24 |
| say, then posts again | 44 |
| members | 1 |
| heap after reads | 27 MB |

## 6. As built

Notes per step, where the build differed from the plan above.

- **Steps 1–7 cut into flat modules** (`packages/node/src/companies.ts`, not `core/companies.ts`): a module that still needs `node:fs` or a loopback server cannot sit in `core/` before the ports of step 8 exist. The `layers.test.ts` list names each new module explicitly; moving what can move into `core/` is step 9's job, as planned.
- **The cut is scripted.** A script takes the line ranges of node.ts, writes the module with its `…Core` interface generated from what the moved code reaches (`this.#x` → `this.core.x`, public members → `this.node.x`), leaves one-line delegations on `WeaveNode` for the Backend methods, and turns `this.#x` into `this.#module.x` elsewhere in node.ts. What the script can't know (field types in the interface, members reached as `n.#x` from the static host objects, import cycles) the type checker lists and a hand fixes. One cut takes an hour, not a day.
- **`shared.ts`** holds `DAY_MS`, `SECRET_FIELDS` and `withoutSecrets`; `verifyIdToken` moved with the companies (console.ts imports it from there); `KIND_GENERATION` is exported by companies.ts for the node's append hook.
- **Step 1 (companies and the key service):** `managed.ts` (`ManagedKeys`, 347 lines, `ManagedCore` with 10 members) and `companies.ts` (`Companies`, 1,492 lines, `CompaniesCore` with 19 members); node.ts 10,783 → 9,233. Two things to know: a module built in a field initializer must reach later modules lazily (`delegated: (scope) => n.#companies.delegated(scope)`), and `#settleLosses`/`#anchorRemovals`, which sat in the SSO section, stay in node.ts under their own marker: they are membership, not company, code.

## 7. What "done" looks like

- node.ts under 1,000 lines: fields, constructor, `open`/`close`, the facade.
- `packages/node/src/core/` imports no `node:*` and nothing from `host/`, enforced by `layers.test.ts`; an esbuild browser bundle of the kernel resolves.
- `grep canManage packages/node/src` finds nothing; every role decision is a `mayAct` call with an action name.
- Each concern has its module, its `…Core` interface and its test file next to it; the suite's count is the same as before plus the new `layers`, `authz` and sweep-order tests.
- `scripts/bench.ts` within noise of the baseline recorded in step 0.
- Weave Web stage 1 has a transport-independent remote; stage 2 has its two adapter interfaces to implement.
