# v2 stage 5: keepers

Built on stages 1–4. Spec: "Keepers" (change 17's companion) and the guarantee that a conversation can be recovered even if both people lose their devices; Work board item "v2 stage 5".

Small spaces have few copies: a direct chat lives on two people's devices. If both lose them, it's gone. Keepers fix that: friends who keep a wrapped, padded copy of your small spaces, which they can't read and can't tell apart.

**Since 6.11.2026 keepers are off unless two friends both turn them on, and your own backup file is the first answer to losing your devices.** What follows describes keepers as first built; the two sections at the end ("The backup file", "Keepers are a choice") say what changed.

## What is kept

Your **self space**, your **direct chats**, and **groups and projects with 3 members or fewer**. For each, every event (as it travels, signed) goes to 3 keepers.

## Keepers

- **Who:** 3 of your friends (people you follow who follow you back), at random, never the other person of a direct chat. Friends of friends come later: a keeper accepts only from people it shares a direct chat with, so it can't be used by strangers.
- **Repair:** a keeper not seen for 14 days is replaced by another friend, who gets everything again.
- **Quota:** a node keeps up to 500 MB for others in all, and 50 MB per stream; beyond that it says no. What you keep for others and what others keep for you are shown side by side (reciprocity is shown, not enforced yet).

## What a keeper sees

A keeper stores **streams**: an anonymous id and wrapped items. From your recovery words (your first encryption key) come:

- `wrapKey(space) = H("weave/keep/wrap/v1" ‖ selfSecret ‖ space)`: items are sealed with it, after padding to a power of two (at least 256 bytes);
- `streamId(space, keeper) = H("weave/keep/id/v1" ‖ selfSecret ‖ space ‖ keeper)`: different for every keeper, so keepers can't match notes;
- `tag(space, event) = H(wrapKey ‖ event id)`: so a keeper can say what it holds without knowing what.

A keeper learns: that some friend of theirs has a stream, its size, and when it grows.

## Protocol (in PeerSession2, only between friends)

- `keeping? {ids}` → `keeping {id: tags}`: which items the keeper holds per stream (it answers for streams it holds, and with an empty list for new ones it's willing to keep).
- `keep {id, items: [{tag, data}]}`: the items it lacks; answered with `keeping` again.
- `kept? {id}` → `kept {id, items}`: everything of a stream, when the keeper holds items we don't (recovery).

## Recovery

Your self space holds a **keep index**: the spaces you keep, with their keys. After losing everything:

1. Restore from your recovery words on a new device (`weave restore`); your identity comes from anyone who holds it (your public events are everywhere).
2. Your friends are known from your public follows. For each friend, ask for your self stream: the index comes back, and with it your spaces' keys.
3. Ask for those spaces' streams, and your direct chats' (their ids follow from your friends).

Both people of a direct chat can recover it this way, each from their own keepers.

## Order of work

1. Core: padding, wrapping, stream ids and tags; keeper storage in the stores (quota).
2. Session: `keeping?`, `keeping`, `keep`, `kept?`, `kept`, through node callbacks.
3. Node: kept spaces, choosing and repairing keepers, the keep index, recovery, `weave keepers`.
4. Test: total loss on both sides of a direct chat, recovered through three keepers.
5. Release v0.8 with a release post.

## As built

- **Keepers are friends only** (a keeper accepts a stream only from someone it shares a direct chat with). Friends of friends need a way to reach and vouch for them first; not yet.
- **No weighting** by free space and uptime yet: keepers are picked at random among friends, and replaced after 14 days unseen. Reciprocity is shown (what you keep for friends, beside who keeps yours), not enforced.
- **Asking any friend, keeping with three:** every connection with a friend asks what it holds of our streams (that's how recovery finds them); items go only to the three chosen keepers.
- **Kept spaces:** your own space, direct chats, and groups and projects of 3 people or fewer. The keep index (your kept spaces and their keys) is written to your own space when it changes.
- Tested as a total loss: both people of a direct chat and a small group lose everything, restore from their recovery words, and get both back from three friends who never saw either.
- Shown in Keys & devices and in `weave keepers`.

## Amended 4.11.2026 (the keepers review, issue nn5l)

- **"Last seen" survives a restart:** it's written to disk at most once an hour as friends come by (`keepers.json`), not only when keepers or the keep index change; before, every update of Weave made keepers look long gone after 14 days of memory-only updates, and they were replaced, each new one getting everything again.
- **An empty direct chat gets no keepers:** a direct chat is derived for everyone whose log a node holds (so a message can be sent), but one with nothing in it has nothing to keep, chooses no keepers and isn't listed. Its stream is still asked for on every connection with a friend, because a chat you lost looks just the same: that's how recovery finds it (nothing is stored for an empty one).
- **A keeper no longer chosen lets the stream go:** `drop {id}` from the owner, sent once the owner holds everything that keeper has (never while something is still to be taken back), for a stream another keeper took over or of a space that isn't kept any more (a group that grew). Only the owner can name a stream's id.

## The backup file (6.11.2026)

Decided by martl on 6.11.2026: backing up your own data is your own job, and Weave gives you the tool. Keepers among friends are an option beside it (next section).

- **What it is:** one file, `weave-backup-<name>-<date>.weavebackup`, with everything the node holds: every event as it travels (your own space, direct chats, groups, projects, what is public), the keys of your spaces (so they open again), and your attachments.
- **What opens it:** a key from your recovery words, `H("weave/backup/v1" ‖ selfSecret)`, the same root the keepers' wrap keys come from. The file's head says whose it is and when it was made, in the clear; nothing else is readable, and the file alone opens nothing. The words are never stored with it.
- **How it's sealed:** blocks of compressed JSON lines, each under ChaCha20-Poly1305, bound to the head, the block's number and whether it is the last. A file that was changed, cut short or put together from two backups doesn't open (`packages/node/src/backupfile.ts`).
- **Saving:** Keys & devices → Backup → Save a backup…, or `weave backup <folder or file>`. The node remembers when; the app says so until a first backup exists and again when the last one is a month old (not for company accounts, whose company backs them up).
- **Restoring:** on a new computer, the recovery words and the file: in the app's "I have recovery words" form with the backup file picked, or `weave restore --backup <file>`. No peer, keeper or network is needed. Without a file, `weave restore` works as before and brings back only what others still hold.
- **Tested as a total loss:** every device gone and nobody else around; the words and the file bring back a direct chat, a small group, a project with its keys and a saved post, and the person can write in their spaces again. Other words, a changed file and a file cut short are refused, and leave the computer as it was (`packages/node/test/backupfile.test.ts`).

## Keepers are a choice (6.11.2026)

Before, every node kept up to 500 MB of its friends' sealed data without anyone agreeing to it: a friend couldn't know what was on their disk, and copies of abandoned accounts stayed for good. Now nothing is offered or taken unless both friends turned it on.

- **The switch:** per friend, "keep copies with each other" (Keys & devices → Keepers, or `weave keepers on <friend>`). It is one person's side: their node chooses keepers only among the friends they switched on, and takes streams only from those. So a copy exists only where both did. Whether the friend did shows by itself: a keeper that isn't willing leaves a new stream out of its `keeping` answer, and nothing is sent. No new message was needed.
- **Choosing keepers:** up to 3 of the switched-on friends per space, in an order that comes from the person's secret (`H("weave/keep/choice/v1" ‖ selfSecret ‖ space ‖ friend)`) and no longer at random, so two computers of the same person choose the same. The switch itself is kept per computer (`keepers.json`).
- **The update deletes nothing.** A node that ran before finds its keepers file without switches: nobody is on. As a keeper it keeps what it holds, read-only: it still answers `keeping?` and `kept?`, so anyone can take theirs back (old versions and people restoring too), and accepts nothing new. As an owner it sends nothing new and tells nobody to let go. Keys & devices says who still holds a copy from before.
- **Copies go by a decision, never by themselves** (`drop` in the stream list a node offers: told only once it holds everything that keeper has):
  - *The owner lets them go:* "Let the copies go" (`weave keepers let-go`): every friend not switched on is told when next met. It warns when no backup was saved yet; it doesn't refuse.
  - *The owner ends it with one friend:* switching them off tells that friend to let go.
  - *Among switched-on friends* the stream of a space no longer kept, or one another keeper took over, goes as before (4.11).
  - *The keeper lets go:* "Let go of it", per friend or all (`weave keepers drop [friend]`), with a warning that it may be someone's only copy. A keeper knows whose a stream is once its owner asked about it (only the owner can name its id).
  - *Nobody asked for a year:* a stream nobody asked about for 365 days is let go. An owner's node asks at every contact, so only streams of accounts that are gone age out. The year starts when the keeper first counts (this release), not when the stream was made.
- **A node that just restored tells nobody to let go:** its keepers file is new, so friends are only asked, and what they give back stays with them until its person decides.
- **What the owner knows:** each `keeping` answer says how many items that friend holds; the node writes it down (and asks once more after sending, so what was just taken counts). Keys & devices shows per friend: holds a copy, holds nothing yet (they haven't turned it on), holds a copy from before.
- **Not for a phone:** a paired phone sees where things stand; switching, letting go and dropping are done at the computer.
- **Tested** (`packages/node/test/keeperschoice.test.ts`): nothing lands at a friend until both turned it on; a keeper that ended it keeps what it holds and takes nothing new; after an update on both sides nothing is deleted and nothing new is sent; someone who loses everything right after the update still gets their chat back from a copy from before, and that copy stays; "Let the copies go" empties the keepers at the next contact; a keeper lets go of one friend's, of everything, and by itself after a year without being asked.

### After Skala's review (6.11.2026, same day)

- **A keeper says whether it takes.** `keeping` carries `takes`: true only where the keeper's person keeps copies with the asker. Nothing is sent to a keeper that doesn't say so, which includes every Weave from before the choice: an updated owner never lands copies on a friend who couldn't choose. An owner that knows this says `choice` in `keeping?`.
- **Places go to friends who take.** A switched-on friend who answered that it takes nothing is passed over like one not seen for 14 days, and comes back in when its answer changes. Friends who hold something of ours already are chosen first. A switched-on friend who isn't one of the three lets go only once three chosen keepers hold the space: an unwilling friend in a place never costs the copy that exists.
- **No sending over and over.** Per connection, a stream whose keeper still holds exactly what it held before our last send is not sent again (a keeper over its quota). Towards an owner from before the choice, a keeper that takes no more leaves the stream out after its first answer on a connection: the first still serves recovery, and the old owner has nothing to send at every new message.
- **"Let go" is told once, not for good.** `off` is per person and ends when they answer that they hold nothing; "Let the copies go" marks everyone not switched on who may hold something. Two computers of one person no longer undo each other at every meeting. One friend's copy from before can be let go alone (`weave keepers off <friend>`, "Let this copy go").
- **The year counts only while the keeper runs.** After more than a day away (switched off, a clock that jumped), every stream's year moves on by that time; and a stream whose year is over goes a week later, at another look. A keeper back after two years lets go of nothing.
- **Asked in parts:** `keeping?` goes out in parts of 256 ids, streams with something in them first, so a person with many chats gets all of theirs answered.
- **Former friends:** someone no longer a friend who may hold something of ours is still asked, and told to let go, when the two still meet (a space they share). If they don't meet at all (the firewall turns away whoever isn't followed), nothing can be told: that copy goes when its keeper lets go, or after its year.
- **A keeper's guard:** one friend's streams take at most 150 MB of the 500; a `drop` for a stream known to be someone else's is ignored; what a keeper gives back is decoded again only when something new was in it; one of our own computers (it shares our own space) is never taken for the friend whose chat it also holds.
- **Letting go as a keeper ends keeping with that friend,** or the next meeting would bring it all back.
- **Not changed, seen in passing:** a body forgotten or shredded by its owner stays inside the wrapped item at keepers (the envelope stays with the owner, so the tags still match and nothing is asked back). Shredded content is unreadable anyway (its key is gone); a body forgotten by a board's rule would come back with a recovery from keepers. Worth its own item.

**For the release notes, at the top:** "Friends no longer keep copies of your chats by default. Save a backup file now (Keys & devices → Backup): it is yours, encrypted with your recovery words. Copies your friends hold from before stay until you let them go there, and what you hold for friends stays until you let go of it or nobody asked about it for a year. If you want a friend to keep a copy as well, turn it on with them under Keepers; it works once they do the same."
