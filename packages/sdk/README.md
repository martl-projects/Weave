# @weave/sdk

Who is playing, for apps shared in [Weave](https://github.com/martl-projects/Weave) rooms.

When a host shares a project's app in a room, players reach it through an encrypted tunnel. To the app, every player arrives from `127.0.0.1`, so it can't tell them apart, or tell the host from a player who types `/host`. The host's Weave knows who opened each connection. This asks it.

One file, no dependencies, Node 18+ or Bun. `require` it, `import` it, or copy `src/index.cjs` into your app.

```js
const { connect } = require('@weave/sdk');
const weave = connect(); // undefined when Weave didn't start the app

http.createServer(async (req, res) => {
  const who = weave && (await weave.who(req));
  // who: { did, name, host, member, maintainer, room } or undefined
  if (who?.host) return serveStage(req, res);
  servePlayer(req, res, who);
});
```

For http services, Weave also puts the player in every request as `X-Weave-Person`, signed with the app's token: `weave.who(req)` reads it first, without asking Weave, so it works in a container or behind a proxy too (pass the request, not just its socket). With WebSockets, ask once on the upgrade request: `weave.who(req)` there tells you who the socket belongs to for as long as it's open. With `Bun.serve`, pass `server.requestIP(req)`.

## What you get

| Call | Answers |
| --- | --- |
| `weave.who(req)` | The person behind a connection, with the room they came through. The host's own browser (straight to the app) counts as the host. `undefined` for connections that didn't come through Weave, such as phones on the same Wi-Fi. |
| `weave.me()` | The host. |
| `weave.project()` | The project, its open rooms with the people in them, and its groups. |
| `weave.access(did, { group })` | What someone is in the project, and which of its groups they're in. Groups are the ones invited into the project, plus the host's own groups and tiers. `group` (id or name) asks about one. |
| `weave.tickets(did)` | The project's shows someone holds a ticket to (paid on chain into the show's Safe), each with `open` while it's on: let them into a paid live room while it's true. |
| `weave.badges(did)` | The project's badges someone holds, like Super Supporter #7 of 20: only valid ones, checked against the signatures of the maintainer who gave them. Badges are recognition; show something special for them, never lock access behind them. |

A person is `{ did, name?, host, member, maintainer }`. Use `did` as the player's id: it stays the same across devices and name changes, so a player who reconnects keeps their seat, and nobody needs a name form.

## How it works

When Weave starts the app (the Start button in Live), it sets three environment variables:

- `WEAVE_API`: the app API, `http://127.0.0.1:<port>`
- `WEAVE_TOKEN`: this project's token
- `WEAVE_PROJECT`: the project's id

For an app you start yourself, `weave app env -p <project>` prints them. They last until Weave restarts.

The SDK is a thin wrapper. Any language can use the API directly:

```
GET /v1/me                        the host
GET /v1/who?port=<remote port>    who is behind the app's connection from 127.0.0.1:<port>
GET /v1/project                   the project, its open rooms and people, its groups
GET /v1/access?did=<did>[&group=<id or name>]
Authorization: Bearer <WEAVE_TOKEN>
```

Every tunnel reaches the app from its own local port, and the host's Weave remembers which person's verified connection that port belongs to. `/v1/who` answers 404 for a port no room connection is using. Nothing is added to the app's own traffic, so it works the same for HTTP, WebSockets and plain TCP.

A token only reads about its own project, and the app can't act for anyone. The API listens on 127.0.0.1 only.
