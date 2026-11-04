# Weave and Docker: apps from a container image

A release runs in one of two ways sealed off from the host's computer, with no warning:

| Field in `weave.app.json` | Runs from | Needs on the host |
|---|---|---|
| **`start.image`** | **a container image, pinned by its digest** | **Docker** |
| `wasm` | a WebAssembly component (its image for wasi/wasm, or a release file for `wasm`) | nothing: Weave runs it |

`start.command` only says how to start a checkout by hand, for people and agents. A release that brings only a program per platform (its release files, with `start.release` naming the command, or a file that is the program itself) runs as that program, since 4.11.2026: on the host's computer with their rights, which Weave can't contain. So it runs only after a warning the host accepts in the app for exactly that release and file (its SHA-256, checked before it starts), never through an agent; a new version asks again, the consent can be withdrawn on the running website, and the program never starts by itself (not after Weave restarts, not after it exits). Where a release has both, the container or WebAssembly runs. Prefer those.

Weave builds and hosts nothing itself. The project's own workflow builds the image and pushes it to a registry, like ghcr.io or Docker Hub. Weave only points to it and checks that it's the released one.

## The manifest

```json
"start": {
  "image": "ghcr.io/you/your-app",
  "command": ["node", "server.js"]
}
```

- **The image name** goes without a tag or digest.
- **Combining:** `start.image` can stand next to `start.command`, which stays for checkouts. Hosts without Docker can't run the release; Weave tells them Docker isn't running.

## Releasing

1. The release workflow builds the image and pushes it **tagged like the release**: `v1.4` or `1.4`, Weave tries both.
2. `weave app release v1.4` reads the image's **digest** (`sha256:…`) from the registry and puts it in the signed release entry (`install.image`). The release's build files, if any, are fingerprinted as before.
3. A release may have only an image and no build files.

**Private images:** Weave reads digests of public images. For a private image on ghcr.io it tries the maintainer's GitHub sign-in. If that doesn't reach it, the release says so: make the image public (the package's settings → visibility).

A job for the release workflow, next to the one that builds files:

```yaml
  image:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: docker/build-push-action@v6
        with: { push: true, tags: 'ghcr.io/${{ github.repository }}:${{ github.ref_name }}' }
```

## On the host

- **When the container is used:** When the release has an image and Docker runs on this computer, a room that runs the release (the room service, "Open a room…") starts it as a container. No copy of the app and no folder to choose.
- **How Weave runs it:**

  ```
  docker run --rm --name weave-<project> --cap-drop ALL --cap-add NET_BIND_SERVICE
    --security-opt no-new-privileges -p 127.0.0.1:<port>:<port> …
    -e <SETTING> … -e WEAVE_API -e WEAVE_TOKEN -e WEAVE_PROJECT  <image>@<digest>
  ```

- **What it gets:** only the services' ports, on 127.0.0.1, for the room. On Linux it shares the host's network instead, so the tunnel's ports stay as they are.
- **What it doesn't get:** none of the host's files, and no extra privileges.
- **Settings:** passed by name. Their values reach Docker through its environment, never on the command line.
- **Approving:** The host approves the exact command once. A new release with another digest asks again.
- **Stopping:** goes through `docker stop`. A container left from before is removed first.
- **Without Docker:** A room runs the release's build file for this computer, if it has one; otherwise there is nothing for a room to run here, and Weave says so.

## Who is who: X-Weave-Person

- **Why the old way breaks:** Weave told apps who is behind a connection by its source port. In a container behind Docker Desktop that doesn't work: connections arrive through Docker's own forwarder.
- **What Weave does now:** For `http` services the room's tunnel adds **`X-Weave-Person`** to every request, WebSocket upgrades included. It carries:
  - the person (did, name, host, member, maintainer)
  - the room
  - the time
  - an HMAC-SHA256 over all of it with the app's `WEAVE_TOKEN`, which only Weave and the app know
- **Forging:** A header a player sends is dropped.
- **@weave/sdk:** `weave.who(req)` checks the header first, without asking Weave, and takes it if it's at most five minutes old. Otherwise it falls back to the port.
- **Older apps:** The tunnel's own connections to the app still count as the player's, so apps asking by port keep working.
- **Where it works:** in a container, behind a reverse proxy, in a Kubernetes cluster.
- **`tcp` services:** pass through untouched, as before. In a container there is no `who()` for them.
- **The app API in a container:** `WEAVE_API` points at `host.docker.internal`, and the app API accepts that name; the token is needed either way.

## Tried, and not yet

- **Tested with stand-ins** (a registry with its bearer-token sign-in; a stand-in for the docker command line):
  - **Release:** the digest is pinned at release, and an image-only release works.
  - **Docker command:** ports, no privileges, settings by name only (the secret value never on the command line), `WEAVE_API` via `host.docker.internal`.
  - **Lifecycle:** clearing and stopping through Docker, and starting as before without Docker.
  - **Registry errors:** private and missing images.
- **Tested through a real room tunnel:** the header for requests and WebSocket upgrades, a forged header replaced, old or foreign signatures refused, and the port lookup still finding the player.
- **Not tried with a real Docker yet** (Docker Desktop didn't start on the development computer). Two things in particular:
  - whether Docker Desktop on Windows and macOS lets a container reach Weave's app API on 127.0.0.1 through `host.docker.internal`
  - the real pull of an image by digest
