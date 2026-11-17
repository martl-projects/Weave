# The push relay, and running your own

Weave Web gets notifications while it's closed through Web Push (docs/web-push.md). The browser subscribes at Apple, Google, Mozilla or Microsoft, and that push service takes messages only from the server whose key (VAPID) the subscription was made with. That server is the **relay**: the storage node the browser's account is at.

## Where it is

For Weave Web at **web.martl.io**, the relay is **storage.martl.io**, the storage node martl runs (a Hetzner server, set up as in docs/web-deploy.md). The notification settings say which relay a browser uses ("Relay: storage.martl.io").

The desktop app needs none: it hears from others directly, peer to peer, while it runs.

## What it holds, and what it sees

- Its VAPID key pair (`vapid.json` in its folder, made the first time it's needed).
- For each account, the subscriptions of its browsers (the push service's endpoint, and the browser's `p256dh` and `auth`), and the addresses senders push to: one for each place and each person who may push there (a place's maintainers or moderators, a group's owner, the other one in a direct chat).
- When a push comes, it sees the address, who says they sent it (`from`), the time and the size. It never sees the text: that is sealed by the sender to a key only the browser holds.

What it can't do: read a notice, or make one the browser shows. It doesn't know the keys senders seal to (those are sealed to the senders, in the place), and the browser shows only what opens with the key of the address it came to.

What it could do if it misbehaved: keep pushing to a browser after an address was taken back. The browser shows none of it (the key for that address is gone), and **Renew everything** in the notification settings ends the subscription at the push service itself, so nothing the relay kept reaches the device any more.

## Running your own

A relay of your own is a storage node of your own, with a Weave Web page that uses it: the page names its storage node when it's built, and a browser's account, its passkeys and its pushes belong to that page's address. Accounts at another page are separate (the 24 words bring the same person in anywhere; passkeys are made per page).

1. **A server and a name.** Debian 12 or 13, or Ubuntu 24.04, a public IPv4 address, and a DNS record for the name (say `web.example.org`) pointing at it.
2. **Set it up** as docs/web-deploy.md says, with your name:

   ```bash
   node apps/server/deploy/pack.ts
   ```

   ```bash
   scp apps/server/dist/weave-storage-*.tar.gz root@SERVER:/root/
   ```

   ```bash
   cd /root && tar -xzf weave-storage-*.tar.gz && cd weave-storage-*/ && WEAVE_DOMAIN=web.example.org bash setup.sh
   ```

   One server then serves the page and the storage node, over HTTPS (Caddy gets the certificate). Pushes are on with it: the storage node sends them with `--origin` as its contact for the push services, and makes its VAPID key when the first browser subscribes.
3. **Check it.** `https://web.example.org/health` says `ok`, and a push to an address that doesn't exist is turned away as unknown:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{"from":"did:key:zCheck","sealed":{}}' https://web.example.org/push/nosuchaddress
   ```

   prints `404`.
4. **Invite people** with `weave-storage-invite`: each link opens one account there.

**Keep `vapid.json`.** It is in `/var/lib/weave-storage`, with the accounts; back it up with them. A relay with a new key reaches none of the browsers subscribed with the old one: each of them would have to turn pushes on again.

## What a relay takes

- Push services only: it posts to `*.push.apple.com`, `*.googleapis.com`, `*.push.services.mozilla.com` and `*.notify.windows.com`, nothing else, whatever a subscription says.
- `POST /push/<address>` with `{"from": "<did>", "sealed": {…}}`, up to 8 KB: `202` sent, `404` no such address, `429` over the limit, `502` the push service said no.
- Limits: 30 pushes an hour from one sender to one address, 120 an hour to an address in all, and 1024 addresses an account.

## Senders and relays

- **A computer** posts a push straight to the relay the address names, any relay on HTTPS.
- **A browser** can reach only its own storage node (its CSP), so it asks that one to pass the push on, and for now that works only for addresses at the same storage node. Someone on web.martl.io writing to someone whose browser is at your relay: their computer's pushes reach it, their browser's don't yet.
