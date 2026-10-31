import { describe, expect, it } from 'vitest';
import { releaseWorkflow, wasmReleaseWorkflow } from '../src/index.ts';

describe('release workflows', () => {
  it('builds a WebAssembly app and attaches one archive Weave takes for the platform "wasm"', () => {
    const w = wasmReleaseWorkflow('pferderennen', { component: './game.wasm', site: 'site/' });
    expect(w.file).toBe('.github/workflows/weave-release.yml');
    expect(w.content).toContain('npm run build');
    // The component and its site at the same places as in weave.app.json, under one folder the archive unpacks from.
    expect(w.content).toContain(`cp 'game.wasm' "$dir/game.wasm"`);
    expect(w.content).toContain(`cp -r 'site' "$dir/site"`);
    expect(w.content).toContain('tar -czf "dist/pferderennen-${GITHUB_REF_NAME}-wasm.tar.gz" -C build pferderennen');
    expect(w.content).toContain('files: dist/*');
    // No image, no registry: Weave runs it itself.
    expect(w.content).not.toMatch(/docker|ghcr/);
    // Named so the GitHub releases service files it under "wasm".
    expect(/(^|[^a-z0-9])wasm([^a-z0-9]|$)/.test(w.asset.toLowerCase())).toBe(true);
    expect(wasmReleaseWorkflow('bot', { component: 'dist/bot.wasm' }).content).not.toContain('cp -r');
  });

  it('refuses paths outside the repository, and keeps containers for the rest', () => {
    expect(() => wasmReleaseWorkflow('bot', { component: '../bot.wasm' })).toThrow(/a path in the repository/);
    expect(() => wasmReleaseWorkflow('bot', { component: 'bot.wasm', site: '/etc' })).toThrow(/a path in the repository/);
    expect(releaseWorkflow('band-ab', 'server.js', 'martl').startImage).toBe('ghcr.io/martl/band-ab');
  });
});
