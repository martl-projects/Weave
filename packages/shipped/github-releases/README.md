# GitHub releases

Ships with Weave. Hands a project's release files to its participants (`artifact.fetch`): asked for a release and a
platform, it answers with GitHub's download address for that file, so participants install releases of a private
repository without access to it. Whoever downloads checks the file against the release's digest.

It reaches `api.github.com` only, and only for releases its projects' maintainers published. Its GitHub access, as
settings its project's maintainers keep: a fine-grained token (Contents: read) or a GitHub App of your own (its ID,
and its key, which Weave signs with: the service never sees it). Public repositories need neither.

    weave service add --shipped github-releases --spaces <project> --keep-in <project> --setting GITHUB_TOKEN=…
