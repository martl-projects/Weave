# Changelog

Every release of Weave, newest first. Versions follow semantic versioning; while it is 0.x, any minor release may change the protocol.

## v0.10.0 · 2026-10-22

- v2 stage 7: range-based set reconciliation (Negentropy-style)

## v0.9.0 · 2026-10-22

- v2 stage 6.4: legal hold and archive nodes; company commands
- v2 stage 6.3: company sign-in (SSO) and offboarding
- v2 stage 6.2: managed spaces with split keys
- v2 stage 6.1: key providers (local, Vault Transit)

## v0.8.0 · 2026-10-22

- v2 stage 5: keepers

## v0.7.0 · 2026-10-21

- v2 stage 4.3: held by, and load older, in the app
- v2 stage 4.1-4.2: content held by members in big spaces
- v2 stage 4: design

## v0.6.0 · 2026-10-21

- v2 stage 3.4: shredding, with carry-forward
- v2 stage 3.3: how long things stay, shown
- v2 stage 3.1-3.2: board rules, lifetimes, and forgetting
- v2 stage 3: design

## v0.5.1 · 2026-10-21

- Desktop: what newcomers read, and where keys are kept

## v0.5.0 · 2026-10-21

- v2 stage 2.4: keys at rest
- v2 stage 2.3: what newcomers read, set per space
- v2 stage 2.2: close the grace key
- v2 stage 2.1: direct chats keep their id and history when an encryption key rotates
- v2 stage 2: design

## v0.4.0 · 2026-10-21

- v2 stage 1.7: end to end over a testnet, and notes on what was built
- v2 stage 1.6: moving a home to v0.4
- v2 stage 1.5: meeting points move with a space's key
- v2 stage 1.4: members-only sync (PeerSession2)
- v2 stage 1.3: the node writes v2 and reads records of both versions
- v2 stage 1.1-1.2: v2 events in the store and replica, records of both versions
- v2 stage 1: design
- v2 stage 0.6: benchmark, and two fixes it found
- v2 stage 0.5: keep each person's own events instead of scanning every log
- v2 stage 0.4: cache each space's state and entries, and whole-scan results
- v2 stage 0.3: decode each new event once instead of everything again
- v2 stage 0.2: keep events in SQLite (node:sqlite), with import and export
- v2 stage 0.1: the v2 event format in core, with its design

## v0.3.2 · 2026-10-21

- Make weave decline <tier> <who> reachable again
- Show issues and proposals in the board they were filed on
- Build installers on release tags again: tell electron-builder 27 we publish ourselves

## v0.3.1 · 2026-10-21

- Ask to update when a newer Weave is out
- Refuse over-long posts instead of cutting them silently, and count characters
- Show Memberships in the app's look, not in default hub colors
- Add a Clean look: corporate, efficient, minimal
- Drop the Arcade look's mouse glow and falling blocks
- Add an Arcade look: a CRT cabinet with a rippling Tetris well
- Let apps ask hosts for settings like an API key, kept on the host's computer
- Let apps ask Weave who their players are: the app API and @weave/sdk
- Tell joiners when the host's app isn't running, instead of a blank window
- Move to electron-builder 27, which drops the deprecated libraries
- Use Weave's own title bar, with working window buttons

## v0.3.0 · 2026-10-20

- Bring the weave command along with the installed app
- Let people change what each agent may sign in Keys & devices
- Show a project's icon wherever the project appears
- Say plainly that Weave installs from a release with build files
- Let agents dress project pages and wait for releases
- Let maintainers pick a GitHub release in Live
- Embed posts in posts, project pages and chat
- Share posts with a weave:post: link
- Teach and check app manifests, every problem at once
- Let releases carry their manifest and ship standalone builds
- Let agents bring Weave to the front for their person
- Follow or unfollow a whole project or community
- Let people follow a project's boards, onto Home
- Let agents ask their person for a permission
- Let the MCP server find the daemon again after it restarts
- Let agents link repositories and release apps over MCP
- Offer to add Weave to the agent apps on this computer
- Say how to fix acting as an agent the node doesn't have
- Keep dialogs and hub text readable in both looks
- Say who owns the GitHub App, allow your own, and simplify the hub link
- Install a project's app from its GitHub release
- Notify people about what concerns them
- Let authors credit co-authors after posting, and link their names
- Let GitHub repositories follow a group, tier or project
- Let posts name co-authors who confirm with their own signature

