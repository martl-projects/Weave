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

## Open

- iOS shows a push only for the home-screen app, never in a Safari tab.
- A target lives as long as its browser's subscription; a browser that forgets the account drops its address.
