/*
 * A GitHub Actions workflow a project can add so that pushing a version tag
 * builds its app for Windows, macOS and Linux and publishes a GitHub release
 * with the builds: hosts then install it from Weave with one click, without
 * Node.js or anything else installed. Builds are single programs made with
 * Bun's --compile (JavaScript and TypeScript apps), packed with the
 * repository's files; macOS builds are made on a Mac and ad-hoc signed.
 */

export interface ReleaseWorkflow {
  /** Where it goes in the repository. */
  file: string;
  content: string;
  /** What weave.app.json's start.release should say, so installed builds start the program. */
  startRelease: Record<string, string[]>;
  /** What to know before relying on it. */
  notes: string[];
}

const TARGETS = [
  { os: 'ubuntu-latest', target: 'windows-x64', platform: 'win32-x64', name: 'win-x64', exe: true },
  { os: 'ubuntu-latest', target: 'linux-x64', platform: 'linux-x64', name: 'linux-x64', exe: false },
  { os: 'macos-latest', target: 'darwin-arm64', platform: 'darwin-arm64', name: 'mac-arm64', exe: false },
  { os: 'macos-latest', target: 'darwin-x64', platform: 'darwin-x64', name: 'mac-x64', exe: false },
];

/** The workflow for an app (its id from weave.app.json) whose server starts from `entry` (like server.js). */
export function releaseWorkflow(app: string, entry: string): ReleaseWorkflow {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(app)) throw new Error('the app id is lowercase letters, digits and dashes, as in weave.app.json');
  if (!/^[\w./-]{1,200}$/.test(entry) || entry.includes('..')) throw new Error('entry is the file the app starts from, like server.js or src/main.ts');
  const matrix = TARGETS.map((t) => `          - { os: ${t.os}, target: ${t.target}, name: ${t.name}, exe: ${t.exe ? `${app}.exe` : app} }`).join('\n');
  const content = `# Weave release: pushing a version tag (v1.2.0) builds ${app} for Windows, macOS and Linux
# as single programs (no Node.js needed on the host's computer) and publishes a GitHub
# release with them. Then point the Weave project at it: weave app release <tag>.
name: Weave release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    strategy:
      matrix:
        include:
${matrix}
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - name: Build
        shell: bash
        run: |
          set -e
          dir="build/${app}"
          mkdir -p "$dir" dist
          git archive HEAD | tar -x -C "$dir"
          bun build ${entry} --compile --target=bun-\${{ matrix.target }} --outfile "$dir/\${{ matrix.exe }}"
          if [ "$RUNNER_OS" = "macOS" ]; then codesign --force --sign - "$dir/\${{ matrix.exe }}"; fi
          if [ "\${{ matrix.name }}" = "win-x64" ]; then
            (cd build && zip -qr "../dist/${app}-\${GITHUB_REF_NAME}-\${{ matrix.name }}.zip" ${app})
          else
            tar -czf "dist/${app}-\${GITHUB_REF_NAME}-\${{ matrix.name }}.tar.gz" -C build ${app}
          fi
      - uses: actions/upload-artifact@v4
        with:
          name: \${{ matrix.name }}
          path: dist/*

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: dist
          merge-multiple: true
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*
`;
  const startRelease = Object.fromEntries(TARGETS.map((t) => [t.platform, [t.exe ? `./${app}.exe` : `./${app}`]]));
  return {
    file: '.github/workflows/weave-release.yml',
    content,
    startRelease,
    notes: [
      'Add start.release to weave.app.json as given, so Weave starts the built program instead of start.command.',
      'Weave starts the app in its own folder: in a built program, read files relative to process.cwd(), not __dirname or import.meta.dir (those point inside the program).',
      "Bun builds JavaScript and TypeScript, including most npm packages; native modules (like better-sqlite3) won't build: keep start.command for those, and install steps for agents.",
      'After pushing a tag, the workflow takes a few minutes; weave_app_release says so while the release is not there yet.',
    ],
  };
}
