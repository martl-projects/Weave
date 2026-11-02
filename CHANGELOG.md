# Changelog

Every release of Weave, newest first. Versions follow semantic versioning; while it is 0.x, any minor release may change the protocol.

## v0.30.0 · 2026-11-02

- Agents read a chat in slices: since and until (a time, or how long ago), and people only, in weave_chat and weave chat

## v0.28.1 · 2026-11-02

- The MCP test of opening a keyvault brings its own shipped list: CI never builds packages/shipped/dist
- martl in the app's bundle again, through his front door: a new install knows him and reaches his always-on node, never his computer; weave-server join reads a long answer from a file or stdin
- An always-on node gets its person's public side whole: each key's events form a chain, and the identity events alone left gaps the delegations waited behind
- An always-on node links for someone whose history is from before v0.4: the answer brings the v1 originals its v2 identity events restate
- Who reaches your Weave and your front door, in the app: "People you know" or "Anyone" in Keys & devices, the front door with its link beside your always-on node, and My contact link giving the front-door link once you have one
- An agent guides its person to the one dialog: weave_open_in_app opens a keyvault (make the GitHub App, hand a project a repository) or a project's services, "Add github-access" saying which agent asks
- Getting a file artifact shows its size and how far the download got, instead of a greyed button for a minute
- Open link in the toolbar: paste any link someone sent, or the whole message, and Weave does the right thing (an invite asks to join, a contact link adds them, a post or space opens)
- Your contact link is one click away: My link in the toolbar, next to Invite (it was only on People)

## v0.28.0 · 2026-11-02

