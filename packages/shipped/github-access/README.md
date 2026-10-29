# GitHub access

Links GitHub repositories with projects (or groups, tiers): a repository with any number of them, each with any
number of repositories. Linked, a repository gives nobody anything; its maintainers say per link who there gets access
(nobody, everyone, a board's readers, or people picked to write). Members who proved their GitHub account there then
get it, and whoever leaves loses it again.

It ships with Weave and does everything GitHub itself, with its own token: one of an admin of the repositories
(Administration: read and write), kept in the project by its maintainers. Maintainers link repositories in its panel, picked from those its sign-in reaches;
members prove their GitHub account in the project (a gist naming their Weave id, checked by GitHub's verifier).
Weave only tells it who is in the space and whose accounts hold: it knows nothing of GitHub. Each change it makes is
recorded in the project (github.added), so it only ever takes back access it gave. It reaches `api.github.com` only.

A project that only hands out builds (GitHub releases) doesn't need it: it gives people the code.

    weave service add --shipped github-access --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=…
    weave service ask github-access "link" -p <project> --action link --input '{"repo": "acme/site"}'
    weave service ask github-access "access" -p <project> --action access --input '{"repo": "acme/site", "access": "read"}'
