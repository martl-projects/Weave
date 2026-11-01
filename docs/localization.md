# Localization: every UI text by name, German and English

*Design, 1.11.2026, for the work item [A localization layer](http://weave.localhost:7710/weave~NqgQ/ideas/5Sid/a-localization-layer-every-ui-text-by-name). Nothing of this is built yet; the open questions are at the end.*

Weave's UI is English only: about two thousand texts written straight into the desktop renderer (which the phone app bundles unchanged), thirty more in the app's main process, two hundred in the admin console, and a good share of what people read comes from the daemon itself: error messages, notifications, the "problem" lines under services. Before the first public release Weave comes in German and English. This page says how texts get names, how a language package answers them, how the language is chosen, how services bring their own texts without passing for Weave's, and in which order the texts move.

## How it works

1. **A text has a name.** `post.reply`, `peers.connected`, `member.left.remove`. Names are lowercase words joined by dots, grouped by screen or thing, not by file. A component asks for the name: `t('post.reply')`, `t('peers.connected', { n })`.
2. **A language package answers.** A package is plain data, one JSON file per language: the name, the text in that language. English is a package too, shipped with Weave and the fallback: a name the German package lacks shows in English; a name the English package lacks shows as the name itself, and the check fails.
3. **Texts carry placeholders, plurals and choices** in a small ICU-style grammar (below). Dates, times, numbers, percentages, currencies, relative times ("3 min ago") and joined lists ("Ann, Bo and Cy") come from the platform's `Intl` in the chosen language, never from the package.
4. **The language is a device setting.** The system's language by default, changed in View → Language, in effect at once, without restart. The phone has its own setting, the console too.
5. **Services bring their own texts** as the same kind of package, next to their `weave.app.json` in their release, and Weave looks them up under that service's name only: a service's package translates its own labels and nothing of Weave's.
6. **The daemon stops writing sentences for screens.** Errors and notifications it produces for the UI carry a name and values; the screen that shows them renders them in its language, and the CLI and agents keep the English sentence.

## The layer

A small module of our own in `packages/core/src/texts.ts` (no runtime dependency; core already serves the renderer, the phone, the console, the main process and the node): the message grammar, the parser, the formatter, and the package checks. About 300 lines plus tests.

Why not i18next or an ICU library: the subset Weave needs is small, `Intl` does the hard parts (plural rules, dates, numbers, lists), and the same parser validates every package before it is used, Weave's own and a service's, so a package can never carry anything that runs. A dependency would be pulled into five bundles for that.

**The grammar**, a subset of ICU MessageFormat so translators and tools know it:

| Form | English | German |
|---|---|---|
| placeholder | `{name} left group {group}.` | `{name} hat die Gruppe {group} verlassen.` |
| plural | `{n, plural, one {# peer connected} other {# peers connected}}` | `{n, plural, one {# Peer verbunden} other {# Peers verbunden}}` |
| choice | `You're not in this {kind, select, project {project} group {group} other {community}}.` | `Du bist nicht in {kind, select, project {diesem Projekt} group {dieser Gruppe} other {dieser Community}}.` |
| number, date, time | `open until {deadline, date, medium} {deadline, time, short}` | `offen bis {deadline, date, medium}, {deadline, time, short}` |
| relative time | `active {time, ago}` | `aktiv {time, ago}` |
| list | `{names, list}` → Ann, Bo and Cy | Ann, Bo und Cy |
| markup | `<b>{name}</b> left group <b>{group}</b>.` | the same tags, any order |

`#` is the count in the plural's language. `ago` uses `Intl.RelativeTimeFormat` with the same steps as today's `ago()` ("just now", minutes, hours, then the date). Markup: only `<b>`, `<i>`, `<code>`, as tags the renderer turns into elements; everything else in a text is literal. A value can be a React node (`{ name: <b>{name}</b> }`), so the rich sentences in `views.tsx` (someone left, remove them from the project?) are one text each.

**In components.** `useTexts()` gives `t` and `T`, re-rendering when the language changes:

```tsx
const { t } = useTexts();
<button title={t('post.reply')}>…</button>
toast(t('marks.taken', { name: s.name, version: s.newer }));
<T name="member.left.remove" values={{ name: <b>{name}</b>, group: <b>{a.group.name}</b>, project: <b>{a.project.name}</b> }} />
```

Outside React (the main process's tray and dialogs, `whyNotText`, the console's helpers), `texts(lang).t(...)` from the same module. Module-level label maps (`SKINS`, `NOTICE_CATEGORIES`, `KIND_WORDS`, …) become functions of `t`, or keep names and resolve where rendered; otherwise they would keep the language of the first render.

**The English stays readable.** Code has names only; the English text lives in the package. So that a name says what it is, names are sentences in short: `keys.recovery.warning`, not `text42`. The check (below) refuses a name without an English text, so a typo in a name is caught before anyone sees it.

## The packages

One file per language, Weave's own under `packages/texts/` (a workspace of data, no code):

```
packages/texts/weave.texts.en.json
packages/texts/weave.texts.de.json
```

```json
{
  "texts": "weave",
  "lang": "de",
  "of": "0.25.0",
  "names": {
    "post.reply": "Antworten",
    "peers.connected": "{n, plural, one {# Peer verbunden} other {# Peers verbunden}}",
    "chat.placeholder.post": "Zu diesem Beitrag schreiben…"
  }
}
```

`texts` says whose names these are (`weave`, or an app's id), `lang` a BCP 47 tag, `of` the version of the thing it translates (a Weave version; for a service, its release tag) so an outdated package is visible. Names are flat: no nesting, so a diff of two packages lines up, and a name is a plain string in code.

The renderer, the main process and the console bundle the files they need (esbuild imports JSON); the node bundles `en` for the texts it still writes for terminals. Languages are added by adding a file; the check lists what is missing. German comes first, written along with the names, screen by screen; the person it is for reads it in the running app, not in a file.

**The console** shares the Weave package: its names start with `console.`. **The phone** needs nothing of its own: it bundles the renderer. **The CLI** stays English until after the release: its sentences serve agents too.

**Later, packages as artifacts.** A language package is a release like an icon set: `weave.app.json` with `"texts": { "of": "weave" }` and the files, published by anyone, checked by digest, kept on each device. Resolution as for icon sets: your own overrides, packages you added, the space's choice, Weave's shipped package. That needs the trust marks the icon-set idea names and is not part of this item; the format above is made so it needs no change for it.

## Choosing the language

- **Desktop.** View → Language: *System*, *Deutsch*, *English*. The setting lives in the daemon's `Config` (`language`), like `updates.auto`, because three processes need it: the renderer, the main process (tray menu, folder and microphone dialogs, update prompts) and the daemon (the pages it serves at `weave.localhost`, and the console). *System* means Electron's `app.getLocale()`, which the renderer gets at start; the daemon alone falls back to the OS locale. The renderer sets `<html lang>` so spell-check, hyphenation and `Intl` follow.
- **Phone.** The phone's own language (`navigator.language`) by default, its own setting in its storage. A phone set to German next to an English desktop is normal; a phone that followed its node would surprise whoever picked it up. The pairing screen shows in the phone's language before any node is reached.
- **Console.** The browser's language, a switch in the header kept in `localStorage` like its theme.
- **Agents** can ask for the person's language (`weave_whoami` says `language`), so they answer in it. Not part of this item beyond the field.

Only `en` and `de` ship. Other languages with a package of their own later.

## Services: their own texts, never Weave's

What a service shows inside Weave's UI comes in two kinds, and they are handled differently.

**Texts in the manifest** (`weave.app.json`): action labels, input field labels, setting labels and hints, list titles and item words, add/remove/use labels, panel titles, open labels ("Play"), `start.hint`, `install.steps`. Today each is an English literal, and the manifest doesn't change: the literal stays the fallback. A release translates them with package files next to the manifest, named `weave.texts.<lang>.json`, whose names are the **field paths** of the manifest:

```json
{ "texts": "derby", "lang": "de", "of": "1.4.0", "names": {
  "name": "Derby",
  "about": "Pferderennen mit Wetten, für bis zu acht Spieler",
  "actions.bet.label": "Wetten",
  "actions.bet.input.amount.label": "Einsatz",
  "settings.token.hint": "Ein Token mit Lese-Zugriff",
  "lists.horses.title": "Pferde",
  "lists.horses.item": "Pferd",
  "lists.horses.add.label": "Pferd aufstellen",
  "services.derby.open.joiner.label": "Mitspielen"
} }
```

So nothing is added to the manifest or the contract for this: a release that ships no package shows its literals, as now. `weave_app_manifest`, given the folder, checks the packages too: valid grammar, every name a text field of this manifest, and the field's length limit holds for the translation (60 for a label, 200 for a hint, 40 for a list word).

Lookup: a service's packages travel with its release (the fetched, digest-checked folder; `pinned.ts` keeps top-level files, which these are) and the node hands them to the renderer with the service's manifest (`serviceTexts`, from the verified release only: like lists, a service without a checked manifest gets no texts). The renderer resolves locally, in the reader's language, since the node doesn't know the reader's language (the phone's differs): `ts(service, 'actions.bet.label')` is the package's text, else the manifest's literal.

**Texts a service makes at run time**: list items (title, badge, detail, done), choices, mark labels and tooltips, a lens's fold actions, a website's room names, an app's commentary. Two ways, both open to the service:

- **A name instead of a sentence.** Where a text field takes a string today, it also takes `{ "name": "item.offer", "values": { "repo": "weave" } }`, resolved from the service's package in the reader's language, with the same grammar. The mark fold stays cached per domain, and the text is translatable offline by anyone who ships a package for the service. This fits labels, item words, tooltips, actions.
- **The reader's language as input.** For text that is made up on the spot (an LLM's race commentary, a room's greeting), the service is told the language: `lang` in what Weave already hands it: the `viewer` of `marks.ask`, the `me` of `board.act`, the player on `on-join`, the `{query, cursor}` of a list call, `WEAVE_LANG` in a container's environment. Not in `fold`: it folds once for everyone. **This is a change to the contract and needs your yes** before it is built; the first way needs none.

**Nothing passes for Weave's own**, with the mechanisms main already has and three rules on top:

1. A service's package resolves only under that service's origin and only for the names of its own manifest fields or its own run-time records. No service package is ever consulted for a Weave name, and a Weave package never for a service's: the two tables don't touch.
2. A service's text is plain text, rendered exactly where its literal would be today: inside a card whose title carries the origin badge (Weave ✓, `p/<project>`, own code), inside Weave's own framing ("members can {label}", "asks for {label}") as a value, never as the frame. No markup from a service's package: the tags of the grammar are ignored there.
3. The same filters as for marks: control characters stripped, the check signs that mean "From Weave" refused (`SYMBOL`), the field's length limit applied to the translation. A translation that fails the check is dropped and the English literal shows; the service's card says "texts: not checked" in its origin line, so a broken package is visible, not silent.

**The Pferderennen** as the test: its manifest gets a `weave.texts.de.json` for its open label, actions, shop list and bet inputs; the things the race generates (commentary) take the second way once the contract question is decided. The app isn't in this repository: the test runs on its manifest and packages in a fixture, and in the app itself from its own repository.

## Texts the daemon writes

The daemon produces English for screens today in three places; each gets a name.

- **Errors.** `throw new Error('a thread needs a title')` becomes `throw new WeaveError('thread.title.missing', {}, 'a thread needs a title')`: the name and values travel in the API's `{ error, name, values }`, and `attempt()`, `useApi` and the error paragraphs render the name in the reader's language, else the English message. The CLI and the MCP server print the message. The renderer's one test on English wording (`/no post found/`) becomes a test on the name. Before the release: the errors the screens show on purpose (joins, posting, settings, keys, services); the long tail stays English with the fallback and is named as screens move.
- **Notifications.** `Notice` gets `name` and `values` next to its `title` and `text` (`mention.in`, `{ who, place }`); the renderer renders both lines for the system notification. The six `#noticeOf` shapes and the agent requests are a morning's work.
- **Problem, reason and note fields** (services, hints, marks, memberships, devices): `{ name, values }` records next to the string, rendered like notices.

Content stays content: board titles, the channel `general`, routine titles, enum values shown raw (owner, maintainer) get names in the UI (`role.maintainer`) but keep their stored values. `renderTitle`'s hard-wired `en-GB` dates and the daemon's link pages switch to the person's language from `Config`.

## The check

`scripts/check-texts.ts`, run by `npm test` and CI:

1. **No hard-coded text.** Walks the renderer, the main process and the console with the TypeScript compiler API: JSX text with letters, string literals in `title`, `placeholder`, `aria-label`, `label` and `alt` attributes, and string arguments to `toast`, `ask`, `attempt`, `Modal`, `Menu` are errors, unless they are a name. A per-file allowlist carries the screens not moved yet; it only shrinks, and the check fails on a file that is clean and still listed.
2. **Names and packages agree.** Every name used in code is in `en`; every name in `en` is used (dead texts go); `de` has every name of `en` (a warning while screens move, an error at the release); the placeholders and plural categories of a text match between languages (German has `one` and `other`; a `{n}` missing in one language is an error); every text parses.
3. **Service packages**: the same parser, in `weave_app_manifest` and in the node before a package is handed out.

Tests: the grammar (`packages/core/test/texts.test.ts`: placeholders, plurals in both languages, select, dates and numbers in `de-DE`, markup, nodes as values, malformed texts), the check itself on fixtures, and a renderer test that switches the language and reads the menu.

## Order of work

1. The layer, the packages' format and checks, the setting and menu, `<html lang>`, `useTexts` (one PR, no screen moved yet: the check's allowlist holds every file).
2. Screens, in the order people meet them: the shell and menus, Home, posts and chat, settings dialogs (notifications, marks, updates), keys and devices, memberships, services and websites, sessions, the rest. Each step moves the texts of a few files, adds their English and German, shrinks the allowlist, and is checked running in German.
3. The main process and `whyNotText`; the daemon's notices and the named errors.
4. Services: `serviceTexts`, field-path packages, the check in `weave_app_manifest`, the Pferderennen's package; `{ name, values }` records in lists, marks and actions.
5. The console.
6. If you say yes: `lang` in `ask`, `act`, `on-join`, list calls and the container environment.