## v0.2.0 · 2026-10-19

- Give the app a phone layout
- Pair phones from Keys & devices
- Let paired phones use a node remotely
- Ship martl as everyone's first contact
- Sell membership tiers through Gumroad
- Let posts carry an attached image
- Filter Home by source and let people hide spaces from it
- Let people edit and delete posts
- Load images in chat messages
- Let people leave spaces, hand them over and close them
- Add a Cozy look for the app
- Ask in an in-app dialog instead of confirm(), so End room works everywhere
- Let the host start a project's app from its manifest
- Fit the generated project icon into the hero card's frame
- Document project pages, images, board access and ask-first invites
- Add a project hero card, a WYSIWYG editor and board access to the app
- Let nodes share images, richer project pages, board access and ask-first invites
- Add encrypted blobs, board access and knock links to the protocol
- Build unsigned desktop installers for Windows, macOS and Linux

## v0.1.0 · 2026-10-19

- Add CI and versioned releases
- Show all your projects on your own hub, with their permissions
- Document live rooms
- Host and join rooms from the app and the CLI
- Add rooms: share a project's app with participants through a tunnel
- Create one invite link per dialog instead of one per live update
- Ship Martin's contact and the free Weave friends tier with the app
- Ship contacts and free tiers with the app, applied on first start
- Call a person's page their hub instead of their space
- Point JOINING.md at the GitHub repository
- Lock @scure/bip39 for the recovery words
- Document recovery words, device keys and key rotation
- Show recovery words at onboarding; restore, revoke and rotate in the app
- Add init with recovery words, restore, keys, revoke and rotate to the CLI
- Create identities from a recovery kit; rotate, restore and revoke keys
- Add pre-rotation identities, device-managed agents and encryption keys
- Stop contact and invite links from moving nodes onto other networks
- Add a guide for friends joining Weave
- Show tiers on spaces, membership requests in the Inbox, and a Memberships page
- Add tiers, support requests and grants to the CLI and MCP
- Add membership tiers, Patreon-style
- Reconnect the desktop app when its daemon restarts
- Add direct chats between friends
- Make title bars, pane heads and banners solid, Windows 95 style
- Use SerenityOS icons in the desktop app
- Share contact and invite links by copying only
- Find people by name and add them with a contact link
- Document communities, posts, boards and the retro app
- Return a project's own post with its page
- Redesign the desktop app as a Win95 window with Reddit-style posts
- Add communities, posts and boards to the CLI and MCP server
- Add communities, posts, boards, upvotes and saves
- Keep reading groups made before groups and projects were told apart
- Document groups and projects
- Separate groups and projects
- Seed a second channel, reactions and a reply; document the new chat
- Rebuild the desktop app in React with a Discord-style chat
- Add channels, replies and reactions to the node, API, CLI and MCP
- Add chat channels, message replies and emoji reactions to core
- Document connecting agent harnesses over MCP
- Require a running daemon for weave mcp
- Let only one process write to a home; serve the API before going online
- Look for peers again shortly after joining and while alone
- Add MCP server so agent harnesses can take part
- Let a permission family cover its root kind
- Seed demo groups with discussion, chat, votes and issues; document them
- Add discussion, chat, votes and issues to the desktop app
- Always show your own group events to you
- Add thread, reply, chat, issue, propose, vote and delegate commands
- Add threads, chat, issues and votes to the node and its API
- Add threads, chat, issues and votes to core
- Typecheck the desktop app
- Add demo seed script and document the desktop app
- Add Electron desktop app
- Count only public posts in profiles
- Add themes, profiles and a people directory to the node
- Document groups, people commands and known limitations
- Add group, follow, block, mute and people commands to the CLI
- Add groups, invites and social edges to the node and its API
- Add group encryption, invites, membership and social edges to core
- Add weave CLI and local testnet script
- Add node package: on-disk logs and keys, daemon and local API
- Restore delegations when a replica opens an existing store
- License under MIT
- Add Hyperswarm transport, dev mesh simulation and README
- Add log replication protocol between peers
- Add core: key identities, signed event logs and delegation
- Scaffold npm workspace with core and net packages
