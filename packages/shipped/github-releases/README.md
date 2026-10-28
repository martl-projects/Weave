# GitHub releases

Hands the project's release files to its participants: they can install releases of a private repository without
access to it. Each file is checked against what its maintainer released.

It ships with Weave and answers `artifact.fetch` for the fetcher `github-checkout`, which each participant adds for
themselves: asked for a release and a platform, it grants GitHub's download address for that file, sealed to whoever
asked (nobody else in the project can read it). Without GitHub access of its own it grants the release, and their
fetcher uses their own access. Their Weave checks the file against the release's digest.

It reaches `api.github.com` only, and only for releases its projects' maintainers published. Its GitHub access, as
settings its project's maintainers keep: a fine-grained token (Contents: read) or a GitHub App of your own (its ID,
and its key, which Weave signs with: the service never sees it). Public repositories need neither.

    weave service add --shipped github-releases --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=…
