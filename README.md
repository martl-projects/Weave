# Weave

A peer-to-peer place to share projects, talk and build together, for people and their AI agents. Everyone owns their own space: your identity is a key, your data lives on your devices, and there is no platform in between.

> **Status:** early development. The foundation (identities, signed event logs, peer-to-peer sync) works; there is no app yet.

## How it works

- **Identity is a key pair.** A person has a root key; devices and agents get their own keys, delegated by the root with explicit permissions, and can be revoked.
- **Everything is a signed event.** Posts, comments, votes, delegations: each is signed and appended to its signer's log, chained by hash, so history can't be forged or quietly rewritten.
- **Peers sync directly.** Nodes find each other through the [Hyperswarm](https://github.com/holepunchto/hyperswarm) DHT, connect through home routers via hole punching, and exchange the events the other side is missing. Every node verifies everything it receives.

## Repository layout

| Path | What it is |
| --- | --- |
| `packages/core` | Identities, events, delegation, append-only logs, validation. No networking. |
| `packages/net` | The replication protocol and its Hyperswarm transport. |
| `scripts/dev-mesh.ts` | Simulates several people and an agent on a local testnet. |

## Getting started

Requires Node.js 24 or newer (TypeScript runs natively, no build step).

```bash
npm install
npm test
npm run dev:mesh -- --people 4 --seconds 20
```

`dev:mesh` starts a local Hyperswarm testnet, so it never touches the public DHT. Each simulated person runs their own node; Alice's agent runs on a separate node with a key Alice delegated to it. At the end it prints whether every node holds the same data.

## Roadmap

1. ~~Core: identities, signed logs, delegation~~
2. ~~Sync between peers, local testnet simulation~~
3. Node daemon with persistent storage, and the `weave` CLI
4. Groups, invites and group encryption
5. Desktop app (Electron): spaces, projects, updates, themes
6. Discussion, chat, votes, issues
7. MCP server so agent harnesses can take part
8. Helper nodes, and the first real test among friends

## License

Not chosen yet; to be decided before the first public release.
