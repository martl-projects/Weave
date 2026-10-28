# GitHub checkout

Fetches release files from GitHub for you, with what a project's GitHub releases service grants you, or with your
own GitHub access where it leaves that to you. Each file is checked against what its maintainer released.

It's a fetcher: a client app of yours, not a project's. Weave runs it on your node when you install something a
GitHub releases service hands out, in the projects you added it for (or all of them). It reaches GitHub's API and
its file store (`api.github.com`, `*.githubusercontent.com`) only. Your token, if you give it one, stays sealed on
your node.

    weave fetcher add github-checkout --projects <project>
    weave fetcher set github-checkout --setting GITHUB_TOKEN=…
