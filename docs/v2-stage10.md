# v2 stage 10: company accounts

Built on stage 6 (managed spaces, attestor, hold) and stage 9 (approved agents, escrow, audit). From the comments on Julian's "Business Version": company-owned identities, linking a private account, a company space owned by the company itself, and the company's own starting setup.

## 1. The company itself

A company is a Weave identity of its own ("Acme"), run on the company's always-on node: the attestor (stage 6) and archive in one. No employee holds it.

- `weave company create <name> <vault|azure …> --issuer <url> --audience <id> --admins <group>`, on the company node: creates the **company group** (the company space) under the company's key service, with the company as its attestor, and writes the company's settings.
- Everything the company decides is signed by the company, in the company group: `weave.org.settings {admins, links}`, `weave.org.map {group, space, role, on}`, `weave.org.start {contacts}`.
- **Admins** are the people the company vouches for (their sign-in) in the admins group. They ask the company for what only the owner may do: `weave.org.request {action, …}`, carried out by the company node, which answers `weave.org.done {request, error?}`. The audit shows who asked and what the company did. Actions: settings, map, start, create a company space, hold, destroy the company key, freeze an identity.
- Company spaces (projects and groups the company creates) are managed by the same key service, with the company as attestor; who is vouched for comes from the company group.
- The first admin runs the setup; after that nothing ties the company to them.

## 2. Membership follows the company's groups

The company node keeps company spaces in line with sign-in groups:

- `map {group: "Engineering", space: Engineers, role: member|maintainer}`: everyone vouched for in that sign-in group is admitted (`weave.project.admit`, now also by a group's owner), with the keys gifted in the company group; maintainers are appointed in projects.
- Admins are admitted to every company project as maintainers.
- Someone who leaves a mapped sign-in group is removed from the space again (only those the mapping brought in); people the company no longer vouches for are removed everywhere (stage 6).

## 3. Company-owned identities

- `weave company link` (an admin, or the company node) gives an **enrollment link**: the company, its group and a long-lived invite.
- `weave enroll <link> --id-token <token>` on a new home: creates the identity with `org: <company>` in its first record, joins the company group, signs in, and leaves the recovery words with the company (stage 9 escrow) as soon as the group is unlocked. **The words are never shown**; until escrowed they're kept sealed at rest, then deleted.
- The installer's bundle (contacts, tiers) is skipped; the company's starting setup (`weave.org.start`) is applied once it arrives.
- Shown everywhere as company-owned: `whoami`, profiles and members carry `company: {did, name}`.
- **New laptop**: `weave recover-request` on the new home gives a request code; an admin runs `weave escrow-open <space> <person> --for <code>`, which hands the words boxed to that request only (for a company-owned identity, words are never shown, not even to admins); `weave recover <answer>` sets up the device. Opening is in the audit.
- **Leaving**: `freeze` makes the company sign `weave.org.freeze {person, afterSeq}`, public: every node then ignores what that identity signs after it. Only the company named in the identity's first record can freeze it. Its history stays.

## 4. Linking a private account

- `weave.link {to, on}`, signed by each side in its own log, public by default; with `--in <space>` it's sealed into that space instead, for its members only.
- A link counts when both sides have it on (one side alone is shown as pending). Either side ends it with `on: false`.
- A company can turn linking off (`settings.links: false`): its node then refuses links of its identities, and the company says so publicly (`weave.org.policy {links}`), so others don't count them.
- After a freeze, the link stays as history: since when, until the freeze.
- `weave link <person or contact link> [--in <space>] [off]`, `weave links [person]`.

## 5. Starting setup from IT

The bundle file can also come from the machine: `WEAVE_BUNDLE`, or `weave.bundle.json` in `%ProgramData%\Weave` (Windows), `/Library/Application Support/Weave` (macOS) or `/etc/weave` (Linux), before the one shipped with the app. Device management places it; updates don't overwrite it.

## Order of work

1. Core: `org` in the identity record, `weave.org.freeze` in authority, links, admit in groups.
2. The company: create, settings, requests, company spaces, attestations from the company group.
3. Membership from groups; admins.
4. Enrollment, escrow without showing words, recovery by request, starting setup, machine bundle.
5. Linking.
6. CLI; tests against the stand-ins.

## As built

- **The company** is an identity on the company's node: `weave company create` makes its group (managed, the company its own attestor) and its settings. Admins' requests (`weave.org.request`) are carried out by the company's node on its next reconcile and answered with `weave.org.done`; both are in the audit.
- **Membership**: the company's node admits people a mapping or the admins group puts in a company space (a group's owner may now admit directly), gifts them the keys in the company group, appoints admins as maintainers of company projects, and removes people a mapping brought in once it no longer applies. Company spaces read who's vouched for from the company group.
- **Enrollment** waits for the company group's events before writing anything there (it's under the company's key service): then it unlocks with the person's sign-in, joins, signs in, escrows the words and applies the starting setup. Until then the words are sealed at rest in `enroll.json`, which is deleted afterwards. The app's bundle isn't applied.
- **Recovery** of a company-owned identity only through a request from the new computer: `escrow-open --for` boxes the words to it; they're never shown.
- **Freeze** is a public key event: every node drops what the identity's keys sign after the numbers the company saw (keys it never saw count from nothing). Only the company named in the identity's first record can freeze it, whatever order the events arrive in.
- **Links** are read from everything a node can decode (public, or sealed into its spaces), built once per change; a company's public `weave.org.policy` turns its identities' links to "refused" everywhere.
- **IT's bundle**: `WEAVE_BUNDLE`, or the machine's Weave folder, before the one shipped with the app.
- CLI only for now; the desktop app doesn't have an enrollment screen yet.
- As with stages 6 and 9: tested against the Vault and OIDC stand-ins, not a real company tenant.
- Measured on 10k events: feed again 93 ms, posts 37 ms (as before).
