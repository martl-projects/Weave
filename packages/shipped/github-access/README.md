# GitHub access

Keeps GitHub repositories linked to a project (or a group, a tier) in step with who is in it: members who proved
their GitHub account there get read access (or people picked, write access), and whoever leaves loses it again.

It ships with Weave and does everything GitHub itself, with its own token: one of an admin of the repositories
(Administration: read and write), kept in the project by its maintainers. Maintainers link repositories in its panel;
members prove their GitHub account in the project (a gist naming their Weave id, checked by GitHub's verifier).
Weave only tells it who is in the space and whose accounts hold: it knows nothing of GitHub. Each change it makes is
recorded in the project (github.added), so it only ever takes back access it gave. It reaches `api.github.com` only.

A project that only hands out builds (GitHub releases) doesn't need it: it gives people the code.

    weave service add --shipped github-access --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=…
    weave service ask github-access "link" -p <project> --action link --input '{"repo": "acme/site"}'
