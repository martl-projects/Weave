import { describe, expect, it } from 'vitest';
import { artifactKindOf, artifactSourceOf, artifactsOf, checkManifest, releaseById, KIND_APP, KIND_ARTIFACT, KIND_ARTIFACT_WITHDRAWN, MANIFEST_EXAMPLE, type Did } from '../src/index.ts';

const base = { app: 'band-ab', name: 'BAND AB!', services: [{ port: 3000 }] };

describe('app settings in a manifest', () => {
  it('reads settings hosts fill in: names only', () => {
    const checked = checkManifest({ ...base, env: [{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com' }] });
    expect(checked.problems).toEqual([]);
    expect(checked.manifest?.env).toEqual([{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com' }]);
    expect(checkManifest(MANIFEST_EXAMPLE).problems).toEqual([]);
  });

  it('says what it does, in a sentence or two', () => {
    const checked = checkManifest({ ...base, about: '  Counts what you have not read. ' });
    expect(checked.warnings.join('\n')).not.toMatch(/about/);
    expect(checked.manifest?.about).toBe('Counts what you have not read.');
    expect(checkManifest({ ...base, about: 'x'.repeat(400) }).manifest?.about).toHaveLength(300);
    expect(checkManifest(base).manifest).not.toHaveProperty('about');
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

describe('programs behind a warning', () => {
  it('reads programs per platform, warns that they run behind a warning, and what only has ports is a website', () => {
    const old = checkManifest({ ...base, services: [{ port: 7000, protocol: 'tcp' }], start: { command: ['node', 'server.js'], release: { 'win32-x64': ['./band-ab.exe'] } } });
    expect(old.problems).toEqual([]);
    expect(old.warnings.join('\n')).toMatch(/"start.release" is a program per platform: it runs on people's computers with their rights, and only after a warning/);
    expect(old.warnings.join('\n')).not.toMatch(/nothing for Weave to run/);
    expect(old.manifest?.start).toEqual({ command: ['node', 'server.js'], release: { 'win32-x64': ['./band-ab.exe'] } });
    expect(artifactKindOf(old.manifest!)).toBe('website');
    // Without any way to run a release, it says so; a container image needs nothing more.
    expect(checkManifest({ ...base, start: { command: ['node', 'server.js'] } }).warnings.join('\n')).toMatch(/nothing for Weave to run sealed off/);
    expect(checkManifest({ ...base, start: { image: 'ghcr.io/martl/band-ab' } }).warnings.join('\n')).not.toMatch(/nothing for Weave to run/);
  });
});

describe('a setting picked from what the service lists', () => {
  const service = { reads: 'addressed', writes: [], actions: [{ name: 'reachable', label: 'List the repositories', who: 'maintainers' }], version: '1.0' };
  const wasm = { component: 'access.wasm', panel: 'panel', panels: [{ name: 'repos', title: 'Repositories', who: 'members', page: 'index.html', covers: ['reachable', 'Bad Name'] }] };
  it('names one of its actions, and its panel may stand in for that action', () => {
    const checked = checkManifest({ app: 'access', name: 'Access', service, wasm, env: [{ name: 'REPOS', label: 'Repositories', choose: { action: 'reachable', many: true } }] });
    expect(checked.problems).toEqual([]);
    expect(checked.manifest?.env).toEqual([{ name: 'REPOS', label: 'Repositories', choose: { action: 'reachable', many: true } }]);
    expect(checked.manifest?.wasm?.panels?.[0].covers).toEqual(['reachable']);
  });
  it('refuses an action it lacks, and a secret or sign-in picked from a list', () => {
    const problems = (env: unknown[]) => checkManifest({ app: 'access', name: 'Access', service, wasm, env }).problems.join('\n');
    expect(problems([{ name: 'REPOS', label: 'Repositories', choose: { action: 'nothing' } }])).toMatch(/has no such action/);
    expect(problems([{ name: 'REPOS', label: 'Repositories', choose: { action: 'reachable' }, secret: true }])).toMatch(/neither a secret nor a sign-in/);
    expect(problems([{ name: 'REPOS', label: 'Repositories', choose: 'reachable' }])).toMatch(/"choose" names the action/);
    // Picked by whoever runs it, per project.
    expect(checkManifest({ app: 'access', name: 'Access', service, wasm, env: [{ name: 'REPOS', label: 'Repositories', choose: { action: 'reachable' }, yours: true }] }).manifest?.env?.[0]).toMatchObject({ choose: { action: 'reachable' }, yours: true });
  });
  it('registers an app of yours with the provider: always yours, never typed in', () => {
    const register = { page: 'https://github.com/settings/apps/new', exchange: 'https://api.github.com/app-manifests/{code}/conversions', manifest: { name: 'Weave access {random}' }, keep: ['id', 'owner.login'], key: 'pem', then: '{html_url}/installations/new' };
    expect(checkManifest({ app: 'access', name: 'Access', service, wasm, env: [{ name: 'GITHUB_APP', label: 'Your GitHub App', register }] }).manifest?.env).toEqual([{ name: 'GITHUB_APP', label: 'Your GitHub App', secret: true, register, yours: true }]);
    const problems = (env: unknown[]) => checkManifest({ app: 'access', name: 'Access', service, wasm, env }).problems.join('\n');
    expect(problems([{ name: 'GITHUB_APP', label: 'App', register: { ...register, exchange: 'https://api.github.com/conversions' } }])).toMatch(/"register" names/);
    expect(problems([{ name: 'GITHUB_APP', label: 'App', register, secret: true }])).toMatch(/neither a sign-in, a pick, nor a secret/);
  });
  it("keeps a sign-in as whoever runs it: theirs, for every project", () => {
    const oauth = { device: 'https://github.com/login/device/code', token: 'https://github.com/login/oauth/access_token', client: 'abc' };
    expect(checkManifest({ app: 'access', name: 'Access', service, wasm, env: [{ name: 'GITHUB', label: 'Your GitHub', yours: true, oauth }] }).manifest?.env).toEqual([{ name: 'GITHUB', label: 'Your GitHub', secret: true, oauth, yours: true }]);
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

  it('are gone once a maintainer withdraws one, and back when it is released again', () => {
    const service = { ...base, service: { reads: 'addressed', writes: [], version: '1.0' }, install: { github: 'acme/bot', tag: 'v1', assets: { 'linux-x64': { file: 'bot.tgz', sha256: sha } } } };
    const withdraw = (id: string, by: string, time: string) => ({ id: `w-${id}-${time}`, kind: KIND_ARTIFACT_WITHDRAWN, body: { artifact: id } as never, event: { author: by as Did, time } });
    const released = [entry('a', KIND_APP, service, '2026-01-01')];
    expect(artifactsOf([...released, withdraw('a', 'did:key:zMaintainer', '2026-01-02')], maintainers)).toEqual([]);
    // Only a maintainer withdraws one.
    expect(artifactsOf([...released, withdraw('a', 'did:key:zSomeone', '2026-01-02')], maintainers).map((a) => a.id)).toEqual(['a']);
    // The same tag released again: a new release, there.
    expect(artifactsOf([...released, withdraw('a', 'did:key:zMaintainer', '2026-01-02'), entry('b', KIND_APP, service, '2026-01-03')], maintainers).map((a) => a.id)).toEqual(['b']);
  });

  it('stay findable by id once their tag is released again, saying which replaced them', () => {
    const service = { ...base, service: { reads: 'addressed', writes: [], version: '1.0' }, install: { github: 'acme/bot', tag: 'v1', assets: { 'linux-x64': { file: 'bot.tgz', sha256: sha } } } };
    const withdraw = (id: string) => ({ id: `w-${id}`, kind: KIND_ARTIFACT_WITHDRAWN, body: { artifact: id } as never, event: { author: 'did:key:zMaintainer' as Did, time: '2026-01-04' } });
    const both = [entry('a', KIND_APP, service, '2026-01-01'), entry('b', KIND_APP, { ...service, name: 'BAND AB! (fixed)' }, '2026-01-02')];
    // Listed once, as released now; what was launched from the first keeps running it.
    expect(artifactsOf(both, maintainers).map((a) => a.id)).toEqual(['b']);
    expect(releaseById(both, maintainers, 'a')).toMatchObject({ artifact: { id: 'a', manifest: { name: 'BAND AB!' } }, replacedBy: { id: 'b' } });
    expect(releaseById(both, maintainers, 'b')).not.toHaveProperty('replacedBy');
    // Withdrawn, it's gone; its replacement withdrawn, it's no longer replaced.
    expect(releaseById([...both, withdraw('a')], maintainers, 'a')).toBeUndefined();
    expect(releaseById([...both, withdraw('b')], maintainers, 'a')).not.toHaveProperty('replacedBy');
    expect(artifactsOf([...both, withdraw('b')], maintainers)).toEqual([]);
  });

  it('can come from anywhere a provider knows, not only GitHub', () => {
    const s3 = { app: 'dataset', name: 'Dataset', services: [], file: {}, install: { tag: '2026-10', source: { provider: 's3', ref: 'acme-data/2026-10.csv' }, assets: { file: { file: '2026-10.csv', sha256: sha } } } };
    const checked = checkManifest(s3);
    expect(checked.problems).toEqual([]);
    expect(artifactSourceOf(checked.manifest!)).toEqual({ provider: 's3', ref: 'acme-data/2026-10.csv' });
    expect(checkManifest({ ...s3, install: { ...s3.install, source: undefined } }).problems.join('\n')).toMatch(/install.github|install.source/);
  });
});
