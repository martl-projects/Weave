import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { parseOrigin } from '@weave/core';
import { readSecretJson, writeSecretJson } from '../src/vault.ts';
import { placeholderComponent, releaseService, serviceFromRelease } from './helpers/release.ts';

/*
 * Services (block 1 of the agent node model): code a person runs on a node under a key of its own, with exactly
 * its contract's rights, reached through a limited API. Its code is a project's release, pinned by its fingerprint.
 */

const ECHO = { app: 'echo', name: 'Echo', service: { reads: 'addressed', writes: [], version: '1.0' } };

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-services-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (nodes: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** A service's token, as its process gets it (kept sealed on the node). */
const tokenOf = (node: WeaveNode, name: string) => readSecretJson<Array<{ name: string; token: string }>>(node.home, join(node.home.dir, 'services.json'))!.find((s) => s.name === name)!.token;

describe('services', () => {
  it('signs under its own key with only its rights, and sees only what its contract reads in its spaces', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await martl.createProject({ name: 'Secret' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);

    const echo = await serviceFromRelease(martl, { name: 'echo', description: 'Answers what you say', manifest: ECHO, component: placeholderComponent(), project: 'Weave', spaces: ['Weave'] });
    expect(echo).toMatchObject({ name: 'echo', spaces: [{ name: 'Weave' }], enabled: true, running: false });
    await expect(serviceFromRelease(martl, { name: 'echo', manifest: ECHO, component: placeholderComponent(), project: 'Weave' })).rejects.toThrow(/already have an agent or service named "echo"/);
    sync([martl, lena]);
    // Everyone sees its profile, by its own key, run by martl.
    expect((await lena.serviceProfiles()).map((p) => [p.name, p.person.name, p.description])).toEqual([['echo', 'martl', 'Answers what you say']]);
    // And the members of its space see it there.
    expect((await lena.servicesIn('Weave')).map((p) => p.name)).toEqual(['echo']);
    // Where its code comes from: a release of the project, checked against what its maintainer published.
    expect((await lena.servicesIn('Weave'))[0].origin).toMatchObject({ kind: 'release', project: { name: 'Weave' }, checked: 'verified', publisher: { name: 'martl' } });
    // An origin is ids only, and only a well-formed one counts.
    expect(parseOrigin({ project: 'p1', release: 'r1', tag: 'v1', fingerprint: 'abcdefgh12' })).toEqual({ project: 'p1', release: 'r1', tag: 'v1', fingerprint: 'abcdefgh12' });
    expect(parseOrigin({ project: 'p 1', release: 'r1', tag: 'v1', fingerprint: 'abcdefgh12' })).toBeUndefined();
    expect(await martl.servicesIn('Secret')).toEqual([]);

    // Lena asks it; she also posts, which it doesn't read.
    const asked = await lena.askService({ space: 'Weave', service: 'martl/echo', text: 'hi' });
    await lena.submit({ space: 'Weave', title: 'Not for the service' });
    sync([martl, lena]);
    const gate = martl.serviceGate(tokenOf(martl, 'echo'))!;
    expect(gate.me()).toMatchObject({ name: 'echo', did: echo.did, spaces: [{ name: 'Weave' }] });
    expect(gate.events().map((i) => i.kind)).toEqual(['weave.service.request']);

    // It answers as itself; Lena sees the answer, signed by "martl · echo".
    const answer = await gate.answer({ request: asked.id, text: 'hi back' });
    expect(answer).toMatchObject({ author: martl.identity.author, signer: echo.did, signerName: 'echo' });
    sync([martl, lena]);
    expect((await lena.serviceRequests({ space: 'Weave' })).map((r) => [r.text, r.results.map((x) => x.text)])).toEqual([['hi', ['hi back']]]);

    // Only its rights, only its spaces.
    await expect(gate.publish({ space: 'Weave', kind: 'weave.post', body: { title: 'sneaky' } })).rejects.toThrow(/may not sign weave.post/);
    await expect(gate.publish({ space: 'Secret', kind: 'weave.service.result', body: {} })).rejects.toThrow(/wasn't added to Secret/);
    await martl.askService({ space: 'Secret', service: echo.did, text: 'from elsewhere' });
    expect(gate.events().map((i) => i.body)).not.toContainEqual(expect.objectContaining({ text: 'from elsewhere' }));
    // And nobody else's token opens it.
    expect(martl.serviceGate('not-a-token')).toBeUndefined();
  });

  it('takes no requests when it reads nothing: its key signs its profile alone', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    const quiet = await serviceFromRelease(martl, { name: 'quiet', manifest: { app: 'quiet', name: 'Quiet', service: { reads: 'nothing', writes: [], version: '1.0' } }, component: placeholderComponent(), project: 'Weave', spaces: ['Weave'] });
    expect(martl.replica.authority.grant(quiet.did)?.permissions).toEqual(['weave.service.profile']);
    sync([martl, lena]);
    await expect(lena.askService({ space: 'Weave', service: 'martl/quiet', text: 'hi' })).rejects.toThrow(/quiet takes no requests: it reads nothing and takes no requests; writes nothing/);
    await expect(martl.serviceGate(tokenOf(martl, 'quiet'))!.answer({ request: 'x', text: 'no' })).rejects.toThrow(/takes no requests/);
  });

  it('runs its release with its own token, which opens nothing but the service routes', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await serviceFromRelease(martl, { name: 'echo', manifest: ECHO, source: join(import.meta.dirname, 'helpers', 'wasm-bot.js'), project: 'Weave', spaces: ['Weave'] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });

      // Its token can't reach the rest of the API.
      const token = tokenOf(martl, 'echo');
      const rpc = await fetch(`http://127.0.0.1:${api.port}/v1/rpc`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ method: 'whoami', args: [] }) });
      expect(rpc.status).toBe(404);
      expect((await rpc.json()).error).toMatch(/a service can't call POST \/v1\/rpc/);

      // Lena asks; it answers.
      sync([martl, lena]);
      await lena.askService({ space: 'Weave', service: 'martl/echo', text: 'are you there?' });
      await vi.waitFor(
        async () => {
          sync([martl, lena]);
          expect((await lena.serviceRequests({ space: 'Weave' }))[0].results.map((r) => r.text)).toEqual(['hi from echo (#1): are you there?']);
        },
        { timeout: 30_000, interval: 300 },
      );

      // Removed: its key is revoked, its token opens nothing, its profile goes.
      await martl.removeService('echo');
      expect(martl.serviceGate(token)).toBeUndefined();
      expect(await martl.services()).toEqual([]);
      sync([martl, lena]);
      expect(await lena.serviceProfiles()).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it('comes from a release only: own code from before stays there, says why, and doesn’t run', async () => {
    const martl = person('martl');
    await martl.createProject({ name: 'Weave' });
    // Nothing but a release, one Weave ships, or the website service.
    await expect(martl.addService({ name: 'mine', spaces: ['Weave'] })).rejects.toThrow(/a service comes from a release/);
    await expect(martl.addService({ name: 'mine', spaces: ['Weave'], command: ['node', 'bot.js'] } as never)).rejects.toThrow(/a service comes from a release/);
    // A service of martl's own code, as Weave kept one before: a command, and one with only its token.
    await serviceFromRelease(martl, { name: 'old', manifest: ECHO, component: placeholderComponent(), project: 'Weave', spaces: ['Weave'] });
    const file = join(martl.home.dir, 'services.json');
    const kept = readSecretJson<Array<Record<string, unknown>>>(martl.home, file)!;
    writeSecretJson(martl.home, file, kept.map(({ artifact: _artifact, approved: _approved, ...s }) => ({ ...s, command: [process.execPath, 'bot.js'] })));
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const [old] = await martl.services();
      expect(old).toMatchObject({ name: 'old', enabled: true, running: false, problem: expect.stringMatching(/^No longer runs: services come from releases now\. Release it in a project/) });
      expect(old).not.toHaveProperty('command');
      // It can still be removed (its key revoked).
      await martl.removeService('old');
      expect(await martl.services()).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it('runs on an always-on node: its key made on a computer, handed over sealed, never kept there', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    const boxDir = mkdtempSync(join(tmpdir(), 'weave-services-box-'));
    dirs.push(boxDir);
    const linked = await martl.linkNode({ request: WeaveNode.nodeRequest(boxDir, 'nas') });
    const box = await WeaveNode.completeNodeLink(linked.answer, boxDir);
    nodes.push(box);
    sync([martl, box]);
    await box.reconcile();

    // The node can't issue keys itself; the computer adds it for the node.
    const release = await releaseService(martl, { manifest: { app: 'files', name: 'Files', service: { reads: 'addressed', writes: [], version: '1.0' }, env: [{ name: 'NAS_FOLDER', label: 'Folder', optional: true }] }, component: placeholderComponent(), project: 'Weave' });
    const artifact = { project: release.project, tag: release.tag };
    await expect(box.addService({ name: 'files', artifact, approve: true })).rejects.toThrow(/can't issue keys/);
    await expect(martl.addService({ name: 'files', artifact, approve: true, node: 'elsewhere' })).rejects.toThrow(/no always-on node "elsewhere"[^]*nas/);
    const files = await martl.addService({ name: 'files', description: 'Your NAS', artifact, approve: true, spaces: ['Weave'], node: 'nas' });
    expect(files).toMatchObject({ name: 'files', node: { name: 'nas' }, spaces: [{ name: 'Weave' }] });
    // Its key isn't kept on the computer, and the handover can only be opened by the node.
    expect((await martl.whoami()).agents.map((a) => a.name)).not.toContain('files');
    expect(martl.serviceGate('x')).toBeUndefined();

    // The node takes it over, with a setting changed later.
    sync([martl, box]);
    await box.reconcile();
    expect((await box.services()).map((s) => [s.name, s.did, s.node])).toEqual([['files', files.did, undefined]]);
    await martl.setService({ name: 'files', settings: { NAS_FOLDER: '/volume1/photos' } });
    expect((await martl.services())[0].settings).toEqual(['NAS_FOLDER']);
    sync([martl, box]);
    await box.reconcile();
    expect((await box.services())[0].settings).toEqual(['NAS_FOLDER']);

    // It answers from the node, as "martl · files".
    sync([martl, lena]);
    const asked = await lena.askService({ space: 'Weave', service: 'martl/files', text: 'my photos?' });
    sync([lena, box]);
    const token = readSecretJson<Array<{ name: string; token: string }>>(box.home, join(box.home.dir, 'services.json'))!.find((x) => x.name === 'files')!.token;
    const answer = await box.serviceGate(token)!.answer({ request: asked.id, text: 'here they are' });
    expect(answer).toMatchObject({ author: martl.identity.author, signer: files.did, signerName: 'files' });
    sync([box, lena]);
    expect((await lena.serviceRequests({ space: 'Weave' }))[0].results.map((r) => r.text)).toEqual(['here they are']);

    // Removed from the computer: its key is revoked, and the node lets it go.
    await martl.removeService('files');
    expect(await martl.services()).toEqual([]);
    sync([martl, box]);
    await box.reconcile();
    expect(await box.services()).toEqual([]);
    expect(box.serviceGate(token)).toBeUndefined();
  });
});
