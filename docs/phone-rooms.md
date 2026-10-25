# Playing in a room from the phone app

The phone app uses your computer's node: it holds no identity of its own. Joining a room was already allowed from the phone, but **Play** opened the room's address, `http://<app>.weave.localhost:<port>/…`, which is a port on the computer. On the phone that points at the phone, and nothing loads.

## How it works now

```
phone browser ──TCP──▶ phone worker (127.0.0.1:p) ══encrypted══▶ computer's node ──TCP──▶ room's port on the computer ══▶ host
```

1. **Play** on the phone asks the worker for `openRoom(room, url)`, where `url` is the room's address on the computer.
2. The worker listens on `127.0.0.1` on the phone, on the same port number as the computer's address if it's free, so the app's origin (and what it saves in the browser) stays the same from one game to the next. It answers with `http://127.0.0.1:<port><path>`.
3. Each TCP connection the browser makes to that port becomes one new connection from the phone to the computer's remote-access key, with the phone's paired key pair, starting with the line `{"tunnel": "<room id>"}`. After that line the connection carries only the browser's bytes. HTTP, keep-alive and WebSockets all pass through unchanged.
4. The computer's node (`remote.ts`) accepts it only from a paired phone. It asks `roomPort(room)`, which gives the port of the room's address, and only while the computer is in that room: the joined room's local tunnel, or the app itself for a room the computer hosts. Then it splices the connection onto that port. If there's no port, the connection is closed.
5. From there it's the computer's own room tunnel (`live.ts`): the computer signs the proof and the host checks the invitation. To the host, the phone is the computer's person, which is who it is.
6. The address opens in an in-app browser (`@capacitor/browser`: SFSafariViewController on iOS, a Custom Tab on Android).

## What the phone can and can't do

- It reaches only rooms its computer is in right now. Joining and leaving are the same allowed calls as before (`joinRoom`, `leaveRoom`). It can't reach any other port on the computer, and can't host or start apps (`hostRoom`, `launchApp` stay off `PHONE_METHODS`).
- Room auth stays on the computer. The phone never sees a room key or a device key.
- Unpairing the phone on the computer cuts its open tunnels at once. **Forget this computer** on the phone closes its local ports and their connections.
- The local port on the phone is open to the phone itself, like the room's port on a computer is open to that computer.

## Why this, and not…

- **A native WebView of our own over the app:** this would need more native code on both platforms for the same result. The system's in-app browser already keeps the app in front on iOS, which matters because iOS suspends the worker of an app in the background.
- **An iframe in the app's WebView:** the app's own page is `capacitor://localhost` or `https://localhost`, and Android refuses mixed content. Third-party cookie and storage rules would also hit the game.
- **Opening Safari or Chrome:** the app goes to the background and its worker, which carries the connection, is suspended.
- **HTTP forwarding as calls over the existing phone session:** this means parsing HTTP and framing bodies, and WebSockets need streams of their own. One encrypted connection per TCP connection is what room tunnels already do (`live.ts`), and the node only splices bytes.
- **Sending phone connections straight to the host:** the phone would need an identity the host accepts, or the computer's keys. Both go against "the phone holds no identity".

## Costs and limits

- Each browser connection is one new DHT connection to the computer: a page's first load opens a few. Keep-alive and WebSockets reuse them. Room tunnels on computers work the same way.
- Android pauses the app under a Custom Tab, and the worker plugin suspends the worker on pause. While a room's app is open, the bridge asks the plugin to `hold` the worker, and lets go when the tab closes. iOS needs nothing: the browser opens inside the app.
- The phone's address is `127.0.0.1`, not `<app>.weave.localhost`, because a phone browser may not resolve `*.localhost`. Apps see that as the `Host` header.
