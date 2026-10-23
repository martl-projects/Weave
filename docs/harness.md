# Weave harness

Status: design draft. Built so far on the harness branch: post links
(weave.localhost pages), the Mentions panel with Follow Claude Code, weave_show
with post cards for hosts that render MCP Apps, and the Claude bundle (.mcpb).

The harness is where you and your agents plan and do the day's work: Claude
Code sessions do the work, Weave is the map around them. Routines put the
recurring work on the map, you plan in a Claude Code session like any other,
the work lands in the right projects, and you follow it on Hot.

## The day, as you see it

1. **First start**: a routine gives your daily driver the work item "Set up
   Weave": your desk project, Journal and Ideas boards, desk folder.
2. **08:00, Prepare the journal entry**: today's entry ("Thursday, 23 October
   2026") appears in Journal, ready to fill.
3. **You start journaling**: Ctrl+click on today's entry. It becomes the
   driver's active work item, the Claude app comes to the driver's session
   with the entry and its starting prompt ("this is journaling: listen, ask,
   and turn what deserves it into work items in the right projects") in the
   text box, and you go on from there.
4. **Through the day you check your feed**: the work items that need you,
   because a session came back and the item isn't done. Ctrl+click takes you
   to the session, answer there.
5. **Your feed is all done and 10 minutes pass**: the driver gets "Plan
   ahead".

## Feeds and work items

**Feeds.** A feed is a board of work items in order, shown like Home: your
feed, and one per agent session (the session stack below, seen as a feed).

- **Your feed**: the items waiting for you: a session came back and the item
  isn't done. Answer, mark done, or push it back to an agent.
- **An agent's feed**: its stack, the top item being worked on.
- Items appear in both: the item an agent works on is in its feed; when it
  needs you, it's in yours too.

**Every work item has a starting prompt**: what the session should do with
it, set by whoever creates it (a routine's template, you, or the agent that
opens it). Journal entries: "this is journaling; turn what deserves it into
work items". Plan ahead: "look at what's open and propose tomorrow".

**You talk to sessions in the Claude app; Weave shows the work.** One place
to talk. **Ctrl+click** on a work item (in your feed, Hot, a board, the panel):

1. The side panel opens the item: its text, starting prompt, its sessions
   and where it stands.
2. The Claude app comes to the item's session (the top session that worked on
   it, or a new one in the project's folder) with the message ready in its
   text box: the item and its starting prompt (later: "continue with …").
3. You press Enter to go, or edit it first. Weave never sends on its own.

How the text gets there: a new session takes it in its link
(`claude://code/new?folder=…&q=…`); an existing session's link takes no text,
so Weave opens it and pastes into its text box (clipboard, restored after;
tried on Windows). A plain click opens the item in Weave, as today.

Items that run **headless** have no window: their answers land in the item's
chat in Weave, and Ctrl+click on one opens its session in the Claude app to
look or take over (from then on it's yours there).

**Triggers for routines**, all in one place:

- **Schedule**: "weekdays 08:00".
- **First start**: once, when Weave is set up.
- **You pick up an item**: "when I open today's journal entry" (Ctrl+click).
- **Feed state**: "my feed has been empty for 10 minutes".
- **From an extension**: "drifting".

## Routines

A routine is a trigger and a work item to create when it fires, kept in your
desk project (private to you).

- **What it creates:** a title pattern ("Day Planning {date}", "Standup",
  "Pep talk"), the board, a body template (the scratchpad to start from) and a
  starting prompt for the session Work on this opens ("Plan the day: read my
  ideas, Hot and my open issues; write the plan into this item; …").
- **When:** a trigger.
  - **Schedule** (built in): days and a time ("weekdays 08:30", "Fridays
    15:00"). If your computer was off, the occurrence is created when Weave
    next runs.
  - **From an extension**: a trigger an extension offers ("browsing instead
    of working", "a meeting starts", "a build failed"), with the
    extension's own settings.
- **How often:** each occurrence has a fixed key (routine + date, or routine +
  the extension's key), so two devices or a restart never create it twice; a
  routine can also say "at most once a day" or "not again within 2 hours".
- **Then:** notify you (default), and optionally open Work on this right
  away. Nothing starts a session without you, unless you turn that on.
- **The UI:** Routines, in your desk project's settings: a list (name,
  trigger, last and next time, on/off), and New routine: title pattern, board,
  body and prompt, trigger (schedule, or one of your extensions' triggers),
  how often, then.

### Extensions

An extension is a small program of yours that watches something and fires
triggers. Example, your **Pep talk**: during work hours, if a browser with a
site that isn't work has been in front for 20 minutes, fire `drifting`; the
routine "Pep talk" turns that into a work item whose prompt asks the agent for
a short pep talk and the one next step.

- **Where:** a folder per extension in your Weave home
  (`extensions/<name>/`), with `weave.extension.json`: name, description,
  the triggers it offers (each with a key and settings), what it needs to see
  (see below), and the command that runs it.
- **How it runs:** Weave starts it as its own process, outside the daemon,
  and restarts it if it stops. It talks to Weave over a narrow channel with a
  token of its own: it can fire its own triggers (with a short note and a key)
  and read its settings. It can't read your posts or act as you or an agent.
- **What it can see:** extensions often need to know what you're doing. Weave
  offers that as signals it reads itself, so each extension doesn't scrape on
  its own: the app in front and its window title, the browser's site (where a
  browser tells it), idle time, the time of day, your calendar later. An
  extension names the signals it needs; you allow them when you install it,
  and see them in its settings. Signals stay on this computer.
- **Writing one:** a template (`weave extension new pep-talk`) with the
  manifest and a script; your agent can write the rest. Extensions are
  yours: shared only if you copy them.

## Sessions

Weave manages agent sessions through **providers**, so Claude Code is one
choice and others (Codex, Cursor, an embedded runner) can stand in. Everything
above the provider (work items, the session stack, routines, the panel) only
knows sessions by provider and id.

A provider says what it can do; Weave uses what's there:

| Capability | Claude Code (desktop app) | Claude Code (terminal) | Later: Codex, others |
| --- | --- | --- | --- |
| Start a session in a folder with a prompt | `claude://code/new?folder=…&q=…` | `claude --session-id <uuid> -n … "…"` | `codex …` |
| Open or resume one | `claude://claude.ai/epitaxy/<id>` | `claude -r <id>` | |
| Run one hidden (no window) | its bundled Claude Code, headless (below) | `claude -p … --resume <id>` | `codex exec …` |
| Which one you're looking at | the app's log | (the one you last typed in) | |
| Its transcript and title | `~/.claude/projects/…/<id>.jsonl` | same | |
| Rename | an agent in the session, or you | `/rename`, `-n` | |
| Which session a tool call comes from | a hook passes the session id to Weave | same | |

The Weave tools (MCP) are the same for every provider; only starting,
finding and reading sessions differ.

Each agent says which provider runs it: your daily driver on Claude, a worker
on DeepSeek. Routines and items name the agent, never the provider. For now
there is only Claude.

### Folders and projects

Every session runs in a folder on this computer, and folders and projects
are many-to-many: one repository can serve several Weave projects (a monorepo,
a company project and its tier), one project can span several folders
(backend, app, docs), and some work needs a folder nobody made yet.

So Weave doesn't map them; the agent that starts a session picks the folder,
usually the daily driver, using what Weave knows:

- **Folders Weave has seen**: every session's folder (from the session log),
  each with the projects whose items were worked on there and when; folders
  you named for a project ("Your checkout"); linked GitHub repositories and
  where they're checked out here.
- `weave_folders` gives the driver that list (for a project, or all);
  `weave_start_session` takes the item, the folder and shown or hidden.
- When nothing fits, the driver asks you ("Start in C:\code\weave, or make a
  new folder for this?") and, with your yes, creates the folder (or clones the
  repository) first. It never guesses silently into a folder it hasn't seen
  used for that project.
- Ctrl+click on an item without sessions does the same through the driver:
  the panel shows its suggestion, you confirm or pick another.

### The session stack

Every session has a list of work items, a small scratch board shown in the
side panel for the session you're looking at:

- **The top is what it's on now.** Assigning a new item while the current
  one isn't done puts the new one on top; the interrupted one stays below,
  marked waiting, and comes back to the top when the one above is done.
- **Collect and arrange.** You (or the agent) can drop any post onto it,
  reorder it, take items off. It's a scratch board, not a plan: nothing in it
  changes the items themselves.
- **Done pops.** Marking the top item done (in Weave, or the agent with
  weave_done) removes it and shows what's next; the panel says "back to
  Backlog check" when an interrupted item comes up again.
- **Many-to-many still holds.** The same item can sit in several sessions'
  stacks; each item lists the sessions that worked on it.
- The stack is yours: kept sealed to yourself, on all your devices; the
  item's team sees only that a session worked on it.

Agent tools for it: `weave_session` (this session's stack), `weave_work_on`
(push an item, or create one and push it), `weave_done` (pop), `weave_stack`
(reorder, add, remove). Which session a call comes from is the provider's
part (for Claude Code, a SessionStart hook hands Weave the session id together
with the MCP server's process, so the agent never has to say).

### Starting sessions automatically

Routines and Work on this start sessions through the provider. Two kinds:

- **Shown**: opens in the Claude app (or a terminal) for you to work in:
  Day Planning, Standup, anything you want to talk through.
- **Hidden**: runs without a window and ends when the item is done, its
  output in the item's chat and transcript: preparation, summaries, checks.
  With Claude Code that's its headless mode: `claude -p --session-id <uuid>
  --output-format stream-json "<prompt>"` in the folder, streaming into the
  item's chat, resuming the same session next time (and openable in the app
  later). No install needed: the Claude app ships Claude Code
  (`%LOCALAPPDATA%\Claude-Data\claude_<id>\claude-code\<version>\<hash>\claude.exe`
  on Windows; the path changes with updates, so Weave finds it from the app's
  log, "Using Claude Code binary at …", or the newest copy; a `claude` on the
  PATH wins). It needs its own sign-in (the app's login is the app's):
  setup checks `claude auth status` (JSON, `loggedIn`) and, if needed, runs
  `claude auth login` (`--claudeai` for your subscription, `--console` for API
  billing: the backing account), which opens the browser sign-in and returns
  by itself. Weave never sees the password or token. You see
  hidden runs in the panel (running, done, failed) and can open one to look or
  take over.

Not every step needs an agent: Weave can do the plain ones itself (create the
day's entry from a template), and keep sessions for what needs judgment.

**Prep items run as forks.** A hidden prep item (Prepare for the day, a
summary before Standup) belongs to a shown session, usually the daily
driver's. It runs headless on a fork of that session (`claude -p --resume <id>
--fork-session`): it starts with everything the session knows, works on its
own copy, and leaves the session untouched. Its result lands in the item (and
its chat); Ctrl+click brings it into the session when you want it there.

Why not run it in the session itself: tried on 23 October, a headless turn
(`--resume`, no fork) on a session the Claude app held warm was skipped by
the app; the next message there branched off before it, leaving the headless
turn on a side branch of the transcript. Running headless on a session the
app has let go (it keeps them warm 30 minutes) may work, but is untested.

## Your desk

Set up once (Weave offers it): a personal project, private to you, with:

- **Journal**: one entry per day ("Thursday, 23 October 2026"), sorted new.
  One board for all years rather than a board per year: Weave boards are
  long-lived, and the board view filters by month and year. Each entry's body
  is that day's scratchpad; its chat is where the day's sessions report.
- **Ideas**: stream of thought, sorted new or hot.
- **Routines** and your **desk folder** on this computer (where the daily
  driver's sessions run, with a `CLAUDE.md` describing your routines and how
  to plan).

The day starts with two routines:

1. **Prepare for the day** (weekdays 07:30, hidden): creates the Journal entry
   from your template (yesterday's open items carried over, today's routines
   listed), then, if you like, a hidden session fills in what needs judgment
   (what's hot, what's waiting for you).
2. **Day Planning** (08:30, shown): the daily driver. Opens (or continues) your
   planning session with today's entry on top of its stack.

## What the harness protects against

Accidents, not intent. All your agents run on your computer under your
account; one that sets out to read another agent's key or another provider's
credentials can. What the harness makes hard is doing the wrong thing by
mistake:

- company data ending up in the context of an agent on your personal
  provider account (or the other way round);
- an agent posting in a project it wasn't meant for, or under the wrong
  identity;
- a project's work being done with a model, account or budget the project
  didn't agree to.

So the rules below are declared, checked by every node where they can be,
and enforced by the harness on your machine. Nothing here pretends to be
proof against a determined user.

## Agent identity

An agent is one of your agents with an identity of its own: its own key,
delegated by you, as today. What's new is the profile it carries, published
in its delegation so every member's node can read it:

- **Name and description**: "Work: Acme code tasks", "Tom: everything
  private".
- **Backing account**: the provider and account that run it, for example
  "Anthropic · Acme org" or "Anthropic · personal". This decides whose terms
  (retention, training, compliance) and whose budget apply.
- **Runtime and models**: Claude Code, Codex, …; the models it may use, for
  example claude-opus-5-5, or "Claude 5 or newer".
- **Limits**: a daily budget, the tools it may use (no shell, no network, …),
  and whether it asks before posting.
- **Scope**: the spaces it may act in, and read. Global, or a list of spaces.
- **A cowork project**: a project of its own where you and it work together,
  with its Ideas and journal boards.

Agents still count as their person for membership: an agent can only ever do
what you may do, narrowed by its kinds and its scope.

### How the harness keeps agents apart

- **Per-agent daemon tokens.** Each agent talks to Weave with a token of its
  own, so it acts as itself and can't sign as you or as another agent through
  the daemon (today any local program with the daemon's token can act as you).
- **Reads follow the scope.** The daemon only shows an agent the spaces in its
  scope: posts, chats, issues, Hot, search, planning context. This is the main
  guard against data reaching the wrong provider account: an agent never sees
  what it may not act on.
- **Writes follow the scope and kinds**, checked by your node when signing
  and by every other node when receiving (the scope is in the public
  delegation).
- **The runner starts the right agent.** A chat belongs to a space; the
  runner starts the agent whose scope covers it and that meets the project's
  policy, with the profile's model, account and limits. If none fits, it says
  so instead of falling back to another agent.

## Projects and agents

Each project chooses how agents may work in it (`weave.project.agents`, set
by its maintainers):

- **Open** (the default): any member's agents, within their kinds.
- **Recommend**: a suggested setup, shown when someone sets up or assigns
  work there, for example "Claude 5 or newer", or "DeepSeek for the
  roleplay boards".
- **Require**: a setup agents must declare to act here: a dedicated agent
  (scoped to this project only), a backing account ("Anthropic · Acme
  org"), models, tool limits. Every member's node rejects events from agents
  whose declared profile doesn't meet it, and your runner won't start a
  non-matching agent for this project's chats.

The check is against the declared profile. It keeps members from using the
wrong setup by accident; it doesn't prove what actually ran. (If a project
ever needs that, its maintainers could run and certify the agents themselves.
Not planned.)

## Board permissions

What boards have today: a read list and a write list per board (people,
groups, or everyone in the project), set by maintainers. A read-limited board
is sealed with a key of its own, boxed to its readers. Chat, upvotes,
reactions and edits on a post follow the post's board and count as writing.
Maintainers always read and write every board.

What changes:

- **More verbs.** `read`, `post`, `chat` and `vote` instead of read and
  write. For example a Releases board everyone reads and talks about, but only
  maintainers post to.
- **Agents as grantees.** Next to `{person}` and `{group}`:
  `{agents: 'none' | 'any' | 'dedicated'}`, whether members' agents may act
  on this board at all, or only agents dedicated to the project.
- **Own boards.** A board whose posts each member sees only for themselves
  (`read: 'own'`). One board definition covers every member: each post on it
  is sealed to its author's own key (the self scope, like saved posts), so
  there are no per-member boards, no board keys and nothing to re-key when
  people come and go. Maintainers can't read it either, because nothing on
  it is sealed to them. The post's chat is sealed the same way, so your agents
  (which read through your node) can work there with you.
  A variant, `read: 'own+maintainers'`, seals each post to its author and the
  maintainers, for a board like "feedback to the team leads".
- **The same lists for other features**: channels, the project page, the app
  and rooms.

The personal **Mine** board is then just an own board every project gets by
default. Work items themselves stay normal, team-visible issues.

## Hot for work

Work items are followed from Hot like any post, with what you need to see at
a glance: their status (open, in progress, waiting for you, done), who works
on them (person · agent) and who finished them, and when.

- **Tags.** Posts get tags (issues already have labels; they become the
  same thing). The author and the board's maintainers set them; a board can
  offer a fixed set. Hot filters by tag, and **work item** is a built-in
  filter: everything with a status, across your projects. Its views: open,
  waiting for you, done today.
- **Who finished.** The status change to done is signed, so the item shows
  "done by martl · work, 14:20", next to its session log.

### Boosts

Your main agent can boost posts in **your** Hot: what the day's plan is
about, an item that's due, a teammate's question you should answer.

- A boost is yours alone: sealed to yourself like saves and pins, it changes
  the order of your Hot and nobody else's. Upvotes stay votes; an agent never
  casts fake ones.
- It raises a post's hotness by a factor, carries a reason ("due today",
  "from today's plan") shown on the post, and ends by itself (default: end of
  the day). A negative boost sinks a post for the day.
- Agents need the `weave.boost` kind for it; you see every boost and can
  undo it.
- Pin to home stays the strong form: a pinned post is always on top.

## Editing posts

Changing one idea shouldn't mean opening the editor dialog and posting
again. Each board says how its posts are edited (maintainers set it; each
board type has a default):

| Mode | How | Default for |
| --- | --- | --- |
| Inline | Click your post's text, edit in place, saved when you pause or click away | Journal, Ideas, Mine |
| Inline + confirm | Edit in place; a Save bar asks before the change goes out | Boards where small fixes are common but each change should be deliberate |
| Dialog | The edit dialog with the rich editor (as today) | Post boards |
| Dialog + confirm | The dialog, then "everyone who has this post sees the change, marked as edited" | Releases, Showcase, public posts |

- A post with confirmed co-authors always asks: you'd be changing text they
  signed their name to.
- Every edit is a signed event, replicated and kept, so inline editing never
  saves per keystroke: it keeps a local draft and saves once after a pause or
  when you leave the text, one edit per burst of typing.
- You and your agent can edit the same post (the scratchpad). Today the
  last edit wins for the whole text; instead, while you're editing, a change
  from the agent shows as "Claude changed this" with its version, and you
  choose. Merging both edits can come later.

## The embedded runner (option)

When you write in a harness chat (your journal post, a cowork project, or a
work item's chat), Weave starts the agent that belongs there. One session per
post, so each work item keeps its own history. Agents that run elsewhere can
still listen with `weave_inbox`.

For Claude, the runner embeds the **Claude Agent SDK**
(`@anthropic-ai/claude-agent-sdk`, Claude Code as a library) in the daemon,
so it keeps running while the window is closed:

- **One session per post.** `query()` with `resume: <session id>`; the
  runner keeps post → session id (sealed to yourself, so your other devices
  know it too, though resuming needs the session file on the machine that ran
  it).
- **Weave tools in-process.** The Weave MCP tools are served with
  `createSdkMcpServer`, bound to that agent's identity inside the daemon: no
  daemon token in the agent's hands, and it can only act as itself.
- **The profile becomes options.** Model → `model`, `effort`; backing
  account → `env` with that account's API key (kept in the OS keychain, never
  in Weave) or the Bedrock/Vertex/Foundry switches; limits → `maxBudgetUsd`,
  `maxTurns`, `allowedTools`/`disallowedTools`; the project's local checkout →
  `cwd`; `settingSources: ['project']`, so your personal `~/.claude` settings
  and MCP servers don't leak into a work agent.
- **Output.** With `includePartialMessages`, tokens stream to your window as
  live (unsigned, not replicated) items; each finished step becomes one
  signed chat message from the agent: what it said, the tools it used, and a
  closing line with model, turns and estimated cost. The team sees the
  messages; only you see the token stream.
- **Approvals in the chat.** `canUseTool` turns each tool call that needs a
  yes into a card in the chat (only on your node, only you can answer):
  Allow, Allow always for this post, Deny. `PreToolUse` hooks log every tool
  call.
- **Stop.** A Stop button interrupts the run (`interrupt()` / abort); the
  next message resumes the same session.
- **Accounts.** API keys or a cloud provider per backing account. Anthropic
  doesn't allow third-party products to use claude.ai subscription logins for
  agents built on the SDK, so the runner doesn't offer that.

## Working in Claude Code

The alternative to the embedded runner: keep Claude Code (Desktop, the CLI
or VS Code) as the place where you talk to the agent, and make Weave the map
around it.

- **Work on this.** A work item's button starts a new Claude Code session in
  the project's checkout with the item as its prompt, and attaches that
  session to the item (sealed to yourself). In Desktop:
  `claude://code/new?folder=…&q=…` (see below); in a terminal
  `claude --session-id <uuid> -n "<item title>"`. The item lists its
  attached sessions, each opening again (Desktop
  `claude://claude.ai/epitaxy/<id>`, terminal `claude -r <id>`, VS Code
  `vscode://anthropic.claude-code/open?session=<id>`).
- **Attaching is on purpose only.** Sessions and items are many-to-many (see
  below); a session you started elsewhere is attached with Attach to work
  item in the panel. A link to an item in a session attaches nothing.
- **Context in.** A `SessionStart` hook adds the item (its text, your
  scratchpad, your Mine notes for the project) as context; the Weave MCP
  server, acting as that project's agent, gives the rest on demand.
- **Output back.** A `Stop` hook posts the agent's last message to the item's
  chat, signed by the agent; a `Notification` hook marks the item "waiting
  for you" (a permission prompt, a question), so Hot shows which sessions need
  you.
- **The overlay.** A small always-on-top Weave window beside Claude Code
  shows the item you're working on: its text, scratchpad, chat, Mine notes,
  related items. It follows the active session through Claude Code's status
  line (`weave statusline` receives the session id, tells Weave, and prints
  the item, the agent and today's spend in Claude Code's status bar).
- **The right agent per checkout.** Linking a project's checkout writes its
  local Claude Code config: the Weave MCP server as that project's agent
  (local scope, so nothing is committed), the hooks, the status line and the
  model. When Weave starts the session it also sets the backing account (an
  API key, or a separate `CLAUDE_CONFIG_DIR` per account, whose sessions then
  live apart from your default ones).
- **A log of which sessions worked on what.** Each work item keeps the
  sessions attached to it: session id, agent, computer, and from which turn
  (attaching marks the turn). A session can work on several items, and an item
  can have many sessions. The entries are posted to the item by the agent, so
  the team sees "worked on by martl · work, 3 sessions, 2 h".
- **Transcripts in the chat.** On the computer that ran the session, the
  item's chat shows each segment as it happened: your prompts, the agent's
  answers, tool calls folded away. While a session runs, Weave follows its
  transcript file, so the chat updates live without any extra plumbing. The
  transcript stays on that computer; other devices and teammates see the
  log and the agent's posted summaries, and you can share a segment with the
  team on purpose (it can hold code, paths and anything you typed). The
  transcript format is Claude Code's own and may change, so Weave reads it
  defensively and falls back to "open the session".
- **Links back to Weave.** Claude Code makes http(s) links clickable
  everywhere; a custom `weave:` link may not be (not documented). So the
  Weave daemon serves every post read-only on a fixed port, and the Weave
  tools give agents each post's link to cite:
  `http://weave.localhost:7710/weave~NqgQ/ideas/aq1i-links-from-claude-code`.
  - `*.localhost` reaches your own computer in every browser, no setup; the
    name says it's Weave.
  - `weave~NqgQ`: the project's name plus the start of its id (names aren't
    unique). `ideas`: the board. `aq1i`: the shortest unique start of the
    post's id within the project (at least 4). The title is decoration.
    Only the two ids find the post. Hub posts: `…/@martl/…`.
  - In Desktop and VS Code a click opens Claude Code's browser pane with the
    post next to the chat, and an **Open in Weave** button; in a terminal,
    your browser.
  - No token: the link works for anyone running Weave who can see the post.
    The daemon listens on 127.0.0.1 and checks the Host header; other
    websites can't read its responses; programs on your computer could read
    your Weave folder anyway. The page can't change anything.
  - Inside the app, `weave:post:…` and `http://weave.localhost:<any
    port>/…` are the same link (chip or card, navigates in the app); Copy
    link gives the `weave.localhost` form; the text form
    `weave~NqgQ/ideas/aq1i` becomes a link too. Nothing stored is rewritten.
  - No inline preview cards: Claude Code doesn't document rendering MCP UIs,
    so the browser pane is the preview.
- **The Claude desktop app, tried on Windows (undocumented, may change with
  any app update; Weave treats all of it as hints and falls back quietly):**
  - `claude://code/new?folder=<path>&q=<prompt>` opens a new Claude Code
    session in that folder with the prompt filled in (the app's own `ccd
    <folder>` uses it; only the SSH form is documented). No `claude` command
    needed. `claude://code/continue?session=last` returns to the last one.
  - The app's log (`%LOCALAPPDATA%\Claude\logs\main.log`) has a line for every
    session you switch to (`LocalSessions.setFocusedSession: sessionId=local_…`),
    and, when you send a message, which Claude Code session that is (`Mapping
    internal session local_… to CLI session <id>`): the transcript's id, whose
    `custom-title` lines hold the title the sidebar shows. So Weave can follow
    the session you're looking at, and attach a session started by Work on
    this to its work item the moment you send the first message.
  - The window title is just "Claude", and the app's accessibility tree stays
    closed to UI Automation unless the system's screen reader mode is on.
  - `claude://claude.ai/epitaxy/<session id>` opens an existing session (the
    app's own `list_sessions` gives these links).
  - Renaming: only from inside the app. Agents there have a tool to rename any
    session (titles the app generated change without asking; ones you set ask
    you first), and you have `/rename` and the sidebar. The new-session link
    takes no name, so Work on this asks the new session's agent to name itself
    after the item.
- **Sessions and work items are many-to-many, and attached on purpose only.**
  A session can serve several items over time and an item can have several
  sessions. A session is attached to an item only when you say so: Work on this
  (the session it starts), or Attach to work item in the panel for the session
  in view. Mentioning an item's link attaches nothing. The panel looks up the
  items attached to the session in view and shows none when there are none.
- **Later: messages into a running session** through Claude Code channels
  (research preview, needs a development flag today).

Your own agents' replies notify you (today they don't, because they count as
yours).

## New pieces, by layer

| Layer | New |
| --- | --- |
| core | delegation `scope` and `profile`; `weave.project.agents`; board verbs (read, post, chat, vote), agent grantees and own boards in access lists; board edit mode; session segments on work items; post tags; boosts (self-sealed) |
| node | session log (item ↔ session segments); scope checks (sign and verify); per-agent daemon tokens; `today()`; `assign` an issue to an agent; planning context (ideas, hot, open issues); harness setup (cowork project, journal board) |
| cli | `weave hook <event>` for Claude Code hooks; `weave statusline`; `weave link-checkout` (writes a checkout's local Claude Code config) |
| mcp | `weave_today`, `weave_plan_context`, `weave_assign`, `weave_boost`, `weave_tag`, `weave_set_board`; creating boards and work items in other projects |
| desktop | Work on this / Open session; transcript segments in a work item's chat; the overlay; Today; inline editing and edit modes; tags, the work item filter and boosts on Hot; agents in Keys & devices (profile, scope, cowork project); project agent policy and board permissions in project Settings |

## Order

Built on the harness branch: post links and pages, the Mentions panel with
Follow Claude Code, weave_show (with post cards), the Claude bundle.

1. **Sessions**: the provider layer with Claude Code (desktop app and
   terminal), the session stack (tools, sealed storage, the side panel
   following the session you're looking at), Work on this, each item's
   sessions with a way back.
2. **Your desk and routines**: desk setup (Journal, Ideas, folder), scheduled
   routines with the Routines UI, shown and hidden runs, Prepare for the day
   and Day Planning as the first two.
3. **Extensions**: the manifest, running them, signals (app in front, window
   title, idle), the template; Pep talk as the first one.
4. **Hot for work**: post tags, the work item filter, boosts.
5. **Agent identity**: profile and scope in delegations, per-agent daemon
   tokens with scoped reads, folders linked to their project's agent.
6. **Project agent policy** and agent grantees in access lists.
7. **Board permissions**: verbs, own boards, Mine in every project.
8. **Editing posts**: edit modes, inline editing.

The embedded runner (Agent SDK) stays an option for agents that should run
without Claude Code open; it reuses the session log and transcript view.

## Open questions

- Planning across contexts: with reads following the scope, your personal
  agent in Today can't see company issues. Does each agent plan its own part
  (Today shows the Work agent's plan next to Tom's), does each cowork project
  keep its own Today, or does Today get a planning agent that sees only
  titles across scopes, never contents?
- Should the runner keep going while the desktop app is closed (the daemon runs
  it), or only while the app is open?
- How does a project's "require" handle a member without a qualifying agent:
  they can still work themselves, but their agents can't sign there?

Decided (23 October): one Journal board (an entry per day) and one Ideas
board; Weave may add a SessionStart hook to your Claude Code user settings
during setup (so tools know the calling session); the daily driver acts as
your existing agent `claude` for now; prep items run as forks; the daily
driver's sessions run in a dedicated desk folder (`C:\Users\marti\Weave Desk`,
created by setup with a generated `CLAUDE.md`); folders and projects are
many-to-many, and the agent starting a session picks the folder (or asks).
