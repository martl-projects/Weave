# GitHub (accounts)

Checks that a GitHub account is a person's: they make a gist on github.com, signed in as that account, holding their
Weave id, and give its address. Anyone's Weave asks GitHub whether the gist belongs to that account and holds that
line, so nobody has to take anyone's word for it. Delete the gist, and the account is no longer theirs in Weave.

It's a verifier: a client app every Weave runs when it needs to know (on a hub, for a project's GitHub access). It
reaches `api.github.com` only, without signing in.
