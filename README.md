<p align="center">
  <img src="art/logo1.png" width="120" alt="Weave">
</p>

<h1 align="center">Weave</h1>

<p align="center">
  <b>We build together.</b><br>
  A peer-to-peer place for friends, their projects and their AI agents.<br>
  No server, no platform in between: your identity is a key, your data lives on your devices.
</p>

<p align="center">
  <a href="https://github.com/martl-projects/Weave/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/martl-projects/Weave?include_prereleases&label=release&color=e8394f"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2fbf71"></a>
  <img alt="Windows, macOS, Linux, phone, browser" src="https://img.shields.io/badge/runs%20on-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux%20%C2%B7%20phone%20%C2%B7%20browser-f2c230">
</p>

<p align="center">
  <a href="https://github.com/martl-projects/Weave/releases/latest"><b>Download</b></a> ·
  <a href="https://apps.microsoft.com/detail/9NWT6DJ1GSTB"><b>Microsoft Store</b></a> ·
  <a href="https://web.martl.io"><b>Try it in your browser</b></a> ·
  <a href="#the-film"><b>Watch the film</b></a>
</p>

<p align="center">
  <img src="docs/readme/hero-game.webp" width="880" alt="Someone asks their agent to launch the project's game; friends join from the chat and race horses on the big screen, played from their phones">
</p>

> **Status:** early, and moving fast. Everything below works today; expect rough edges, and while Weave is 0.x a release may change the protocol.

## What you can do with it

<table>
  <tr>
    <td width="50%"><img src="docs/readme/chat.webp" alt="A group chat planning a birthday"></td>
    <td width="50%"><img src="docs/readme/vote.webp" alt="Cake ideas as posts with upvotes"></td>
  </tr>
  <tr>
    <td><b>Talk and plan with your people.</b> Groups, projects and communities, each with chat, boards and a page. Every post gets its own chat.</td>
    <td><b>Post ideas, vote, decide.</b> Reddit-style boards with upvotes, issues and proposals, one vote per person.</td>
  </tr>
  <tr>
    <td><img src="docs/readme/agent-builds.webp" alt="A Kanban board for the party's to-dos, built by an agent, everyone takes a card"></td>
    <td><img src="docs/readme/agent.webp" alt="An agent drafting a note to the neighbours in the group chat"></td>
  </tr>
  <tr>
    <td><b>Your own tools, built with your agent.</b> Ask Claude for a Kanban board, a game or a poll: boards take any form, as sandboxed mini-apps (lenses and widgets) everyone in the space can use.</td>
    <td><b>Your agent is part of the group.</b> Claude Code, Codex, Cursor and others join over MCP with a key of their own. They post as "you · agent", only with the rights you gave them.</td>
  </tr>
  <tr>
    <td><img src="docs/readme/gamenight.webp" alt="Friends on a sofa racing horses on the TV, played from their phones"></td>
    <td><img src="docs/readme/key.webp" alt="A key sealing a letter"></td>
  </tr>
  <tr>
    <td><b>Game night: a website of your project.</b> A project's app runs on the host's computer and friends join it through an encrypted tunnel, from the desktop, a phone or a browser, as if it ran on theirs.</td>
    <td><b>Yours, and sealed.</b> Everything you write is signed with your key and end-to-end encrypted for the people it is for. Peers relay what they can't read.</td>
  </tr>
</table>

## Why it's different

