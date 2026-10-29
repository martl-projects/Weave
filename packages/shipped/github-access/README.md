# GitHub access

Gives a project's members access to GitHub repositories: the project's own (where its releases come from), or
those a maintainer chooses (from those their GitHub account reaches). Members who proved their GitHub account and shared it with the
project get access, and whoever leaves loses it again. Read access to an organization's repository; write access to
a person's (GitHub has no read-only collaborators there).

A repository can be chosen in any number of projects (it gets everyone any of them lets in), and a project can choose
any number of repositories.

It ships with Weave and acts on GitHub as whoever runs it, with their own GitHub App: they make it once, with one
click on GitHub (Weave hands GitHub the App's manifest: Administration write and Metadata read, nothing else), and
install it on the repositories members get access to. The App's key stays with the service on their computer, for
every project they run it in: Weave signs the App's tokens for it, and the service never reads the key. No app of
Weave's or of anyone else's is involved. A token of theirs (GITHUB_TOKEN) works instead. Members prove their GitHub account once, in Keys & devices (a secret gist
naming their Weave id, checked by GitHub's verifier), and choose which projects see it. Weave only tells it who is in
a project and whose accounts hold: it knows nothing of GitHub. Each change it makes is recorded in the project
(github.added), so it only ever takes back access it gave. It reaches `api.github.com` only.

A project that only hands out builds (GitHub releases) doesn't need it: it gives people the code.

    weave service add --shipped github-access --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=… --setting REPOS=acme/site

(GITHUB_TOKEN, a token of yours, instead of the App: it stays yours, like the App. REPOS is the project's.)
