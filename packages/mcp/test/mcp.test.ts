import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WeaveNode } from '@weave/node';
import { createWeaveMcp } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A node with a group and an agent, and an MCP client connected as that agent. */
async function setup(permissions = ['weave.post', 'weave.reply', 'weave.msg', 'weave.issue.*']) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-mcp-'));
  dirs.push(dir);
  const node = WeaveNode.init('Martin', dir);
  await node.createGroup('Weave');
  await node.addAgent('forge', permissions);

  const { server, close } = createWeaveMcp(node, { as: 'forge' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-harness', version: '1.0.0' });
  await client.connect(clientSide);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
    const text = result.content[0].text;
    return { error: result.isError ? text : undefined, data: result.isError ? undefined : JSON.parse(text) };
  };
  return { node, client, call, close };
}

describe('Weave over MCP', () => {
  it('lists its tools', async () => {
    const { client, close } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['weave_inbox', 'weave_whoami', 'weave_reply', 'weave_say', 'weave_claim_issue', 'weave_vote']),
    );
    close();
  });

  it('tells the agent who it is and what it may do', async () => {
    const { call, close } = await setup();
    const { data } = await call('weave_whoami');
    expect(data.person.name).toBe('Martin');
    expect(data.actingAs).toMatchObject({ agent: 'forge', permissions: expect.arrayContaining(['weave.reply']) });
    expect(data.groups[0].name).toBe('Weave');
    close();
  });

  it('signs everything as the agent', async () => {
    const { node, call, close } = await setup();
    await call('weave_say', { group: 'Weave', text: 'build is green' });
    const issue = (await call('weave_open_issue', { group: 'Weave', title: 'Write docs' })).data;
    await call('weave_claim_issue', { issue: issue.short });

    expect((await node.messages('Weave'))[0].by).toMatchObject({ name: 'Martin', agent: 'forge' });
    expect((await node.issues('Weave'))[0]).toMatchObject({ status: 'in-progress', assignee: { agent: 'forge' } });
    close();
  });

  it('lets the agent react and reply in channels', async () => {
    const { node, call, close } = await setup(['weave.msg', 'weave.react']);
    const hello = await node.say({ group: 'Weave', text: 'can someone check the build?' });
    await call('weave_react', { target: hello.short, emoji: '👀' });
    await call('weave_say', { group: 'Weave', text: 'on it', reply_to: hello.short });
    const [first, second] = await node.messages('Weave');
    expect(first.reactions[0]).toMatchObject({ emoji: '👀', by: ['Martin · forge'] });
    expect(second).toMatchObject({ text: 'on it', replyTo: { id: hello.id } });
    close();
  });

  it('reports permission errors as tool errors', async () => {
    const { node, call, close } = await setup();
    const proposal = await node.propose({ group: 'Weave', title: 'Ship it' });
    const { error } = await call('weave_vote', { proposal: proposal.short, choice: 'yes' });
    expect(error).toMatch(/may not sign weave.vote/);
    close();
  });

  it('delivers new events through the inbox, flags mentions, and skips its own writes', async () => {
    const { node, call, close } = await setup();
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the watcher start
    await call('weave_say', { group: 'Weave', text: 'my own message' });
    await node.say({ group: 'Weave', text: 'just chatting' });
    await node.startThread({ group: 'Weave', title: 'Benchmarks', text: '@forge can you run them?' });

    const mentions = (await call('weave_inbox', { mentions_only: true })).data;
    expect(mentions.items.map((i: { text: string }) => i.text)).toEqual(['Benchmarks — @forge can you run them?']);
    const rest = (await call('weave_inbox')).data;
    expect(rest.items.map((i: { text: string }) => i.text)).toEqual(['just chatting']);
    close();
  });

  it('waits for something to arrive', async () => {
    const { node, call, close } = await setup();
    setTimeout(() => void node.say({ group: 'Weave', text: 'late arrival' }), 200);
    const started = Date.now();
    const { data } = await call('weave_inbox', { wait_seconds: 5 });
    expect(data.items[0].text).toBe('late arrival');
    expect(Date.now() - started).toBeLessThan(3000);
    close();
  });
});
