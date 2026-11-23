# Push notifications for Weave Web

From the conversation on 2026-11-14, building on the idea [Notifications the native way](http://weave.localhost:7710/weave~NqgQ/ideas/CqDp) (CqDpJz5z). Decided: **Weave Web first** (Web Push: Android Chrome, the iPhone home-screen app since iOS 16.4, desktop browsers), and **the sender's device** works out the notification and encrypts it, so it reaches a phone even while all of its person's devices are off. The native phone app (APNs/FCM) follows with the same message format.

## What nobody in between sees

- **The push service** (Apple, Google, Mozilla): Web Push encrypts every message to the browser (RFC 8291). It sees the endpoint, the time and the size.
- **The relay** (the recipient's storage node): it holds the browser's subscription and sends with its VAPID key (RFC 8292). What it sends is already sealed by the sender to the browser's push key: it sees who asked (a key), the time and the size, never the text.
- **The browser's service worker** opens it with the push key, which lives in IndexedDB outside the sealed home: a key that opens notifications and nothing else, so a closed, locked Weave can still show one.

## The pieces

1. **The relay** (storage node): `VAPID` keys of its own (made once, kept in its folder). An account registers a subscription and gets an **address** (random, revocable). `POST /push/<address>` with `{from, sig, sealed}` sends it on. Limits: a sender's key may push to one address N times an hour, an address takes M an hour in all; the account can drop an address any time.
2. **The browser** (Settings → Notifications on this device): asks the browser's permission, subscribes with the relay's public VAPID key, makes the push key, registers the subscription, and publishes a **push target** `{relay, address, key}`.
3. **Where targets are published**: in the person's profile, so everyone who shares a space with them can reach them. That's the door the sender-side choice opens: whoever can see the profile can push. The limits above, the sender's key in every push, and blocking (a blocked key's pushes are dropped by the relay once the person tells it) keep it in check.
4. **The sender**: when it writes a direct message, mentions someone or replies to their post, its node seals a short notice (`{type, from, title, text, open}`, the same Notice as in the app) to each of the recipient's targets and posts it to the relay. A browser asks its own storage node to forward (its CSP lets it reach only that one); a computer posts directly.
5. **The service worker** decrypts, shows the notification (iOS demands one per push), and a tap opens the place (`open`). A tab of Weave that's open and in front gets none.

## In stages

1. Relay: VAPID, Web Push encryption, subscribe/address/drop, limits. Tested against a real Web Push subscription in Chrome (browser-check).
2. Browser: the setting, subscription, push key, the service worker showing it. A test push from the person's own node ("this is how it looks").
3. Targets in the profile, and the sender side for direct messages.
4. Mentions and replies; blocking at the relay.
5. The native app (APNs/FCM) with the same sealed notice.

## Stage 3, as decided on 2026-11-17: an address per place, seen only by those who manage it

The profile is public (anyone who syncs a person's replica reads it), so targets don't go there. Instead:

- **One push key and one address per place and per sender**, per browser: in a place, each of its managers gets an address and a key of their own (`managersOf`: maintainers, moderators, a group's owner; in a direct chat the other one). Each can be taken back on its own: the browser deletes the key first, then drops the address at its relay.
- **Sealed to each of them**: a `weave.push.target` event in the space, `{device, boxes: {did: Box}}`, each box `{relay, address, key}` sealed to the one it's for. The other members see that there is one, never what's in it. A manager who comes gets a new address; one who goes loses theirs, and nobody else's changes.
- **Taking back doesn't depend on the relay**: the service worker shows only what opens with the key of the address it came to. An address taken back has no key any more, so whatever a relay still sends there (one that doesn't forget) isn't shown, not even as a plain line; and a relay can't put a push under another address, since it wouldn't open with that one's key. **Renew everything** ends the subscription at the push service (Apple, Google…) and makes a new one with new addresses everywhere: then nothing any relay kept reaches the device. Running a relay: docs/push-relay.md.
- **Off is off**: a place set to "Quiet" (or "Count only": iOS shows every push) takes its address back (`{device, off: true}`), and so does turning pushes off in the settings.
- **The sender**: when a manager (or the other one in a direct chat) writes a message, its node opens the targets sealed to it in that space, seals a short notice to each target's key (`{title, text, open, tag}`) and hands it to the relay. A computer posts it (`POST <relay>/push/<address>`, `{from, sealed}`); a browser asks its own storage node (`push.forward`), the only place its CSP lets it reach. For now a storage node forwards only to its own addresses.
- **The service worker** knows each address's key (IndexedDB, by address; the relay sends `to` with every push).

So for now: direct chats, and what the people who run a place say there. Mentions and replies by anyone (stage 4) need a target for those who aren't managers, likely one per conversation.


## Open

- iOS shows a push only for the home-screen app, never in a Safari tab.
- A target lives as long as its browser's subscription; a browser that forgets the account drops its address.
