# v2 stage 2: keys at rest, history for newcomers, direct chats, the grace key

Built on stage 1 (docs/v2-stage1.md). Spec: change 17 (key management) and the proposal "Key management and who holds what, aligned with v2"; Work board item "v2 stage 2".

Nothing here changes the wire in a way v0.4 can't follow: v0.4 peers ignore the new message and the new kind. It ships as v0.5.

## 1. Direct chats keep their identity when an encryption key rotates

Today a direct chat's id and key are derived from the pair key of both people's *current* encryption keys. When either rotates their encryption key (`weave keys rotate --encryption`), the chat becomes a different space: new id, new key, history in the old one out of reach.

**Decision:**
- **Fixed id:** derived from the pair key of both people's *first* encryption keys. For everyone who never rotated, that is the id they have today.
- **One epoch per pair of encryption keys:** `epoch = 1000·i + j`, where `i` indexes the encryption keys of the person whose identifier sorts first and `j` the other's. Both ends compute the same keys (X25519 is symmetric) and the newest pair is the highest epoch, so messages are sealed with it and every earlier one stays readable.
- Authority keeps each person's encryption keys in order (the identity's, then each rotation that names one), so the peer's history is known; one's own comes from the stored encryption keys.

## 2. Closing the grace key

Stage 1's known limit: tags and meeting points also accept a space's previous key, so members who haven't got a new key yet still meet the rest; someone removed holds that previous key and keeps receiving the space's new (sealed) events until the rekey after.

**Decision:** a peer that proves only the *previous* key of a space gets that space's **key events only**: its rekey events, sent as `{t: 'keys', space, items}`, not ingested by the receiver but offered to its node, which takes a new key only from a manager of the space and only if a box opens for it. A member who was just behind opens their box, holds the current key, says hello again and syncs fully. Someone removed has no box: they learn that a rekey happened (which they know), and nothing else.

Each side decides this from its own keys: a match on its current key's tag is full sync, a match only on its previous key's tag is keys-only. A behind member sees a full match from its side and may send what it has (to a member: fine).

## 3. History for newcomers

A space setting, `weave.space.history {history}`: `all` (as today, the default), `30d` or `joining`. Set by whoever manages the space (owner, maintainers, moderators), a control event, shown in the space.

What a newcomer gets, in invites and in gifts on admission (knocks, tiers, groups brought into a project):
- `all`: every epoch.
- `30d`: the epochs that began within the last 30 days, and the one that was current 30 days ago. So that this stays near 30 days, a managing node rotates a `30d` space's key when its current epoch is older than 30 days (on start and before handing keys over): a newcomer reads at most about two months back.
- `joining`: before handing keys over, the space's key rotates (boxed to the members), and the newcomer gets only the new epoch: they read from the invite on.

An epoch's start is the time of the rekey event that made it (its epoch number is in the clear); epoch 0 starts with the space. Board keys of read-limited boards are handed over as before (they go only to their readers).

## 4. Keys at rest

Every file that holds a secret key is sealed with a **home key**: identity (device key), encryption keys, agent keys, space keys, the GitHub token, app settings and the phone pairing. The home key is wrapped by the OS keystore and never written in the clear:

| Platform | Keystore | How |
|---|---|---|
| Windows | DPAPI (current user) | PowerShell `ProtectedData` |
| macOS | Keychain | `security` generic password |
| Linux | Secret Service | `secret-tool` |
| none of these | file | the home key in `vault.json`, with a warning in `weave status` and the app |

- `vault.json` names the keystore and holds the wrapped key (or, on macOS and Linux, the item's name).
- A copied `~/.weave` folder can't be opened on another computer or as another user: Weave says so and points to restoring from the recovery words.
- Homes from before: files in the clear are read and sealed on the next start.
- The backup `~/.weave-backup-v0.3` from the move to v0.4 stays as it was (it's for going back to v0.3, which can't read sealed files): it holds keys in the clear, and the release notes say to delete it once v0.4+ works.
- Tests and CI use `WEAVE_KEYSTORE=file`; one test runs the real keystore of the platform it's on.

## Order of work

1. Direct chats: encryption-key history in Authority, `directSpace` with epochs and a fixed id; tests with a rotation on either side.
2. The grace key: match levels in PeerSession2, `keys` message, the node takes offered keys; tests (removed member gets no content; a behind member catches up).
3. History setting: kind, state, `setHistory` (node, CLI, MCP), keys handed over by it, rotation for `joining` and `30d`; tests.
4. Keys at rest: the vault, sealed key files, migration of clear files; tests (file keystore everywhere, the real one once).
5. Release v0.5 with a release post.

## As built

- **Newcomers who don't get earlier keys get a carry.** Membership, roles, boards and rules are control events sealed under the space's earlier epochs; without them a newcomer under `joining` or `30d` couldn't even tell who the owner is. So whoever hands keys over also writes `weave.space.carry`: the space's earlier control events and its latest state (page, app, channels, curation, theme) restated under the current key, with their original ids, authors and times. A newcomer takes a carry only from the person who handed them the keys (`via`, kept with the space), whom they trust for the keys anyway. It's the carry-forward of stage 3 in its first use.
- **Only managers rotate.** In groups any member may invite, but only the owner's new keys count for the others; a member inviting into a `joining` or `30d` group hands over what the setting allows without a new key.
- **The node announces at once when a key changes.** Before, it announced on the next tick, and what it wrote right after a removal (the rekey, the next post) still went to the removed member. Now a removed member doesn't even receive it sealed (the daemon test checks).
- **A space's sync restarts when its key changes**, and new rekeys also go to peers that are behind.
- **Keys at rest:** opening a home costs one call to the keystore per process (about 0.7 s with DPAPI through PowerShell). Secrets read only now and then (GitHub token, app settings, phone pairing) are sealed when the node starts, not when first used. A home copied to another computer or user is refused with a message pointing to `weave restore`.