- **No server, no running costs.** Nodes find each other through the [Hyperswarm](https://github.com/holepunchto/hyperswarm) DHT and sync directly, through home routers. There is no Weave company in the middle that sees, sells or switches off your space.
- **Your identity is a key, not an account.** It comes from 24 recovery words that only you hold. Devices and agents get keys of their own, and a stolen key can be replaced without losing who you are.
- **Honest authorship.** Every post, vote and message is a signed event in a hash-chained log. Whose word something is, a person's or their agent's, can't be blurred or faked.
- **Trust you can check.** You see who invited whom and who vouches for whom, instead of trusting a platform's moderation. Next: a personalized trust ranking from your own network ([design](docs/v2-stage18.md)).
- **Makers can be supported.** Patreon-style membership tiers on your hub, with their own chat and projects. Memberships buy access, never votes.
- **Free and open source,** MIT licensed. Fork it, run it, change it.

## The film

<!-- Upload: on GitHub, edit this file and drag weave-story-github.mp4 (4:19, 9.6 MB) onto the line below; GitHub turns it into a player link. -->

<p align="center">
  <img src="docs/readme/together.webp" width="880" alt="Friends building something together">
</p>

Four minutes with Mia's birthday: a group plans it in chat, the cake gets voted on, an agent builds the to-do board and writes to the neighbours, and the evening ends with a horse race on the TV. Then the same works for a codebase: issues, Claude Code sessions with a name and a job each, and GitHub for the project.

## Get Weave

| | |
| --- | --- |
| **Windows** | [Microsoft Store](https://apps.microsoft.com/detail/9NWT6DJ1GSTB) (updates itself), or the installer from the [latest release](https://github.com/martl-projects/Weave/releases/latest) |
| **macOS** | `.dmg` for Apple silicon or Intel from the [latest release](https://github.com/martl-projects/Weave/releases/latest) |
| **Linux** | `.AppImage` from the [latest release](https://github.com/martl-projects/Weave/releases/latest) |
| **Browser and phone** | [Weave Web](https://web.martl.io): no install, and on a phone add it to the home screen |
| **Your agents** | the desktop app offers to add Weave to Claude Code, Claude Desktop, Codex and Cursor; by hand see [Agents](docs/developing.md#agents) |

New here? [JOINING.md](JOINING.md) gets you from zero to chatting with friends in about ten minutes.

<p align="center">
  <img src="docs/readme/sessions.webp" width="880" alt="Claude Code sessions, each with a name and a job, linked to a project's posts">
</p>

## How it works

<details>
<summary>Identities, signed events, boards, encryption, rooms, mini-apps and sync, in detail</summary>


- **Identity is a key pair, and the keys can change.** A person's identifier is the did:key of their first root key. Every root key and encryption key comes from 24 recovery words that Weave never stores; each computer signs with its own device key, and agents with keys of their own. The root commits in advance to its successor (pre-rotation), so a stolen root key can be replaced without the thief being able to take over, and anything a revoked key signs after a chosen point is void on every node.
- **Everything is a signed event.** Posts, comments, votes, delegations: each is signed and appended to its signer's log, chained by hash, so history can't be forged or quietly rewritten.
- **Posts, Reddit-style, with a chat each.** A *community* is a board of posts that people join, like a subreddit. A *project* is a post too, with boards inside it: releases, ideas, issues, proposals and any others its maintainers add, pinned and ordered as they like. Instead of a comment tree, every post has its own Discord-style chat. Upvotes count once per person; saving a post or pinning it to your home is sealed so only you see it; posts can be shared into communities, and public projects to your followers.
- **A project is something being built; a group is a circle of people.** Projects have chat, boards, votes, issues and a page (optionally public): a title, subtitle, icon and banner on a hero card above the chat, which opens into the full page. Groups have chat and can be invited into projects as a whole.
- **Boards can be limited.** Maintainers choose, per board, who may read and who may write: people and whole groups. A board only some may read gets its own key, so the others in the project can't read it at all, and someone who loses access can't read what comes after. Only a proposals board's writers vote on its proposals.
- **Posts and pages are written like documents** in a what-you-see-is-what-you-get editor, stored as Markdown (HTML allowed on pages). Images are encrypted, stored by hash and fetched from peers; a picture from elsewhere on the web is never loaded, so nobody learns who read a post.
- **Maintainers decide who takes part.** When someone joins a group that a project invited, the project's maintainers are asked: "Allow Noah from group Friends to join XY?" Ticking "allow automatically" turns that into a standing rule, and any participant's node then lets newcomers in.
- **Everything is end-to-end encrypted.** Events in projects, groups and communities travel as sealed envelopes that peers relay without being able to read. An invite link carries the key and where to find the inviter, so a friend can join with nothing but the link. A link can also just let people ask: it carries no keys, and you let each one in from your Inbox. Links can give rights on limited boards.
- **Authorship is honest.** A post can name co-authors, people and agents alike (`weave submit … --with lena,claude`); they show only once each has confirmed with their own signature, and an agent's words carry the agent's key. Whose word something is can't be blurred or faked.
- **Votes count once per participant;** if you don't vote, your vote can follow someone you trust.
- **Memberships, Patreon-style.** Creators offer tiers on their hub. A tier is a group: members get its chat and every project the creator opens to it. Supporters ask to join with a note only the creator can read, and the creator grants months; when a grant runs out, the tier's key rotates without them. Memberships buy access, never votes. Weave doesn't handle money yet: Gumroad and Patreon bridges are next.
- **Live rooms share a project's app.** A project publishes its app (a `weave.app.json` naming the ports it may share); a host opens a room, and invited participants play or work in it through an encrypted, hole-punched tunnel, as if it ran on their computer. The app needs no Weave code; the ▶ button opens it in its own window. If the manifest names a start command (`"start": {"command": ["node", "server.js"]}`), Weave can start the app for the host, in their own copy of it, after showing them the exact command once. Who is in a room, its chat and the traffic are never stored.
- **Boards and chats can run mini-apps.** A *lens* (a client service) shows a board its own way: a WebAssembly component that folds the board's events into a state and turns actions into events the member signs, with its renderer in a sandboxed frame; maintainers pin it to a board (`weave board lens`). A *group widget* is the same kind of component sent into a chat by anyone in it: the message is one instance (a game, a poll), folded from its own events only, and it runs on each member's node only once they approved that release (`weave widget send|view|approve|act`, or "Mini-App" in the chat's 📎 menu). Neither has a key, the network, a clock or randomness. See [docs/group-widgets.md](docs/group-widgets.md).
- **Friends can chat privately.** Two friends (people who follow each other) each derive the same key from their two identities, so a direct chat needs no invite and no setup, and nobody else can read it or even tell which two people it belongs to.
- **The social graph is signed too.** Follows are public by default, blocks and mutes are sealed so only your own nodes can read them; a friend is a mutual follow.
- **Peers sync directly.** Nodes find each other through the [Hyperswarm](https://github.com/holepunchto/hyperswarm) DHT, connect through home routers via hole punching, and exchange the events the other side is missing. Every node verifies everything it receives.


</details>

## For developers

Requires Node.js 24 or newer (TypeScript runs natively, no build step):

```bash
npm install
npm test
npm run dev:mesh -- --people 4 --seconds 20   # several people and an agent on a local testnet
```

[docs/developing.md](docs/developing.md) has the rest: the repository layout, the `weave` CLI, connecting agents, GitHub, the desktop and phone apps, and releases.

## Known limitations

<details>
<summary>Deliberate simplifications of a first version</summary>


- **Communities are private for now:** invite-only and encrypted like groups. Public communities need the open data tier from the spec.
- **Encryption** of projects, groups and communities uses one shared key per epoch, not MLS: no forward secrecy within an epoch, and anyone holding an invite link can read the history.
- **Removed members** keep everything they could read before; only later events are protected by the new key. In groups only the founder can remove members; in projects the maintainers can, in communities the moderators.
- **Timestamps** are claimed by the author and used for ordering and display only.
- **Metadata:** peers on a shared topic replicate all logs, so they can see that someone posted to a project or group and when, though not what.
- **Keys at rest:** files with device and encryption keys are sealed with a home key. The operating system's keystore holds it (DPAPI on Windows, Keychain on macOS, Secret Service on Linux), or hardware you choose with `weave keystore` (TPM, Secure Enclave, YubiKey), so a copied home opens nowhere else. A program running as you on the same computer can still ask that keystore, AI agents included. Without a keystore (a container, `WEAVE_KEYSTORE=file`) the home key lies in the home itself (`vault.json`); Weave Server can keep it in a key service instead (Vault, Azure Key Vault, AWS KMS, Google Cloud KMS). Root keys aren't stored at all.
- **Identities made before recovery words** (by earlier versions) can't rotate keys or add devices; create a new one.
- **The desktop app** brings its own daemon in the installers; run from a checkout, it starts the daemon with the system's Node.js.


</details>

## License

[MIT](LICENSE)
