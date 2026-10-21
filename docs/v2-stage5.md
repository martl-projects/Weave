# v2 stage 5: keepers

Built on stages 1–4. Spec: "Keepers" (change 17's companion) and the guarantee that a conversation can be recovered even if both people lose their devices; Work board item "v2 stage 5".

Small spaces have few copies: a direct chat lives on two people's devices. If both lose them, it's gone. Keepers fix that: friends who keep a wrapped, padded copy of your small spaces, which they can't read and can't tell apart.

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
