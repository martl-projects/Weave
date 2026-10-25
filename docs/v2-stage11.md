# v2 stage 11: company policy and retention minimums

Built on stage 10 (company accounts). From the stock-take on Julian's "Business Version": the company controls its own spaces, but not what its accounts do elsewhere, and its retention can be loosened from below. This stage covers items 1 and 2 of that list.

## 1. A policy for company accounts

Part of the company's settings (`weave company policy …`), and published by the company (`weave.org.policy`, public), so every node can hold company accounts to it, not only their own:

- `outside: false`: company accounts create and join only the company's spaces.
- `directs: all | company | off`: direct chats with anyone, only with colleagues (accounts of the same company, or the company itself), or none.
- `public: false`: no public posts, shares or follows (except following colleagues and the company). Profile name, identity and links stay possible (links have their own switch).
- `chats: true`: chats between colleagues go through **company chats** instead of direct chats, so the company's keys, holds, archive and audit cover them: `weave company chat <colleague>` asks the company for a two-person company group; the company's node makes it and keeps those two in it.

Enforced where events are written and received: a company account's node refuses, and every node refuses what a company account signs against its company's policy after the company published it. Earlier events stay.

## 2. Retention minimums

Company settings `retention: {minDays, maxDays}`, for every company space:

- **Minimum (`minDays`)**: nothing in a company space is forgotten sooner. Post lifetimes don't end before `minDays` after their last activity, a board's size limit doesn't push out younger posts, board rules shorter than the minimum are refused, and shredding keys that ended within the minimum is refused, by the shredder's node and by every member's.
- **Maximum (`maxDays`)**: the company's node shreds what's older, in every company space (keys rotate monthly there). That includes group chat and channels, which had no rule until now. What board rules still keep is carried forward first, as with any shred; a legal hold stops it.
- Deleting a post only hides it: the original stays where it's held (archive nodes included). Deletions in company spaces now appear in the audit.

## Order of work

1. Policy: settings, public policy, enforcement when writing and receiving; company chats.
2. Retention: minimum in lifetimes, size limits, rules and shredding; maximum by the company's node.
3. Deletions in the audit.
4. CLI; tests.

## As built

- **Policy** (`weave company policy …`): part of the company's settings and published as `weave.org.policy`. Checked when events are written and received, from the time the company published it. In spaces the company doesn't own and in direct chats, the policy stops content (messages, posts); membership and keys pass, so a company account can always leave. Sealed events don't show their kind to anyone but their readers, and that's the line that can be drawn there. Publicly, name, identity, links, blocking and muting stay allowed, and following colleagues and the company.
- **Company chats** (`weave company chat <colleague>`): any colleague the company vouches for may ask; the company's node makes a two-person company group and keeps the two in it.
- **Minimum**: post lifetimes, size limits, board rules and shredding (the shredder's node and every member's) respect it.
- **Maximum**: the company's node shreds company spaces monthly beyond it. Unlike ordinary shredding, chat and posts from before the maximum go too; what stays for good (pinned, issues, proposals, releases) and the space's settings and page are carried forward. In company spaces, authors don't keep a private copy of their own work at a shred: the company's retention decides.
- **Found and fixed on the way:**
  - Shredding a company space lost its company setting, which is sealed with the keys alone; the owner now restates it first (and only the owner shreds a company space).
  - The audit dropped what a shred carried forward; it keeps it now.
  - A company half arriving after a key no longer leaves views decoded with the wrong key.
  - A company half that couldn't be published (the key service unreachable) is tried again on every reconcile instead of being lost.
  - Key service requests are retried once when a kept-alive connection drops.
- **Deletions** only hide a post; the original stays with whoever holds it, archive nodes included. They appear in the audit.
- Measured on 10k events: feed again 102 ms, posts 39 ms (as before).
- Tested against the Vault and OIDC stand-ins, as before.
