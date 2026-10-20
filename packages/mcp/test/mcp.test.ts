import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WeaveNode } from '@weave/node';
import { createWeaveMcp } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A node with a project and an agent, and an MCP client connected as that agent. */
async function setup(permissions = ['weave.post', 'weave.reply', 'weave.msg', 'weave.issue.*']) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-mcp-'));
  dirs.push(dir);
  const node = WeaveNode.init('Martin', dir);
  await node.createProject({ name: 'Weave' });
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
    expect(data.projects[0].name).toBe('Weave');
    close();
  });

  it('tells the harness how Weave works, including what only the person can do', async () => {
    const { client, close } = await setup();
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toContain('weave_github_connect');
    expect(instructions).toContain('Only select repositories');
    expect(instructions).toMatch(/Things only the person does/);
    close();
  });

  it('links repositories and publishes apps only with the permissions for it', async () => {
    const { node, call, close } = await setup();
    // A GitHub sign-in on this node, and a GitHub where the app may manage martl/weave.
    writeFileSync(join(node.home.dir, 'github.json'), JSON.stringify({ token: 't', login: 'martl' }));
    node.githubSetup = {
      ...node.githubSetup,
      fetch: (async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname;
        const body = path === '/user/installations' ? { installations: [{ id: 1 }] } : path === '/user/installations/1/repositories' ? { repositories: [{ full_name: 'martl/weave', permissions: { admin: true } }] } : path.endsWith('/collaborators') || path.endsWith('/invitations') ? [] : { message: 'Not Found' };
        return new Response(JSON.stringify(body), { status: 'message' in body ? 404 : 200 });
      }) as typeof fetch,
    };

    const refused = await call('weave_link_repo', { space: 'Weave', repo: 'martl/weave' });
    expect(refused.error).toMatch(/may not sign weave\.github\.repo; its person can allow it with: weave agent can forge .*weave\.github\.repo/);
    writeFileSync(join(node.home.dir, 'weave.app.json'), JSON.stringify({ app: 'weave', services: [{ port: 7777 }] }));
    const app = await call('weave_app_publish', { project: 'Weave', file: join(node.home.dir, 'weave.app.json') });
    expect(app.error).toMatch(/may not sign weave\.app/);

    await node.updateAgent({ name: 'forge', permissions: ['weave.post', 'weave.github.repo'] });
    const linked = await call('weave_link_repo', { space: 'Weave', repo: 'https://github.com/martl/weave' });
    expect(linked.data.repos).toMatchObject([{ repo: 'martl/weave', by: { name: 'Martin' } }]);
    // Signed by the agent, on the person's behalf.
    const event = (await node.feed({ space: 'Weave', kinds: ['weave.github.repo'] })).at(-1)!;
    expect(event.signerName).toBe('forge');
    close();
  });

  it('lets an agent ask for a permission, which its person allows from the Inbox', async () => {
    const { node, call, close } = await setup();
    // Refused, and told how to ask.
    const proposal = await node.propose({ project: 'Weave', title: 'Release v0.3' });
    const refused = await call('weave_vote', { proposal: proposal.id, choice: 'yes' });
    expect(refused.error).toMatch(/may not sign weave\.vote/);
    expect(refused.error).toMatch(/weave_request_permission/);

    const asked = (await call('weave_request_permission', { kinds: ['weave.vote', 'weave.post'], reason: 'to vote on the release proposal' })).data;
    expect(asked).toMatchObject({ agent: 'forge', kinds: ['weave.vote'], state: 'pending', reason: 'to vote on the release proposal' });
    // Asking again doesn't make a second request.
    expect((await call('weave_request_permission', { kinds: ['weave.vote'], reason: 'again' })).data.id).toBe(asked.id);
    expect((await node.permissionRequests()).map((r) => r.kinds)).toEqual([['weave.vote']]);

    await node.answerPermission({ id: asked.id, allow: true });
    expect(await node.permissionRequests()).toEqual([]);
    expect((await call('weave_whoami')).data.actingAs.permissions).toContain('weave.vote');
    expect((await call('weave_request_permission', { kinds: ['weave.vote'], reason: 'x' })).data.state).toBe('allowed');

    // Declined ones change nothing.
    const other = (await call('weave_request_permission', { kinds: ['weave.app'], reason: 'publish Gameshow' })).data;
    await node.answerPermission({ id: other.id, allow: false });
    expect((await call('weave_whoami')).data.actingAs.permissions).not.toContain('weave.app');
    close();
  });

  it('brings the app to the front at the link dialog, without it landing in the agent inbox', async () => {
    const { node, call, close } = await setup();
    const seen: Array<{ kind: string; body: unknown }> = [];
    const watching = new AbortController();
    void node.watch((item) => seen.push(item), watching.signal);
    await new Promise((r) => setTimeout(r, 30));
    const opened = await call('weave_open_in_app', { what: 'link-repo', space: 'Weave', repo: 'https://github.com/martldennl/gameshow' });
    expect(opened.data).toMatchObject({ what: 'link-repo', space: { kind: 'project', name: 'Weave' }, repo: 'martldennl/gameshow' });
    await new Promise((r) => setTimeout(r, 30));
    watching.abort();
    expect(seen.find((i) => i.kind === 'weave.open')?.body).toMatchObject({ what: 'link-repo', repo: 'martldennl/gameshow' });
    expect((await call('weave_inbox', {})).data.items ?? []).toEqual([]);
    expect((await call('weave_open_in_app', { what: 'link-repo' })).error).toMatch(/say which space/);
    close();
  });

  it('teaches and checks app manifests, every problem at once', async () => {
    const { call, close } = await setup();
    const guide = (await call('weave_app_manifest')).data;
    expect(guide.rules.join(' ')).toContain('start.release');
    // The example passes its own check.
    expect((await call('weave_app_manifest', { manifest: guide.example })).data).toMatchObject({ ok: true, problems: [] });
    const bad = (await call('weave_app_manifest', { manifest: { app: 'Band AB', services: [{ port: 0 }], start: { command: 'node server.js' } } })).data;
    expect(bad.ok).toBe(false);
    expect(bad.problems).toHaveLength(3);
    expect(bad.rules).toBeDefined();
    close();
  });

  it('lets an agent upload images and dress the project page, with the permissions for it', async () => {
    const { node, call, close } = await setup();
    const png = join(node.home.dir, 'icon.png');
    writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const uploaded = (await call('weave_upload_image', { file: png })).data;
    expect(uploaded.ref).toMatch(/^wblob:/);
    expect((await call('weave_upload_image', { file: join(node.home.dir, 'notes.txt') })).error).toMatch(/\.png, \.jpg/);

    const refused = await call('weave_set_project_page', { project: 'Weave', subtitle: 'Build together' });
    expect(refused.error).toMatch(/may not sign weave\.project\.page/);
    await node.updateAgent({ name: 'forge', permissions: ['weave.post', 'weave.project.page'] });
    const page = (await call('weave_set_project_page', { project: 'Weave', subtitle: 'Build together', icon: uploaded.ref, body: `![stage](${uploaded.ref})` })).data;
    expect(page).toMatchObject({ subtitle: 'Build together', icon: uploaded.ref });
    expect((await node.project('Weave')).page.subtitle).toBe('Build together');
    // Making it public also needs weave.project.public.
    expect((await call('weave_set_project_page', { project: 'Weave', public: true })).error).toMatch(/weave\.project\.public/);
    close();
  });

  it('signs everything as the agent', async () => {
    const { node, call, close } = await setup();
    await call('weave_say', { space: 'Weave', text: 'build is green' });
    const issue = (await call('weave_open_issue', { project: 'Weave', title: 'Write docs' })).data;
    await call('weave_claim_issue', { issue: issue.short });

    expect((await node.messages('Weave'))[0].by).toMatchObject({ name: 'Martin', agent: 'forge' });
    expect((await node.issues('Weave'))[0]).toMatchObject({ status: 'in-progress', assignee: { agent: 'forge' } });
    close();
  });

  it('lets the agent react and reply in channels', async () => {
    const { node, call, close } = await setup(['weave.msg', 'weave.react']);
    const hello = await node.say({ space: 'Weave', text: 'can someone check the build?' });
    await call('weave_react', { target: hello.short, emoji: '👀' });
    await call('weave_say', { space: 'Weave', text: 'on it', reply_to: hello.short });
    const [first, second] = await node.messages('Weave');
    expect(first.reactions[0]).toMatchObject({ emoji: '👀', by: ['Martin · forge'] });
    expect(second).toMatchObject({ text: 'on it', replyTo: { id: hello.id } });
    close();
  });

  it('lets the agent post into a board, read the post and talk in its chat', async () => {
    const { node, call, close } = await setup(['weave.post', 'weave.msg', 'weave.upvote']);
    const posted = (await call('weave_submit', { space: 'Weave', board: 'releases', title: 'Nightly build', text: 'All green' })).data;
    expect(posted).toMatchObject({ board: 'releases', by: { agent: 'forge' } });
    await node.say({ post: posted.short, text: 'Thanks @forge' });
    await call('weave_say', { post: posted.short, text: 'You are welcome' });
    await call('weave_upvote', { post: posted.short, value: 1 });
    const { data } = await call('weave_read_post', { post: posted.short });
    expect(data.chat.map((m: { text: string }) => m.text)).toEqual(['Thanks @forge', 'You are welcome']);
    expect(data.score).toBe(1);
    expect((await call('weave_posts', { space: 'Weave', board: 'releases' })).data[0].title).toBe('Nightly build');
    close();
  });

  it('reports permission errors as tool errors', async () => {
    const { node, call, close } = await setup();
    const proposal = await node.propose({ project: 'Weave', title: 'Ship it' });
    const { error } = await call('weave_vote', { proposal: proposal.short, choice: 'yes' });
    expect(error).toMatch(/may not sign weave.vote/);
    close();
  });

  it('delivers new events through the inbox, flags mentions, and skips its own writes', async () => {
    const { node, call, close } = await setup();
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the watcher start
    await call('weave_say', { space: 'Weave', text: 'my own message' });
    await node.say({ space: 'Weave', text: 'just chatting' });
    await node.startThread({ project: 'Weave', title: 'Benchmarks', text: '@forge can you run them?' });

    const mentions = (await call('weave_inbox', { mentions_only: true })).data;
    expect(mentions.items.map((i: { text: string }) => i.text)).toEqual(['Benchmarks — @forge can you run them?']);
    const rest = (await call('weave_inbox')).data;
    expect(rest.items.map((i: { text: string }) => i.text)).toEqual(['just chatting']);
    close();
  });

  it('waits for something to arrive', async () => {
    const { node, call, close } = await setup();
    setTimeout(() => void node.say({ space: 'Weave', text: 'late arrival' }), 200);
    const started = Date.now();
    const { data } = await call('weave_inbox', { wait_seconds: 5 });
    expect(data.items[0].text).toBe('late arrival');
    expect(Date.now() - started).toBeLessThan(3000);
    close();
  });
});