- A node shares only its person's public side and that of whom the peer shares something with, and an always-on node is a front door: found at a public meeting point that only front doors announce
- Ctrl+V with a file or picture on the clipboard attaches it to a chat message: a screenshot gets a name for when it was taken, text on the clipboard still pastes
- A release of a website or service that Weave couldn't run is refused when it's published: it needs a container image or WebAssembly
- A post's group picture is kept under who's in it: people without an avatar no longer share one picture (Julian's post showed Phil's)
- On Windows, pages open in the default browser: through explorer, not rundll32's url.dll, which read the old association and often opened Edge
- A node new to Weave learns the names of people from before v0.4: v1 logs travel also for keys that signed their v1 events again as v2, whose v2 versions it takes only with the v1 originals
- udx-native 1.22.0 (libudx: a stream isn't destroyed again while its destroy packet is queued), hyperdht 6.35.0, dht-rpc 6.28.0, and the MCP SDK's body-parser and fast-uri past their advisories

## v0.27.4 · 2026-11-02

- A space set to everything after it let newcomers read only from when they came: those already in get the keys from before their invite too, once

## v0.27.3 · 2026-11-01

- The founder's node looks for old carries once per space and run, not on every pass; what a founder's word for an envelope from before protocol 3 can't prove is written down
- A newcomer to a space that lets them read only from when they come learns what came before protocol 3 again: the founder's carry vouches for envelopes without an inner hash, and the founder's node restates it all once in today's shape
- Pull requests from forks run on GitHub's runners, never on ours: on a public repository their code is anyone's
- From a peer behind in a space, only a join with an invite the space made is taken, and at most 16 per connection: someone behind may be someone removed, and control events aren't rate-limited

## v0.27.2 · 2026-11-01

- A join that reaches the maintainer only after the next new key still gets in: its join is taken in, and the keys it missed are handed over

## v0.27.1 · 2026-11-01

- A node is found at every key of a space that only those still in it hold, so a member who missed several new keys (offline a while, an older Weave) finds the others again
- A chat message you send shows at once, also when the daemon's event stream is down (it was saved but not shown, so it got sent twice)
- Weave lives at martl-projects/Weave: downloads, the server image, the runners' scripts and the console's link point there
- A daemon without the services Weave ships says so: in its status, as a banner in the app, and in its log at start

## v0.27.0 · 2026-11-01

- Trust starts before the first packet: a node is found at a meeting point only its links carry (never at its DID), turns away peers that share nothing with it and hold none of its links, and adding a contact tells only the two of them instead of following publicly; the app connects newcomers to no one
- A node announces every key it holds of a space, so a member who missed more than one rotation still gets the rekeys
- A post's picture sits beside its title only; the text below runs the post's whole width

## v0.26.0 · 2026-11-01

- A post's group picture beside its title is as big as a scene alone, not the post's whole width (it squeezed the text)
- A post by an agent pictures it as it's credited: the person and their agent's robot together, the robot in the scene
- A robot's screen can be dark with its face glowing in the screen's colour, a choice in its editor (Weave avatar v1.17)
- Keys & devices reads in order: identity first, the long words behind an ⓘ, keepers by name, the node with its steps; maintainers remove people and uninvite groups in a project's People settings
- The avatar editor frames the agents' robot (Weave avatar v1.16)
- Agents and sessions are Rob13, painted like the people (Weave avatar v1.15)
- Agents and sessions are robots (Weave avatar v1.14): their editor picks the screen's and the robot's colours, eyes and mouth
- The overlay's backdrop further down and out to the edges (and the work item's picture drawn even while its half is still empty)
- The overlay: behind its content, faded and pinned to the bottom, the session's whole figure on the left and its work item's picture on the right
- A service's own texts: packages next to its manifest travel with its release, checked, resolved in the reader's language
- Agents and sessions get avatars with a screen for a head: agents' (public, set by their person in Keys & devices) on their posts, messages and scenes; sessions' (private, in the Sessions view and the overlay) so you know them again. An agent's post or message names the session it was written in. (Weave avatar v1.13: screen heads, a curved CRT screen)
- The admin console on names, in the browser's language; nothing hard-coded is left
- The main process on names: tray, titles, dialogs and the weave command follow the language
- Avatar pictures are drawn only once (nearly) on screen and kept on disk (IndexedDB, per renderer release, the 1500 most recently used): the next start shows them without loading the renderer (Weave avatar v1.12: bounded memory)
- Hub, people, inbox cards, project home and settings, boards, communities, New and Invite on names
- Groups in the sidebar show their photo, or their people's faces (two overlapping, or one), not a pixel sprite
- Chats in the sidebar show the other person's avatar, not a pixel sprite
- Websites, releases, artifacts, launching and installing on names; code shown as code is no text
- Project banners: a veil in the banner's own colour over the members and background together (white on a light banner), instead of see-through figures
- Project banners: the members faded (softer, fading out toward the top) so the text over them stays readable
- Project banners for big projects: up to 36 members in tight rows from edge to edge, a row behind when one is full, in a slight V (Weave avatar v1.11)
- Services, fetchers, kept settings, who may and actions on names
- Project banners: members from the navel up over the bottom edge, the same size however many, wider for more (Weave avatar v1.10)
- A project's members peek over its banner's bottom edge (one row, heads and shoulders, sized to the banner, behind its text); a post written together shows all its confirmed co-authors in its picture (Weave avatar v1.9)
- Keyvaults, their apps and handing, Safe proposals and ticketed shows on names
- Paying from a wallet, setup packs, visitors, lists, attachments, badges, lenses and announcements on names
- Add a service, the editor, the side panel, the wallet and a hub's projects on names
- A post's picture: its author's avatar in a scene (the default; chosen nothing, like every post from before, a calm one picked by its id), an image, or none; embedded post cards show it too
- The catalog, a project's treasury and split, the avatar editor on names
- Agent apps, phones and accounts elsewhere on names
- Everyone has an avatar: without one of their own, the figure their key makes (the pixel sprite only while it's drawn); agents give a post without an image a scene that fits
- Group photos: those who run a space give each one a pose, a photo pose or any scene with its things (Weave avatar v1.8)
- Routines and the desk on names: the editor, the list, the Routines page, Set up your desk
- Sessions on names: the session map, naming a session, a new Claude Code session, who takes an item
- Memberships on names: tiers, joining by Gumroad or on chain, the tier dialog, requests in the Inbox
- Space photos: a project's members can stand in the middle of its banner, those who run it choose who stands where, and the photo above the member list is a choice (on for groups and communities, off for projects)
- Keys & devices on names: onboarding, the company account, keystores, keepers, devices and agents, always-on nodes
- The settings dialogs on names: Notifications with its rules and hint services, Marks, Updates
- A space's photo: everyone's avatars (the default) or a picture of its own, the banner's text, and a background behind the group photo that's a project's banner too (weave.space.photo, set by those who run it)
- Times in the reader's language: ago, the clock and day labels go through the texts layer and its locale
- Better invites, part 1: an invite link in a chat is a card that asks "Join?" (ye1AFnk1)
- Posts and chat on names: rows, actions, dialogs, issues, votes, the composer
- The shell, Home and the shared dialogs on names: menus, tree, status bar, Follow
- Group photos above every space's members (groups, projects, communities, tier lounges), holding a banner with its name; tiers show their creator's avatar and their members' faces (Weave avatar v1.7)
- A localization layer: texts by name, English and German packages, the language a device setting
- Avatar editor: heads centered in their tiles, fine adjustments in a tidy grid, the figure above its parts in narrow windows (Weave avatar v1.6)
- Avatars: your hub shows a new one right away, the editor zooms to the face (per tab, and the wheel), beards that look like beards (Weave avatar v1.5)
- The server image clears Podman's state from before a restart: a gone pause process failed every build
- Weave avatar v1.4: scenes reworked (faces that fit, a shadow, props in the hand, nothing in front of or inside the head)
- Avatars close to the face: small heads and small scene pictures zoom in (Weave avatar v1.2)
- Files and images in chat: a message carries one, shown inline or as a card to save (Phil's f9IjggSI)
- Weave avatar v1.1: books, a laptop, animals and pixel pictures, and eight scenes made of them
- Avatars: the editor's pictures square (the skins pad buttons), and no backgrounds behind avatars and scenes
- Weave avatars: everyone's own 3D figure, and scenes (their avatar in a pose, with things around it) decorate posts
- No npm cache upload after the jobs: the self-hosted runners keep ~/.npm, and the upload stalled

## v0.25.0 · 2026-11-01

- Pinned services unpack side by side: each process into a part of its own, the first one done stays
- At the start, an agent app whose Weave entry points to a Weave that's gone starts this one
- Home: a project moves up by its chat, not by its posts (they move up themselves); posts show their project's icon
- The service catalog lists what Weave ships under From Weave, also where you run it elsewhere: adding it takes that one in
- The CLI closes the node it opened without a daemon: weave marks and hints end instead of hanging on their folds
- A release whose tag is released again keeps what runs or was launched from it, and says it was replaced
- Installers by hand for a release: the tag whose draft gets them
- Installers go up to a release as a stream, three tries each: fetch gave up on a big one from a slow runner
- The GitHub services live in repositories of their own: Weave ships their pinned releases
- A service Weave ships in another version says outdated, not another Weave's: the Weave that runs it updates it when it restarts
- The releases service reads weave.app.json as UTF-8: große, not groÃe
- The Weave icon rendered from its source (art/logo.png)
- An app asked for an organization that GitHub made for its person instead: Weave says so, and its delete page is the person's own
- Handing a project repositories: paste one's address, and an app of another account says so and offers one for that account
- The applets test knows Weave's reserved names from a built shipped fetcher, not the checkout's build output
- Pinned services come through GitHub's API with GH_TOKEN (CI: the WEAVE_SERVICES_TOKEN secret), or the gh login
- Spotlight and Unread live in repositories of their own: Weave ships their pinned releases
- Auto-update: new versions install over the current one, like VS Code
- The invite round-trip test carries the link's key, and checks that a keyless link is refused
- Protocol 3: a node says its version, older peers get a farewell, old invite links close (-ZhUAOGC)

## v0.24.0 · 2026-10-31

- The Weave icon's source (art/logo.psd)
- The applets test names what Weave ships itself, so a reserved name is taken without a build
- An organization's app from one of its repositories' addresses, and a project's GitHub services say when your keyvault gives them nothing there
- The releases service says why the keyvault gave it no access, when GitHub then shows nothing
- The releases service's hint for a private repository: no apostrophes in its quotes
- The releases service says how a private repository's releases come: handed by a keyvault app
- A release says what it does (about, in weave.app.json), and taking in a hint or marks service asks in plain words
- Opening a website: no port form flashing by while releases load, and no jump to an empty Live
- Publishing a release lists only the repositories handed to the project; + hands it more
- Publishing a release lists the repositories your GitHub App reaches, the project's own first
- Forgetting a keyvault app ends its access, and says where to delete it
- weave_request_repository: an agent asks its person to hand a project repositories, allowed with one click
- Pick the organization an app is for instead of typing it
- A keyvault app for an organization: made on its page, beside your own, any time
- weave_create_project: an agent starts a project for its person, with weave.space.create
- A release workflow for WebAssembly apps: built on GitHub, attached as one archive
- Services Weave ships show up after a build without restarting the daemon
- A post opens wherever you click it, and the side panel shows only beside the Claude app
- A launched website is the website service's: no key, no name, no service of its own
- The Websites service's + launches a released website; Add a service lists no websites
- A release you already run joins another project instead of refusing its own name
- No programs from releases: a release runs as its container or its WebAssembly, never as a program on the host
- A project's tabs on a narrow window list Catalog and Routines too
- Desktop: a second start or a link while quitting no longer reaches a destroyed window
- The daemon-following test reads text only from items that have a body: live signals (marks, hints) have none
- Spotlight: a board you care about tints its place, someone close to you puts a heart under the number
- Keep config settings a build doesn't know when it saves: an older daemon once dropped the desk
- Hint services: the counts next to places come from a service, and follow you to every device
- Announcements: a website opened or a version offered is said in the project's chat, as a live card
- Mark services are taken in like keyvaults and fetchers: one yes per release
- A project has any number of artifacts, each from its own source: no more "its app"
- Setup packs: "GitHub for this project" in a few clicks, offered when a project is made
- Add a service shows one card per source, never one mixed catalog
- Nothing passes for Weave's own: reserved names, origin in every card's title, one keyvault per platform
- Regression tests from the review sorted by the concern they guard (W3wTw_-7)
- The helpdesk can't recover admins; a promoted standby fences off the old server (oreXqcSP, nQ9JHlUV)
- One key can't fill the pending pool, and an accept retries only what waited for it (KtpOfhGu)
- A carried post is forgotten when it comes due (7I92Kk20)
- History 'joining'/'30d' holds when a plain member would let someone in (T3a83nLy)
- Removed means out, until someone who could remove asks you back (_Ak3UUmp, odfs7haI)
- A company counts someone as a colleague only if it vouches for them (MHV79Ro6)
- Enrolling with a token from elsewhere says why it can't work (0siqvEzB follow-up)
- Mutual removals are ordered, never both counted: no taking down who removed you (H7hk7X9S, cpjHYTDQ)
- A shred keeps what the shredder's node didn't hold (zLqeyEBC)
- Company halves: only the rekeyer's counts, no gap with the Weave half, kept over a restart (WUCPqIBs, yHsKySEi, AsPMzM8O)
- Joins prove they hold the link; group rules admit only from the group (99ZpCdH6, xQ0as76W)
- A key is whose it says it is, not whoever claimed it first (FTIDssuB)
- A revocation names where it saw the key, per space: no filling unused numbers (KgmsMa_g)
- Gifted keys for a held space count only if they open something there (8R9bN-yO)
- A held space's treasury is paid as computed here, never as announced (7iriYk4C)
- Only rekeys that count stop rotation, by their time clamped to arrival (Gr9S4DLf)
- Anchor loss of rights causally: removals name each key's heads in the space (H7hk7X9S)
- SSO sign-ins are bound to the identity that hands them in (0siqvEzB)
- Escrows open only with the company's own key, not the key service alone (XyMStMvo)
- Carries restate only what was really written: each item checked against its signature
- `was` only for a key restating its own v1 event
- A shred drops only its own space's bodies
- Tiers and shows belong to their author, whoever reuses their id
- Tidy a test comment
- Peer input can't crash the node: unhashable bodies are rejected
- Sync tags carry the connection's role, so a reflected hello proves nothing
- A shipped service whose new version asks for more waits for your yes, and says so
- Keyvaults and fetchers are anyone's: added from a project's release, approved once, pinned
- Lists are anyone's: a service from any project's release shows its lists as Weave's own do
- Weave knows less of GitHub: publishing speaks the provider's words, icons come from what services declare
- A keyvault holds any number of apps, each handing projects what it reaches in its own settings
- Maintainers withdraw a release; "Ask …" only for services one talks to
- One list for everything a service hands out: icons, badges, small buttons, search and pages
- Services' lists: the same list in every card, with + and a trash can for who may
- Services' cards: settings and taking out as icons in the title; GitHub access leads with getting access
- The keyvault's repository list asks GitHub once, and shows the answer
- Open each service request and answer once: the daemon no longer pegs a core
- A shipped service that asks for no settings any more stops asking for the old ones
- Lists to pick from follow the skin: readable in dark mode
- Keyvaults: your access to a platform kept in one place, your services only ask
- Only whoever runs GitHub access hands out what its App reaches
- Your GitHub App is named for you: "martldennl's Weave connect"
- GitHub access acts through your own GitHub App, made in one click with GitHub's manifest flow
- GitHub access gives the project's own repository by default; its page and picker keep up
- Sessions have a permanent name: "name · about", chosen once by the session, renamed only by its person
- Weave lists a project's running websites itself; the websites service has no page
- GitHub access acts as whoever runs it: their GitHub sign-in, once for every project
- GitHub access does one thing: a project's members get access to its repositories
- Link repositories with projects n-to-n; linking gives nobody access
- Prove an account elsewhere in one click: the verifier makes the proof with a code sign-in
- GitHub sign-in through Weave's OAuth App (its client ID; device flow, no secret)
- Sign services in with a code: GitHub releases and GitHub access need no token
- Badges and From Weave ship with Weave: everyone's own until turned off, checked by digest
- Marks next to names: mark services you or a space choose, each saying who says so
- Counts next to chats, places and boards until you open them, by rules for who and where
- Sessions page: how linking works behind an info icon
- Sessions page: a section per harness on the left, Claude Code the first

## v0.23.0 · 2026-10-28

- Release: draft and publish with a Node script, not gh, so it runs on every runner
- Release: set up Node in the draft job, the runner has none of its own
- Artifacts say where their files are (install.source), not GitHub
- Weave knows nothing of GitHub: accounts elsewhere, verifiers, and GitHub access as a service
- Weave signs in to GitHub nowhere: services have their own access
- GitHub access as a service of its own, with its own token
- Publish through the project's GitHub releases service, and fetch open releases directly

## v0.22.0 · 2026-10-28

- Requests sealed for the service and the asker, and how long they count
- Attach release files straight to a draft release, not through Actions artifacts
- Available: everything a project offers, grouped by kind
- Launch a website artifact as a running website, in Live, gone when closed
- Artifacts have a kind and a source: files join services, websites and board views
- Fetchers: the asker's side of artifact.fetch, a client app of their own
- Who may get each artifact: a gear beside it, enforced where its files are handed out
- Live: a project's running websites in a place of their own; a service's card offers, shows, then lets you act
- Websites as a service Weave ships, hosting a project's websites under its own contract
- Service panels: a service's own pages in its card, in the section of who may see them
- Let code from others serve only its own port as a website
- Everything one can do with a service, in sections by who may; who may in its settings
- Show a service's actions by who may use them, and let maintainers move one in place
- Actions: what people may ask a service to do, and who may, checked by Weave
- Plainer project services: what's available, and Add to…
- Show a project's releases under the service that hands them out
- Add a service from a catalog of tiles, and list a project's services in the sidebar
- Offer the services Weave ships in a project's Add a service
- Ship GitHub releases: the first service Weave ships, as a WebAssembly component
- Ticks and signatures for WebAssembly services, and services Weave ships, checked by digest
- Invite only GitHub accounts a member proves are theirs
- Keep a service's settings in its space, for its maintainers: secrets blind, sign-ins renewed
- Sessions: start a new Claude Code session with a job, from the Sessions page
- Sessions: compact two-line rows, grouped by job
- Let WebAssembly services reach the hosts their contract names, over HTTPS
- Sessions: Claude sessions and Weave projects side by side, linked by lines
- Restart a daemon that holds the home but doesn't answer, and say why it didn't start
- Take over a home's lock from before the computer last started
- Build the server image with rootless Podman on the self-hosted runner
- Panel: drop the unused footer style
- Panel: Stack foldout in the header, no footer, no session name
- A leaner panel: one bar, the post edge to edge, no footer
- Workers and the daily driver: sessions get a job, Ctrl+click picks who works on an item

## v0.21.2 · 2026-10-27

- Leave out empty signing variables when packaging

## v0.21.1 · 2026-10-27

- Package the Mac app without bin links, and keep CI artifacts two days
- Address book: say where the link went, for a moment
- Address book: keep the page still when moving through the results
- Address book: a rounded panel on a transparent window; Ctrl+F1 for everything
- Address book on Ctrl+F1/F2/F3, with its tabs inside the search field
- A tighter address book: a bare search bar that grows with its results
- Tabs in the address book: all, people, projects, posts
- Plan v2 stage 18: reputation (trust, vouches, gates)
- Sign the installers when the repository has the credentials
- Open only web addresses in the browser and for company sign-in
- Address book picker and person links

## v0.21.0 · 2026-10-27

- Give the docker stand-in its port through a wrapper, so the container tests pass on Linux
- Serve lens views through the node API: on the desktop, the phone and the web preview
- Let the Kanban starter add cards in its sandboxed frame, and frame lenses in dev-web
- Add client services: boards shown through a project's own WebAssembly lens
- Add starters for WebAssembly services, and weave service new
- Release WebAssembly services, and install them without Docker
- Serve WebAssembly websites with Weave holding the players' connections
- Run Weave services as WebAssembly components inside Weave
- Run CI, installers and releases on self-hosted runners
- Answer the local port a website really got, not a taken one
- Set up the GitHub service's own GitHub App in one go
- Let the GitHub service act as a GitHub App of the person's own
- Let spaces decide what people's agents and services may do in them
- Fix what clicking through the Catalog page turned up
- Add catalogs: spaces list Weave services for their people to install
- Release build files when the image can't be pinned, and add real checks
- Bring websites from Weave 0.20 along, and read registries on this computer
- Say where every service comes from, and check it where possible
- Add providers and artifact.fetch, with the GitHub service as the first
- Add the Weave service format: OCI images carrying their manifest
- Let the website service only serve: services announce their web pages
- A service that reads nothing takes no requests, and its key signs its profile alone
- Say website, not room: CLI, app, messages and the agents' instructions
- Rooms are websites in the API: openWebsite, websites, visitWebsite, WebsiteInfo…
- Split services and websites out of node.ts
- Extract fetching releases: download, check against the fingerprint, unpack, once per release
- Extract the runtime: starting, supervising and stopping processes and containers, in one place
- Applets: install another project's release as a service, with the contract its manifest declares

## v0.20.0 · 2026-10-26

- Remove the project-app path: rooms come only from the room service
- Rooms as a regular service: Weave's room service, with handlers instead of artifact services
- Live starts artifacts as room services: "Start here" instead of hosting the project app
- Artifacts as services: run another project's release, pinned, in your own spaces
- Rooms offered by services: a service's own web page, as a room in its projects
- Services in the app: add, set up and stop them, and ask them in a space
- Run services on an always-on node: the key made on a computer, handed over sealed
- Wait at most 4 s for leaving the DHT
- Leave the DHT at once when stopping, so the process can exit
- Keep a stop asked for while the daemon is still starting
- Leave the DHT politely for 3 s at most when stopping
- Services: code you run under a key of its own, with exactly its contract's rights
- Link personal GitHub repositories: linked only, or written to by people picked
- Shows pay out as decided after them; calmer project settings
- Give the Mentions test a session folder in this system's own path form
- Host room: tickets always on offer, a new show by default
- Shows set up with their room; payments behind a switch
- Show the work item a session is on in full, and a sessions pane
- Give routines a tab of their own
- Give a session Ctrl+click opened its item without the agent's help
- Give the desk a daily driver: the session its items go to
- Put a desk folder given by name in your user folder, and offer Choose…
- Set up your desk, with routines that make work items on time
- Ctrl+click a work item to work on it in the Claude app
- Show work items in the side panel like posts on a board
- Give agent sessions a stack of work items, and follow the one you look at
- Start the harness: post links, a Mentions panel, Weave for Claude chat
- Add a dark mode to the Clean look
- Make Clean the default look

## v0.19.4 · 2026-10-25

- Give up stalled phone connections after 4 s and try again
- Notice periods count from when a node first saw the change
- Votes, badges and invites: decide by number where a date is only a claim
- Company policy: hold accounts to it by number, not by claimed time
- Backdating: cut removed members off by number, settle concurrent rekeys
- Show badges on the hub, and tell people when they get one
- A wallet section in Keys & devices; smart wallets (EIP-1271)

## v0.19.3 · 2026-10-25

- Run the phone worker's test on its own in CI, with time limits
- Let the phone room test reload when the way to the room isn't up yet
- Let the phone room test ask again when the test network is slow
- Pay from a wallet without copying anything; tiers open live rooms; shows in Live
- Changing wallets: retire old addresses, keep Safes' owners, move what's left
- Sign Safe transactions together in Weave; ticketed rooms; shows and USDC tiers in the app
- Ticketed shows: entry paid into the show's own Safe, paid out or back after
- Treasuries: project wallets, splits and paid group access on chain
- Connect Gumroad in the browser instead of pasting an access token
- Make the Gumroad product from the tier dialog too
- Count a badge series for a project only while its issuer maintains it
- Badges: lasting, verifiable recognition from a project

## v0.19.2 · 2026-10-25

- Bring the lockfile in line with the phone app's dependencies
- Show a badge's picture large in its card
- Give badges a personal note the holder may publish
- Let authors and maintainers delete chat messages
- Say why the phone app asks for local network access
- Phone app: bars clear the island and home bar, tabs show icon over label
- Show a project's Live and boards at the top of its pages on phones
- Play in a room from the phone app, through the computer

## v0.19.1 · 2026-10-24

- Let Bare run on Linux and macOS: set the execute bit npm leaves off

## v0.19.0 · 2026-10-24

- Let the phone worker test wait for the reconnect after a restart
- Badges: lasting, verifiable recognition from a project
- Let phones call only an allow list of methods
- Pack the phone worker from the repository root so it finds hoisted modules
- Add the companion phone app

## v0.18.1 · 2026-10-24

- Fix the container test on Linux: tell the Docker stand-in the app's port

## v0.18.0 · 2026-10-24

- Always-on nodes: a server, NAS or cluster that keeps your spaces and hosts your rooms
- Apps from a container image, and X-Weave-Person for who is who
- Link only repositories of a GitHub organization

## v0.17.2 · 2026-10-24

- Stop and restart the daemon properly; replace an outdated one only between release builds
- Say who sees your GitHub name before you give it to a space

## v0.17.1 · 2026-10-23

- Add a dark mode to the Clean look
- Make Clean the default look

## v0.17.0 · 2026-10-23

- Stage 17: keys held in hardware (TPM, Secure Enclave, YubiKey)
- Stage 16: AWS KMS and Google Cloud KMS as key services
- Stage 15: console roles, approving agents, device status, audit search, retention per project
- Undo the whole-file reformatting in the stage 14 commit
- Stage 14: Azure delegated access, the server's home key in the key service, backups and standby, invitations

## v0.16.1 · 2026-10-22

- Build the macOS installers one architecture at a time

## v0.16.0 · 2026-10-22

- Fixes from running the company flow end to end, and the demo that runs it
- v2 stage 13: sign in with a company account in the app; Weave Server; Azure for the company node

## v0.15.1 · 2026-10-22

- Fix the macOS pkg build; the app's own icons in the admin console
- Give the admin console Weave's look: the woven logo, pixel icons, avatars, light and dark

## v0.15.0 · 2026-10-22

- Say projects and groups in the admin console, and open them in Weave
- v2 stage 12: SCIM, device checks, managed settings, IT installers, audit streams, admin console
- Give the company tests two minutes: slow CI runners timed out

## v0.14.0 · 2026-10-22

- v2 stage 11: company policy and retention minimums

## v0.13.0 · 2026-10-22

- v2 stage 10: company accounts

## v0.12.0 · 2026-10-22

- v2 stage 9.4: Azure Key Vault as a key provider
- v2 stage 9.3: audit export; company commands
- v2 stage 9.2: recovery words kept by the company
- v2 stage 9.1: approved agents in company spaces

## v0.11.0 · 2026-10-22

- v2 stage 8: abuse budgets (part 1): a fair share, and a rate budget

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
