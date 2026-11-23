import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, remoteAgent, startAgentApi, WeaveNode } from '@weave/node';

/*
 * Agent keys with a scope (issue 4Vxe): a key given spaces reaches only those through its tokens, and in each only the
 * areas it may read or write there. Tokens are made per machine, and one machine's can be ended alone.
 */

const dirs: string[] = [];
const closing: Array<() => Promise<unknown> | void> = [];
afterAll(async () => {
  for (const close of closing) await close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const node = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-agentscope-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
};

async function setup() {
  const martl = node('martl');
  await martl.createProject({ name: 'Studio' });
  await martl.createProject({ name: 'Secret' });
  await martl.addAgent('vm-coder', ['weave.post', 'weave.reply', 'weave.msg', 'weave.issue', 'weave.issue.status']);
  const api = await startAgentApi(martl, '127.0.0.1:0', (token) => martl.agentGate(token));
  closing.push(api.close);
  return { martl, url: `http://127.0.0.1:${api.port}` };
}

describe('an agent key with a scope', () => {
  it('reaches only its spaces, and in each only what it may read and write', async () => {
    const { martl, url } = await setup();
    const secretPost = await martl.submit({ space: 'Secret', title: 'Not for the VM' });
    const { token } = await martl.agentToken({ name: 'vm-coder', machine: 'build-vm-1' });
    const remote = remoteAgent(url, token!);

    // No scope yet: every space, as before.
    expect((await remote.spaces()).map((s) => s.name).sort()).toEqual(['Secret', 'Studio']);

    // Studio: posts read and write, issues read only, no chat.
    const scope = await martl.setAgentScope({ name: 'vm-coder', space: 'Studio', access: { read: ['posts', 'issues'], write: ['posts'] } });
    expect(Object.values(scope!.spaces)).toEqual([{ read: ['posts', 'issues'], write: ['posts'] }]);

    expect((await remote.spaces()).map((s) => s.name)).toEqual(['Studio']);
    const post = await remote.submit({ space: 'Studio', title: 'From the VM' });
    expect(post.by).toMatchObject({ agent: 'vm-coder' });
    await expect(remote.submit({ space: 'Secret', title: 'Sneaking in' })).rejects.toThrow(/doesn't reach/);
    await expect(remote.post(secretPost.id)).rejects.toThrow(/doesn't reach/);
    expect((await remote.posts({ space: 'Studio' })).map((p) => p.title)).toContain('From the VM');
    await expect(remote.posts({ space: 'Secret' })).resolves.toEqual([]);
    expect((await remote.feed({ limit: 500 })).every((i) => !i.space || i.space.name === 'Studio')).toBe(true);

    // Issues: read, but no write; chat: neither.
    await expect(remote.issues('Studio')).resolves.toEqual([]);
    await expect(remote.openIssue({ project: 'Studio', title: 'A bug' })).rejects.toThrow(/doesn't reach/);
    await expect(remote.say({ space: 'Studio', text: 'hi' })).rejects.toThrow(/doesn't reach/);
    await expect(remote.messages('Studio')).rejects.toThrow(/doesn't reach/);

    // Given more, it can do more at once; taken away, it can't.
    await martl.setAgentScope({ name: 'vm-coder', space: 'Studio', access: { read: [], write: ['posts', 'issues', 'chat'] } });
    await expect(remote.openIssue({ project: 'Studio', title: 'A bug' })).resolves.toMatchObject({ title: 'A bug' });
    await expect(remote.say({ space: 'Studio', text: 'hi' })).resolves.toMatchObject({ text: 'hi' });
    await martl.setAgentScope({ name: 'vm-coder', space: 'Studio', access: null });
    await expect(remote.submit({ space: 'Studio', title: 'Again' })).rejects.toThrow(/doesn't reach/);
    expect(await remote.spaces()).toEqual([]);

    // Lifting the scope: every space again.
    expect(await martl.setAgentScope({ name: 'vm-coder', all: true })).toBeUndefined();
    expect((await remote.spaces()).length).toBe(2);
  });

  it('makes tokens per machine, lists them without the token, and ends one machine alone', async () => {
    const { martl, url } = await setup();
    const vm1 = (await martl.agentToken({ name: 'vm-coder', machine: '  build-vm-1 ' })).token!;
    const vm2 = (await martl.agentToken({ name: 'vm-coder', machine: 'build-vm-2' })).token!;
    const lines = await martl.agentTokens();
    expect(lines.map((l) => [l.agent, l.machine, l.tokens])).toEqual([['vm-coder', 'build-vm-1', 1], ['vm-coder', 'build-vm-2', 1]]);
    expect(JSON.stringify(lines)).not.toContain('wat_');

    expect(await martl.revokeAgentMachine({ name: 'vm-coder', machine: 'build-vm-1' })).toEqual({ revoked: 1 });
    await expect(remoteAgent(url, vm1).whoami()).rejects.toThrow(/unauthorized/);
    await expect(remoteAgent(url, vm2).whoami()).resolves.toMatchObject({ did: martl.identity.author });
    expect(martl.agentGate(vm2)).toMatchObject({ name: 'vm-coder', machine: 'build-vm-2' });
  });

  it('names and stacks its own sessions, marked with its agent and machine, and no others', async () => {
    const { martl, url } = await setup();
    const remote = remoteAgent(url, (await martl.agentToken({ name: 'vm-coder', machine: 'build-vm-1' })).token!);
    const item = await martl.submit({ space: 'Studio', title: 'Build the thing' });

    const named = await remote.nameSession({ session: { id: 'vm-session-1' }, name: 'Mosaik', about: 'Builds on the VM' });
    expect(named).toMatchObject({ name: 'Mosaik', agent: 'vm-coder', machine: { name: 'build-vm-1', kind: 'agent-token' } });
    const working = await remote.workOn({ session: { id: 'vm-session-1' }, post: item.id });
    expect(working.stack.map((s) => s.post.id)).toEqual([item.id]);
    expect((await martl.sessions()).find((s) => s.id === 'vm-session-1')).toMatchObject({ agent: 'vm-coder', machine: { name: 'build-vm-1' } });

    // A session of this computer's isn't the token's to name or stack.
    await martl.nameSession({ session: { id: 'local-session' }, name: 'Loom', about: 'Plans the day' });
    await expect(remote.nameSession({ session: { id: 'local-session' }, name: 'Taken' })).rejects.toThrow(/isn't one of vm-coder's/);
    await expect(remote.workOn({ session: { id: 'local-session' }, post: item.id })).rejects.toThrow(/isn't one of vm-coder's/);

    // Scoped away from Studio: it can't take Studio's item onto its stack.
    await martl.setAgentScope({ name: 'vm-coder', space: 'Secret', access: { read: ['posts'], write: ['posts'] } });
    await expect(remote.workOn({ session: { id: 'vm-session-1' }, post: item.id })).rejects.toThrow(/doesn't reach/);
  });

  it('refuses a space it doesn’t know, and an agent it doesn’t hold', async () => {
    const { martl } = await setup();
    await expect(martl.setAgentScope({ name: 'vm-coder', space: 'Nowhere', access: { read: ['posts'], write: [] } })).rejects.toThrow(/no group, project or friend/);
    await expect(martl.setAgentScope({ name: 'ghost', space: 'Studio', access: { read: ['posts'], write: [] } })).rejects.toThrow();
  });
});
