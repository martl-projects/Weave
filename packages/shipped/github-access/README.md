# GitHub access

Gives a project's members access to GitHub repositories: its maintainers add it, sign it in to GitHub and choose
the repositories (from those the sign-in reaches). Members who proved their GitHub account and shared it with the
project get access, and whoever leaves loses it again. Read access to an organization's repository; write access to
a person's (GitHub has no read-only collaborators there).

A repository can be chosen in any number of projects (it gets everyone any of them lets in), and a project can choose
any number of repositories.

It ships with Weave and does everything GitHub itself, with its own sign-in: one of an admin of the repositories,
kept in the project by its maintainers. Members prove their GitHub account once, in Keys & devices (a secret gist
naming their Weave id, checked by GitHub's verifier), and choose which projects see it. Weave only tells it who is in
a project and whose accounts hold: it knows nothing of GitHub. Each change it makes is recorded in the project
(github.added), so it only ever takes back access it gave. It reaches `api.github.com` only.

A project that only hands out builds (GitHub releases) doesn't need it: it gives people the code.

    weave service add --shipped github-access --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=… --setting REPOS=acme/site
