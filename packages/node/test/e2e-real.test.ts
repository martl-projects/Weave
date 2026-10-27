import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { platformKey } from '../src/appinstall.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { writeSecretJson } from '../src/vault.ts';

/*
 * Real checks, against GitHub, a registry and Docker as they are: skipped unless asked for.
 *
 *   WEAVE_E2E_GITHUB=owner/repo@tag  a private repository's release with build files, and a GitHub token
 *                                    (WEAVE_E2E_TOKEN, WEAVE_E2E_LOGIN) that reads it: a maintainer's node hands
 *                                    a file to a participant without access, through the GitHub service.
 *   WEAVE_E2E_IMAGE=registry/name:tag  a Weave service image: released, then run in the sandbox by Docker.
 *   WEAVE_E2E_DIR                    where the nodes' homes go (a scratch folder).
 */

const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
});

const home = (name: string) => mkdtempSync(join(process.env.WEAVE_E2E_DIR ?? tmpdir(), `weave-e2e-${name}-`));
const person = (name: string) => {
  const node = WeaveNode.init(name, home(name));
  // Offline: nothing leaves these homes but what the check asks GitHub, the registry and Docker.
  node.config = { ...node.config, bootstrap: [{ host: '127.0.0.1', port: 1 }] };
  nodes.push(node);
  return node;
};
const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe.runIf(process.env.WEAVE_E2E_GITHUB)('real: a private release through the GitHub service', { timeout: 600_000 }, () => {
  it('reaches a participant without access to the repository, checked against the release', async () => {
    const [repo, tag] = process.env.WEAVE_E2E_GITHUB!.split('@');
    const martl = person('maintainer');
    const lena = person('participant');
    writeSecretJson(martl.home, join(martl.home.dir, 'github.json'), { token: process.env.WEAVE_E2E_TOKEN, login: process.env.WEAVE_E2E_LOGIN });
    await martl.createProject({ name: 'E2E' });
    await lena.joinSpace(await martl.invite('E2E'));
    const release = await martl.releaseApp({ project: 'E2E', tag, repo });
    console.log('released', release.name, release.install?.tag, Object.keys(release.install?.assets ?? {}), release.install?.image ?? '(no image)');
    sync([martl, lena]);

    const martlApi = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    const lenaApi = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    martl.runServices({ port: martlApi.port });
    lena.runServices({ port: lenaApi.port });
    const syncing = setInterval(() => sync([martl, lena]), 200);
    try {
      // Without a provider: Lena's node has no access.
      const name = release.app;
      await lena.addService({ artifact: { project: 'E2E' }, spaces: ['E2E'], approve: true });
      await lena.serviceReady(name);
      const without = (await lena.services()).find((s) => s.name === name)!.artifact;
      console.log('without a provider:', without?.error ?? (without?.installed ? 'installed?!' : 'nothing'));
      expect(without?.installed).toBe(false);

      // With martl's GitHub service: the file arrives, from GitHub's signed address, and matches the release.
      await martl.addService({ builtin: 'github', spaces: ['E2E'] });
      await vi.waitFor(async () => expect((await lena.servicesIn('E2E')).some((p) => p.contract.offers?.includes('artifact.fetch'))).toBe(true), { timeout: 10_000 });
      await lena.setService({ name, enabled: false });
      await lena.setService({ name, enabled: true });
      const started = Date.now();
      await lena.serviceReady(name);
      const got = (await lena.services()).find((s) => s.name === name)!;
      console.log(`with the GitHub service, after ${Math.round((Date.now() - started) / 1000)}s:`, got.artifact?.installed ? `installed for ${platformKey()}, delivered by ${got.artifact.deliveredBy}` : got.artifact?.error);
      expect(got.artifact).toMatchObject({ installed: true, deliveredBy: 'github (maintainer)' });
      const origin = (await martl.serviceProfiles()).find((p) => p.name === name)?.origin;
      console.log('its origin, as the maintainer checks it:', JSON.stringify(origin));
      expect(origin).toMatchObject({ kind: 'release', checked: 'verified' });
    } finally {
      clearInterval(syncing);
      for (const s of await lena.services()) await lena.removeService(s.name).catch(() => {});
      for (const s of await martl.services()) await martl.removeService(s.name).catch(() => {});
      await martlApi.close();
      await lenaApi.close();
    }
  });
});

describe.runIf(process.env.WEAVE_E2E_IMAGE)('real: a Weave service image, run by Docker', { timeout: 600_000 }, () => {
  it('is released from its image and runs in the sandbox, serving its website', async () => {
    const martl = person('publisher');
    const lena = person('host');
    await martl.createProject({ name: 'Images' });
    await lena.joinSpace(await martl.invite('Images'));
    const released = await martl.releaseService({ project: 'Images', image: process.env.WEAVE_E2E_IMAGE! });
    console.log('released', released.name, JSON.stringify(released.install?.image), 'contract', JSON.stringify(released.service ?? null), 'web', JSON.stringify(released.services));
    sync([martl, lena]);
    const [artifact] = await lena.artifacts('Images');
    console.log('runs here as', artifact.runs, '\n ', artifact.command?.join(' '));
    expect(artifact).toMatchObject({ packaged: true, runs: 'container' });

    const api = await startApi(lena, 0, { service: (token) => lena.serviceGate(token) });
    lena.runServices({ port: api.port });
    try {
      await lena.addService({ builtin: 'website', spaces: ['Images'] });
      const service = await lena.addService({ artifact: { project: 'Images' }, spaces: ['Images'], approve: true });
      const port = released.services[0]?.port;
      const page = await vi.waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        return res.text();
      }, { timeout: 120_000, interval: 1000 });
      console.log(`port ${port} answers:`, page.trim().slice(0, 120));
      await vi.waitFor(async () => expect((await lena.websites('Images')).map((r) => r.name)).toContain(released.name), { timeout: 10_000 });
      console.log('websites:', (await lena.websites('Images')).map((r) => r.name).join(', '));
      await lena.removeService(service.name);
      await vi.waitFor(async () => expect(await fetch(`http://127.0.0.1:${port}/`).then(() => 'up', () => 'down')).toBe('down'), { timeout: 30_000, interval: 500 });
      console.log('stopped: the port is closed again');
    } finally {
      await api.close();
    }
  });
});
