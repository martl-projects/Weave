# GitHub access

Keeps the repositories linked to a project (or a group, a tier) in step with who is in it: members who proved their
GitHub account get read access, people picked get write access, and whoever leaves loses it again.

It ships with Weave and acts with its own token: one of an admin of the repositories (Administration: read and write),
kept in the project by its maintainers. Weave tells it who should have access; it gives and takes it on GitHub, and
records each change in the project (weave.github.added), so access it gave is taken back later. It reaches
`api.github.com` only.

A project that only hands out builds (GitHub releases) doesn't need it: it gives people the code.

    weave service add --shipped github-access --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=…
