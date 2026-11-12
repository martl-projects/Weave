# Onboarding links

One short link that makes a newcomer's account, makes them friends with whoever sent it, lets them into a project and opens it (idea bZFDCQNT, built on the branch `kett-onboard`, on top of `web`).

```
https://web.martl.io/j/Pf3kQ9xz#C6lmA1PPVeyydW9vjYznew
                        code     secret (never reaches a server)
```

## The plan

A link holds a plan: steps from a fixed set, run in order (`packages/core/src/onboard.ts`).

| Step | What it does |
|---|---|
| `account` | Weave Web makes an account at the storage node. Someone with Weave already skips it. |
| `contact` | The creator becomes a contact (their contact link). `friends`: the creator adds them back; `enc` is the creator's encryption key for that. |
| `join` | A space joined with its invite link (or a knock link: the creator is asked first). |
| `open` | The space to open at the end; `play`: with its app. |
| `welcome` | A line from the creator. |

A client keeps the steps it knows and skips the rest, so plans can grow.

The plan is sealed with a key derived from the 16-byte secret after the `#`. The storage node keeps it under the code and can't open it. To use the link, a client shows a check derived from the secret, so a preview fetch that has only the code uses nothing up.

## The storage node

`packages/node/src/storageplans.ts`, requests on the storage socket (`packages/net/src/storageclient.ts`):

- **`plan.put`** by a planner, signed as their key over the connection (`planMessage`). Only keys the operator named may put plans: `weave-storage planner <did>` (`--off` to stop). A computer that isn't allowed is told the exact command, with its key.
- **`plan.get {code}`** gives the sealed plan while the link works: not taken back, not expired, not used up.
- **`plan.take {code, check, account}`** counts a use. With `account`, it hands out a one-time account invitation, so the link is the invitation and nobody makes them by hand.
- **`plan.revoke`** and **`plan.list`** for the creator.
- **Open preview:** `/preview/<code>` (title, line, whether there's a picture) and `/preview/<code>.png` (at most 300 KB). A node that serves the page serves `/j/<code>` with the og: tags itself.

## The creator

`createOnboardLink` (`packages/node/src/onboard.ts`; in the app, a project's Invite dialog → Link to play) makes the plan from the creator's contact link and invites to the project and any more of their spaces. The preview is the project's title, a line and its banner or icon (PNG only), or nothing.

The creator's node keeps, sealed to itself, which invites belong to which link:
- **Friends both ways.** A newcomer who follows a friendly link boxes their own contact link to the creator's encryption key, in the space they joined (`weave.onboard.hello`). The creator's node adds them back by it, as two friends add each other. That is what lets the creator's node reach a browser's storage node at its meeting point. Without one after two minutes (an older Weave), it follows alone.
- **Taking a link back** stops its code and closes its invites (`closeInvite`): whoever came in stays, and a forwarded copy of the plan lets nobody new in.

## The newcomer

- **Weave Web** (`apps/web/src/app.ts`): `/j/<code>#<secret>` leaves the address bar at once. The page opens the plan, and the welcome says who invites to what, or why the link no longer works. Making the account takes a use, which brings the invitation; once online, the steps run (`followOnboardLink` with `counted`) and the project opens. With an account in the browser already, the renderer's Join? dialog asks after unlocking.
- **The desktop app:** Open link (or a link handed over) knows such links: who invites, to what, and Join.

## Link previews on web.martl.io

`apps/web/src/preview-function.ts`, bundled by `pages.ts` into `dist/functions/j/[code].js`. The workflow deploys from `dist/`, so wrangler takes `functions/` with the page. The function returns the page Pages has, with the og: tags from the storage node's preview, escaped, and the page's CSP. Only text comes from the storage node, so a storage node taken over can't change the code browsers run.

## Not in it

- **Playing in the browser** is the web branch's rooms over the storage node's relay (step 9 of docs/web-stage2.md). The link opens the project with its Play, as far as that works on the web.
- **Name and avatar after the passkey, words last:** the web's onboarding still asks the name first and shows the words right after.
