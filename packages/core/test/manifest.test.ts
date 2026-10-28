import { describe, expect, it } from 'vitest';
import { artifactKindOf, artifactSourceOf, artifactsOf, checkManifest, KIND_APP, KIND_ARTIFACT, MANIFEST_EXAMPLE, type Did } from '../src/index.ts';

const base = { app: 'band-ab', name: 'BAND AB!', services: [{ port: 3000 }] };

describe('app settings in a manifest', () => {
  it('reads settings hosts fill in: names only', () => {
    const checked = checkManifest({ ...base, env: [{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com' }] });
    expect(checked.problems).toEqual([]);
    expect(checked.manifest?.env).toEqual([{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com' }]);
    expect(checkManifest(MANIFEST_EXAMPLE).problems).toEqual([]);
  });

  it('refuses values, variables that change how programs start, and odd names, all at once', () => {
    const checked = checkManifest({
      ...base,
      env: [{ name: 'API_KEY', label: 'Key', value: 'sk-123' }, { name: 'NODE_OPTIONS', label: 'x' }, { name: 'PATH' }, { name: 'WEAVE_TOKEN' }, { name: 'lower-case' }, { name: 'API_KEY', label: 'again' }],
    });
    expect(checked.manifest).toBeUndefined();
    expect(checked.problems).toHaveLength(6);
    expect(checked.problems.join('\n')).toMatch(/never holds its value/);
    expect(checked.problems.join('\n')).toMatch(/NODE_OPTIONS can't be a setting/);
    expect(checked.problems.join('\n')).toMatch(/listed twice/);
  });
});

describe('artifacts: their kind and where their files are', () => {
  const sha = 'a'.repeat(64);
  const entry = (id: string, kind: string, body: unknown, time: string) => ({ id, kind, body: body as never, event: { author: 'did:key:zMaintainer' as Did, time } });
  const maintainers = new Set(['did:key:zMaintainer' as Did]);

  it('says what each is, and keeps files apart from the project’s app', () => {
    const service = { ...base, service: { reads: 'addressed', writes: [], version: '1.0' }, install: { github: 'acme/bot', tag: 'v1', assets: { 'linux-x64': { file: 'bot.tgz', sha256: sha } } } };
    const guide = { app: 'guide', name: 'Guide', services: [], file: { type: 'application/pdf' }, install: { github: 'acme/bot', tag: 'v1', assets: { file: { file: 'Guide.pdf', sha256: sha } } } };
    const all = artifactsOf([entry('a', KIND_APP, service, '2026-01-01'), entry('f', KIND_ARTIFACT, guide, '2026-01-02')], maintainers);
    // The same tag, both kept: each artifact has its own.
    expect(all.map((a) => [a.id, a.kind, a.source])).toEqual([
      ['f', 'file', { provider: 'github', ref: 'acme/bot' }],
      ['a', 'service', { provider: 'github', ref: 'acme/bot' }],
    ]);
    // A file published as the app, or an app as a file, isn't one.
    expect(artifactsOf([entry('x', KIND_APP, guide, '2026-01-03'), entry('y', KIND_ARTIFACT, service, '2026-01-03')], maintainers)).toEqual([]);
    expect(artifactKindOf(checkManifest(base).manifest!)).toBe('website');
  });

  it('can come from anywhere a provider knows, not only GitHub', () => {
    const s3 = { app: 'dataset', name: 'Dataset', services: [], file: {}, install: { tag: '2026-10', source: { provider: 's3', ref: 'acme-data/2026-10.csv' }, assets: { file: { file: '2026-10.csv', sha256: sha } } } };
    const checked = checkManifest(s3);
    expect(checked.problems).toEqual([]);
    expect(artifactSourceOf(checked.manifest!)).toEqual({ provider: 's3', ref: 'acme-data/2026-10.csv' });
    expect(checkManifest({ ...s3, install: { ...s3.install, source: undefined } }).problems.join('\n')).toMatch(/install.github|install.source/);
  });
});
