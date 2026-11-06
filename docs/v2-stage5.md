# v2 stage 5: keepers

Built on stages 1–4. Spec: "Keepers" (change 17's companion) and the guarantee that a conversation can be recovered even if both people lose their devices; Work board item "v2 stage 5".

Small spaces have few copies: a direct chat lives on two people's devices. If both lose them, it's gone. Keepers fix that: friends who keep a wrapped, padded copy of your small spaces, which they can't read and can't tell apart.

**On 6.11.2026 keepers were taken out: a person saves their own Weave as a backup file, and nothing new is kept with friends.** What follows describes keepers as they were built and ran until then; the two sections at the end ("The backup file", "Keepers are taken out") say what is true now.

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

Decided by martl on 6.11.2026: backing up your own data is your own job, and Weave gives you the tool. Keepers among friends ended with it (next section).

- **What it is:** one file, `weave-backup-<name>-<date>.weavebackup`, with everything the node holds: every event as it travels (your own space, direct chats, groups, projects, what is public), the keys of your spaces (so they open again), and your attachments.
- **What opens it:** a key from your recovery words, `H("weave/backup/v1" ‖ selfSecret)`, the same root the keepers' wrap keys come from. The file's head says whose it is and when it was made, in the clear; nothing else is readable, and the file alone opens nothing. The words are never stored with it.
- **How it's sealed:** blocks of compressed JSON lines, each under ChaCha20-Poly1305, bound to the head, the block's number and whether it is the last. A file that was changed, cut short or put together from two backups doesn't open (`packages/node/src/backupfile.ts`).
- **Saving:** Keys & devices → Backup → Save a backup…, or `weave backup <folder or file>`. The node remembers when; the app says so until a first backup exists and again when the last one is a month old (not for company accounts, whose company backs them up).
- **Restoring:** on a new computer, the recovery words and the file: in the app's "I have recovery words" form with the backup file picked, or `weave restore --backup <file>`. No peer, keeper or network is needed. Without a file, `weave restore` works as before and brings back only what others still hold.
- **Tested as a total loss:** every device gone and nobody else around; the words and the file bring back a direct chat, a small group, a project with its keys and a saved post, and the person can write in their spaces again. Other words, a changed file and a file cut short are refused, and leave the computer as it was (`packages/node/test/backupfile.test.ts`).

## Keepers are taken out (6.11.2026)

Before, every node kept up to 500 MB of its friends' sealed data without anyone agreeing to it: a friend couldn't know what was on their disk, a deletion couldn't reach copies while keepers were offline, and copies of abandoned accounts stayed for good. First they became a choice between two friends (built, reviewed twice by Skala and merged the same day, never released); then martl decided to take them out altogether. The backup file is what brings a person's data back.

**What is gone:** choosing keepers, sending (`keep` is neither sent nor taken), the quota, the switch between friends, `weave keepers on|off`. No node stores anything new for anyone.

**What is left winds the old copies down, and the update itself deletes nothing** (`holding.ts`, "copies from before"):

- **A node still gives back what it holds:** it answers `keeping?` for streams it holds and `kept?` with their items, so anyone can take theirs back, people who restore from their words and people still on a Weave with keepers too.
- **An owner asks, and never sends.** A friend is asked until they said they hold nothing of ours (someone who just restored doesn't know who does), then not again; someone no longer a friend only while they may hold something. What a friend holds and we lost is taken back. After an update, the keepers file a Weave with keepers wrote says who may hold a copy (`before`) until each is asked.
- **Copies go by a decision, or after a year:**
  - *The owner lets them go:* "Let this copy go" for one friend, "Let all copies go" for everyone known to hold one (`weave copies let-go [friend]`). Each is told (`drop`) when next met, once the owner holds everything that friend has. It warns when no backup was saved yet; it doesn't refuse. Told once, not for good: whoever answers that they hold nothing is done with.
  - *The keeper lets go:* "Let go of it", per friend or all (`weave copies drop [friend]`), with a warning that it may be someone's only copy. A keeper knows whose a stream is once its owner asked about it (only the owner can name its id); a `drop` for a stream known as someone else's is ignored.
  - *Nobody asked for a year:* a stream nobody asked about for 365 days is let go, a week after its year is over, at a later look. Only time the keeper's computer ran counts (after more than a day away, every stream's year moves on by that time), and the year starts when the keeper first counts (this release).
- **A node that just restored tells nobody to let go:** its file is new, so friends are only asked, and what they give back stays with them until its person decides.
- **Towards a Weave with keepers:** such an owner sends what a stream lacks at every ask; it gets what we hold in the first answer of a connection (to take back what it lost) and not again, so it has nothing to send over and over. An owner that knows keepers are gone says `choice` in `keeping?` and always gets the full answer. Asked in parts of 256 ids, streams with something in them first.
- **Former friends:** someone no longer a friend who may hold something of ours is still asked, and told to let go, when the two still meet (a space they share). If they don't meet at all (the firewall turns away whoever isn't followed), nothing can be told: that copy goes when its keeper lets go, or after its year.
- **One of our own computers** (it shares our own space) is never taken for the friend whose chat it also holds.
- **The keep index** (our small spaces and their keys, in our own space) is still written: it is how a self stream coming back from an old copy brings the spaces' keys, and our other computers take spaces from it.
- **In the app:** Keys & devices shows "Copies from before" only while such copies exist: friends who still hold one of yours, and what you still hold for friends. A paired phone sees where things stand; letting go is done at the computer. `keepers()` still answers with an empty `spaces` list and `quota` 0 for an app from before, which reads them.
- **Tested** (`packages/node/test/copiesfrombefore.test.ts`, with copies made by hand as a Weave with keepers made them): nothing new is kept with anyone; two people who lost every device get a direct chat and a small group back from three friends' old copies, and the copies stay; after an update nothing is deleted and nothing new is sent; one friend's copy is let go, then all, a former friend included; a keeper lets go of one friend's, of everything, and by itself a week after a year without being asked, and of nothing after two years switched off.

**Not changed, seen in passing:** a body forgotten by a board's rule stays inside the wrapped item at keepers (the envelope stays with the owner, so the tags still match and nothing is asked back) and would come back with a recovery from an old copy. It ends with the copies.

**For the release notes, at the top:** "Friends no longer keep copies of your chats. Save a backup file now (Keys & devices → Backup): it is yours, encrypted with your recovery words, and it is what brings your data back if your devices are lost. Copies your friends hold from before stay until you let them go (Keys & devices → Copies from before), and what you hold for friends stays until you let go of it or nobody asked about it for a year."
