/*
 * A GitHub Actions workflow a project can add so that pushing a version tag
 * builds its app as a container image, pushes it to GitHub's registry
 * (ghcr.io) and publishes a GitHub release: hosts with Docker then run it
 * from Weave with one click, sealed off from their computer. A container (or
 * WebAssembly) is how an app runs without a warning: a program per platform
 * runs only after each person accepts one, so this workflow builds none.
 * A repository without a Dockerfile gets one made for Node.js on the way.
 */

export interface ReleaseWorkflow {
  /** Where it goes in the repository. */
  file: string;
  content: string;
  /** What weave.app.json's start.image should say, so Weave pins and runs the release's image. */
  startImage: string;
  /** What to know before relying on it. */
  notes: string[];
}

/**
 * The workflow for an app (its id from weave.app.json) whose server starts from `entry` (like server.js), with its
 * image under `owner` on ghcr.io (the repository's owner, lowercase) when known.
 */
export function releaseWorkflow(app: string, entry: string, owner?: string): ReleaseWorkflow {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(app)) throw new Error('the app id is lowercase letters, digits and dashes, as in weave.app.json');
  if (!/^[\w./-]{1,200}$/.test(entry) || entry.includes('..')) throw new Error('entry is the file the app starts from, like server.js or src/main.ts');
  if (owner !== undefined && !/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner.toLowerCase())) throw new Error('owner is the GitHub account or organization the repository belongs to');
  const content = `# Weave release: pushing a version tag (v1.2.0) builds ${app} as a container image, pushes it
# to ghcr.io (tagged like the release) and publishes a GitHub release. Hosts with Docker run it
# from Weave, sealed off from their computer. Then: weave app release <tag>.
name: Weave release

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dockerfile
        shell: bash
        run: |
          # A repository with a Dockerfile keeps its own; otherwise one for Node.js.
          if [ ! -f Dockerfile ]; then
            cat > Dockerfile <<'EOF'
          FROM node:24-slim
          WORKDIR /app
          COPY . .
          RUN if [ -f package-lock.json ]; then npm ci --omit=dev; elif [ -f package.json ]; then npm install --omit=dev; fi
          ENV NODE_ENV=production
          CMD ["node", "${entry}"]
          EOF
          fi
      - name: Image name
        id: image
        shell: bash
        run: echo "name=ghcr.io/\${GITHUB_REPOSITORY_OWNER,,}/${app}" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ steps.image.outputs.name }}:\${{ github.ref_name }}
      - uses: softprops/action-gh-release@v2
`;
  return {
    file: '.github/workflows/weave-release.yml',
    content,
    startImage: `ghcr.io/${owner ? owner.toLowerCase() : '<owner>'}/${app}`,
    notes: [
      `Add start.image to weave.app.json as given${owner ? '' : ' (<owner>: the account the repository belongs to, lowercase)'}: Weave pins each release's image by its digest and runs it.`,
      'Make the package public once on GitHub (the repository, Packages, Package settings): hosts pull it without signing in.',
      'In the container the app listens on the ports in services, on all addresses (0.0.0.0, not 127.0.0.1), and reads its settings from the environment.',
      'Hosts need Docker running; without, Weave says so instead of starting anything (a release with only a program per platform would run instead, but only after a warning each host accepts themselves).',
      'After pushing a tag, the workflow takes a few minutes; weave_app_release says so while the release is not there yet.',
    ],
  };
}

export interface WasmReleaseWorkflow {
  file: string;
  content: string;
  /** The release file it attaches: Weave takes it for the platform "wasm" by its name. */
  asset: string;
  notes: string[];
}

/**
 * The workflow for a WebAssembly app (wasm in weave.app.json): pushing a version tag builds it (npm run build), packs
 * its component and its site into one archive and attaches that to the GitHub release. Weave runs it itself: hosts
 * need nothing installed, not even Docker.
 */
export function wasmReleaseWorkflow(app: string, wasm: { component: string; site?: string }): WasmReleaseWorkflow {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(app)) throw new Error('the app id is lowercase letters, digits and dashes, as in weave.app.json');
  const path = (p: string, what: string) => {
    if (!/^[\w./-]{1,200}$/.test(p) || p.includes('..') || p.startsWith('/')) throw new Error(`${what} is a path in the repository, as in weave.app.json's wasm`);
    return p.replace(/^\.\//, '').replace(/\/+$/, '');
  };
  const component = path(wasm.component, 'the component');
  const site = wasm.site !== undefined ? path(wasm.site, 'the site folder') : undefined;
  const asset = `${app}-<tag>-wasm.tar.gz`;
  const content = `# Weave release: pushing a version tag (v1.2.0) builds ${app} as a WebAssembly component (npm run
# build), packs it${site ? ' with its site' : ''} into ${asset} and attaches that to the GitHub release.
# Weave runs it itself: hosts need nothing installed. Then: weave app release <tag>.
name: Weave release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Build
        shell: bash
        run: |
          if [ -f package-lock.json ]; then npm ci; else npm install; fi
          npm run build
      - name: Pack
        shell: bash
        run: |
          set -e
          dir="build/${app}"
          mkdir -p "$dir/$(dirname '${component}')" dist
          cp '${component}' "$dir/${component}"${site ? `\n          mkdir -p "$dir/$(dirname '${site}')"\n          cp -r '${site}' "$dir/${site}"` : ''}
          tar -czf "dist/${app}-\${GITHUB_REF_NAME}-wasm.tar.gz" -C build ${app}
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*
`;
  return {
    file: '.github/workflows/weave-release.yml',
    content,
    asset,
    notes: [
      `package.json's build script makes ${component} (jco componentize, as Weave's starters do); the workflow runs npm run build.`,
      `weave.app.json keeps wasm as it is (component${site ? ' and site' : ''}, paths in the repository): the archive has them at the same places.`,
      'Weave runs the component itself, sealed off: hosts need nothing installed, not even Docker. Settings come from env in weave.app.json, never from the repository.',
      'After pushing a tag, the workflow takes a few minutes; weave_app_release says so while the release is not there yet.',
    ],
  };
}