Not in this item: the CLI's messages, posts and release notes in several languages, store listing and onboarding texts (a list of what else blocks the release is still open in the idea post), packages as artifacts.

## As built (1.11.2026)

What landed on the `worktree-texts` branch, where it differs from or adds to the plan above:

- **Every screen is on names**: the desktop renderer, the main process (`apps/desktop/src/texts.ts`: tray, window titles, dialogs, the `weave` command, following the setting through `weave:language` from the window) and the admin console (`apps/console/src/texts.ts`, the browser's language). The check's allowlist is empty; code shown as code (`<code>`, `<pre>`, `<kbd>`) is no text to it.
- **A service's packages travel as an event of their own**, `weave.app.texts` `{release, packages}`, published by a maintainer with the release (`publishApp` and `releaseArtifact` take `texts`; `weave_app_publish`, `weave app publish` and `weave_app_release` with `file` read the `weave.texts.<lang>.json` next to the manifest), or later. The manifest and the release event stay what they are; the GitHub releases service, pinned from its own repository, publishes releases as before. Readers take the latest package per language by a maintainer that passes the check against the release's manifest (`releaseTextsOf`); a broken one is dropped and the one before stands. Agents need `weave.app.texts` to sign them, like any kind.
- **The check** (`checkServicePackage`): a name under `name`, `about`, `start`, `install`, `settings`, `actions`, `lists`, `panels` or `services` must be a text field of the manifest, within that field's limit (`manifestTextFields`); a name under any other first segment is a run-time record's (200 characters). Settings in capitals are named lowercase with dashes: `settings.deepseek-api-key.hint`. Plain text only: no markup, no control characters, none of the check signs that mean "from Weave". `weave_app_manifest` with `file` checks the packages next to it and says which file and name is wrong.
- **In the UI** the packages come with a verified release's profile (`ServiceProfileInfo.texts`) and with an artifact (`ArtifactInfo.texts`); `useServiceTexts` resolves field paths (`ts`) and `{name, values}` records (`tr`) in the reader's language, with Weave's glossary and nothing else from Weave. Action labels and their fields, kept settings' labels and hints, a release's setting labels in the start dialogs, panel titles, a list's title, item word and button labels, and list items (title, badge, detail, done, more) are resolved so; a record's name no package has shows as the name.
- **The Pferderennen** is the fixture `packages/core/test/fixtures/derby` (its manifest and `weave.texts.de.json`), tried in the core, node and MCP tests. The app's own repository gets the same file next to its manifest.
- **Still English**: what the daemon writes (notices, the errors screens show in toasts) and what services make up at run time without a record; `lang` as a service input waits for the contract decision.

## Decided (1.11.2026)

- **Field-path packages next to the manifest**, `weave.texts.<lang>.json`; nothing is added to `weave.app.json`.
- **Weave translates nothing.** A service brings its German itself: its author or their agent ships the package. Later anyone may publish a package for a service, like for Weave, with the same trust questions.
- **A service may read Weave's glossary**, and only that: `{@weave:word.project}` in a service's text resolves to Weave's word in the reader's language; any other Weave name is refused. So a service's list says "Projekt" like every screen, and Weave stays free to rename everything else. The other direction stays shut: no service package is ever consulted for a Weave name.
- **The reader's language as input to services** (`lang` in `ask`, `act`, `on-join`, list calls, `WEAVE_LANG`) comes after the release, since it changes the contract. The `{ name, values }` records come now.
- **The phone** takes its own device's language.
- **The daemon's errors**: first the ones screens show on purpose; the rest stays English with the fallback and is named as the screens move.
- **German voice and words.** Du, not Sie. The glossary, under `word.` in `weave.texts.de.json`, so every screen uses the same word: project → Projekt, group → Gruppe, community → Community, board → Board, post → Beitrag, chat → Chat, member → Mitglied, maintainer → Maintainer, tier → Stufe, mark → Marke, hint → Hinweis, release → Release, keyvault → Schlüsselbund, desk → Schreibtisch, show → Show, room → Raum, session → Session, agent → Agent.
