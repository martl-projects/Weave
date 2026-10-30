import { closeOpenStores } from '@weave/node';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WeaveNode } from '@weave/node';
import { createWeaveMcp, sessionFromEnv } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

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
    expect(instructions).toContain('weave_link_account');
    expect(instructions).toContain('GitHub access service');
    expect(instructions).toMatch(/Things only the person does/);
    expect(instructions).toMatch(/permanent name.*weave_name_session/s);
    close();
  });

  it('has the session name itself once, and tells it the title to go by', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-mcp-'));
    dirs.push(dir);
    const node = WeaveNode.init('Martin', dir);
    await node.createProject({ name: 'Weave' });
    await node.addAgent('claude', ['weave.post']);
    await node.nameSession({ session: { id: 'other-session' }, name: 'Skala', about: 'Reviews' });
    const session = sessionFromEnv({ CLAUDE_CODE_SESSION_ID: 'e360e3d1-named', CLAUDE_CODE_HOST_SESSION_ID: 'local_named' }, 'C:\\code\\weave');
    const { server, close } = createWeaveMcp(node, { as: 'claude', session });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test-harness', version: '1.0.0' });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
      const text = result.content[0].text;
      return { error: result.isError ? text : undefined, data: result.isError ? undefined : JSON.parse(text) };
    };

    // New here: whoami and the stack both say it has no name, and what to do.
    expect((await call('weave_whoami')).data.session).toMatchObject({ name: null, nameIt: expect.stringMatching(/weave_name_session/) });
    expect((await call('weave_session')).data).toMatchObject({ id: 'e360e3d1-named', name: null, stack: [] });
    // Taken names are refused with the names around; then it's named, for good.
    expect((await call('weave_name_session', { name: 'skala', about: 'Weave naming feature' })).error).toMatch(/"Skala" is taken; names around you: claude, Martin, Skala/);
    const named = (await call('weave_name_session', { name: 'Shuttle', about: 'Weave naming feature', description: 'Builds the session naming feature.' })).data;
    expect(named).toMatchObject({ id: 'e360e3d1-named', name: 'Shuttle', about: 'Weave naming feature', title: 'Shuttle · Weave naming feature', setTitle: expect.stringMatching(/set it to "Shuttle · Weave naming feature"/) });
    expect((await call('weave_whoami')).data.session).toMatchObject({ name: 'Shuttle', title: 'Shuttle · Weave naming feature' });
    expect((await call('weave_name_session', { name: 'Heddle' })).error).toMatch(/this session is Shuttle: a name is permanent/);
    expect((await call('weave_name_session', { about: 'Sessions and their names' })).data.title).toBe('Shuttle · Sessions and their names');
    // The driver hands work to it by name.
    await node.setSessionRole({ session: { id: 'e360e3d1-named' }, role: 'worker' });
    const item = await node.submit({ space: 'Weave', board: 'issues', title: 'Name sessions' });
    expect((await call('weave_assign', { post: item.url, worker: 'Shuttle' })).data).toMatchObject({ id: 'e360e3d1-named', stack: [{ post: { title: 'Name sessions' } }] });
    expect((await call('weave_workers')).data.map((w: { title: string }) => w.title)).toEqual(['Shuttle · Sessions and their names']);
    close();
  });

  it('says accounts elsewhere and publishes apps only with the permissions for it', async () => {
    const { node, call, close } = await setup();
    // Without its proof, it says what the proof holds; saying one is the person's needs weave.account.
    const how = await call('weave_link_account', { platform: 'github' });
    expect(how.data?.proofText?.text ?? how.error).toMatch(/My Weave id: did:key:|nothing here checks accounts on github/);
    const refused = await call('weave_link_account', { platform: 'github', handle: 'martl', proof: '0123456789abcdef0123' });
    expect(refused.error).toMatch(/may not sign weave\.account; its person can allow it in Keys & devices in the Weave app, or with: weave agent can forge .*weave\.account/);
    writeFileSync(join(node.home.dir, 'weave.app.json'), JSON.stringify({ app: 'weave', services: [{ port: 7777 }] }));
    const app = await call('weave_app_publish', { project: 'Weave', file: join(node.home.dir, 'weave.app.json') });
    expect(app.error).toMatch(/may not sign weave\.app/);

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

  it('brings the app to the front at a space, without it landing in the agent inbox', async () => {
    const { node, call, close } = await setup();
    const seen: Array<{ kind: string; body: unknown }> = [];
    const watching = new AbortController();
    void node.watch((item) => seen.push(item), watching.signal);
    await new Promise((r) => setTimeout(r, 30));
    const opened = await call('weave_open_in_app', { what: 'space', space: 'Weave' });
    expect(opened.data).toMatchObject({ what: 'space', space: { kind: 'project', name: 'Weave' } });
    await new Promise((r) => setTimeout(r, 30));
    watching.abort();
    expect(seen.find((i) => i.kind === 'weave.open')?.body).toMatchObject({ what: 'space' });
    expect((await call('weave_inbox', {})).data.items ?? []).toEqual([]);
    expect((await call('weave_open_in_app', { what: 'space' })).error).toMatch(/say which space/);
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

  it("keeps the session's work items as a stack: new work on top, interrupted work comes back", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-mcp-'));
    dirs.push(dir);
    const node = WeaveNode.init('Martin', dir);
    await node.createProject({ name: 'Desk' });
    await node.addAgent('claude', ['weave.post', 'weave.issue', 'weave.issue.status']);
    const session = sessionFromEnv({ CLAUDE_CODE_SESSION_ID: 'e360e3d1-test', CLAUDE_CODE_HOST_SESSION_ID: 'local_5499-test' }, 'C:\\desk');
    expect(session).toEqual({ provider: 'claude-code', id: 'e360e3d1-test', host: 'local_5499-test', folder: 'C:\\desk' });
    const { server, close } = createWeaveMcp(node, { as: 'claude', session });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test-harness', version: '1.0.0' });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
      if (result.isError) throw new Error(result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    const titles = (s: { stack: Array<{ post: { title: string } }> }) => s.stack.map((i) => i.post.title);

    const journal = await node.submit({ space: 'Desk', board: 'ideas', title: 'Thursday, 23 October 2026', prompt: 'This is journaling: turn what deserves it into work items.' });
    expect(journal.prompt).toBe('This is journaling: turn what deserves it into work items.');
    let s = await call('weave_work_on', { post: journal.url });
    expect(s).toMatchObject({ provider: 'claude-code', id: 'e360e3d1-test', host: 'local_5499-test', folder: 'C:\\desk' });
    expect(s.stack[0].post).toMatchObject({ title: 'Thursday, 23 October 2026', prompt: 'This is journaling: turn what deserves it into work items.' });

    // Standup interrupts the journal; a new issue interrupts the standup.
    const standup = await node.submit({ space: 'Desk', board: 'ideas', title: 'Standup' });
    s = await call('weave_work_on', { post: standup.id });
    s = await call('weave_work_on', { create: { space: 'Desk', board: 'issues', title: 'Fix the login', prompt: 'Find why sign-in fails and fix it.' } });
    expect(titles(s)).toEqual(['Fix the login', 'Standup', 'Thursday, 23 October 2026']);
    expect(s.stack[0].post).toMatchObject({ type: 'issue', prompt: 'Find why sign-in fails and fix it.' });

    // Done with the issue (closing it): back to the standup, then the journal.
    s = await call('weave_done', { close: true });
    expect(titles(s)).toEqual(['Standup', 'Thursday, 23 October 2026']);
    expect((await node.issues('Desk'))[0].status).toBe('done');
    s = await call('weave_stack', { posts: [journal.id] });
    expect(titles(s)).toEqual(['Thursday, 23 October 2026', 'Standup']);
    s = await call('weave_stack', { remove: [standup.id] });
    expect(titles(await call('weave_session'))).toEqual(['Thursday, 23 October 2026']);

    // The stack is the person's: sealed to them, listed with the session.
    expect((await node.sessions()).map((x) => [x.id, x.stack.length])).toEqual([['e360e3d1-test', 1]]);
    await expect(call('weave_done', { post: standup.id })).rejects.toThrow(/isn't on this session's stack/);

    // As the driver: the workers that take an item, and handing it to one.
    await node.setSessionRole({ session: { id: 'worker-1', folder: 'C:\\code' }, role: 'worker', projects: ['Desk'] });
    const workers = await call('weave_workers', { post: standup.id });
    expect(workers.map((w: { id: string; role: string }) => [w.id, w.role])).toEqual([['worker-1', 'worker']]);
    expect(titles(await call('weave_assign', { post: standup.url, worker: 'worker-1' }))).toEqual(['Standup']);
    await expect(call('weave_assign', { post: standup.id, worker: 'nobody' })).rejects.toThrow(/available worker/);
    close();
  });

  it('asks for the session where the harness says nothing', async () => {
    const { call, close } = await setup();
    expect((await call('weave_session')).error).toMatch(/pass session_id/);
    expect((await call('weave_session', { session_id: 'some-session' })).data).toMatchObject({ id: 'some-session', stack: [] });
    close();
  });

  it('shows posts in the Mentions panel, and as cards where the host renders MCP Apps', async () => {
    const { node, client, call, close } = await setup(['weave.post']);
    const idea = await node.submit({ space: 'Weave', board: 'ideas', title: 'KMS System' });
    const tool = (await client.listTools()).tools.find((t) => t.name === 'weave_show');
    expect(tool?._meta).toEqual({ ui: { resourceUri: 'ui://weave/post-cards' } });
    const view = await client.readResource({ uri: 'ui://weave/post-cards' });
    expect(view.contents[0]).toMatchObject({ uri: 'ui://weave/post-cards', mimeType: 'text/html;profile=mcp-app' });
    expect((view.contents[0] as { text: string }).text).toContain("request('ui/initialize'");

    const { data } = await call('weave_show', { posts: [idea.url], note: 'From our plan' });
    expect(data).toMatchObject([{ source: 'agent', agent: 'forge', note: 'From our plan', post: { title: 'KMS System', url: idea.url } }]);
    expect((await node.mentions()).length).toBe(1);
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

  it('keeps company spaces an agent isn’t approved in out of its sight', async () => {
    const { agentView } = await import('../src/index.ts');
    const fake = {
      agentBlocked: async () => [{ id: 'acme', name: 'Acme' }],
      spaces: async () => [{ id: 'acme', kind: 'project', name: 'Acme' }, { id: 'open', kind: 'project', name: 'Open' }],
      feed: async () => [{ id: '1', scope: 'project:acme' }, { id: '2', scope: 'project:open' }],
      posts: async () => [],
      post: async () => ({ id: 'p', space: { id: 'acme' } }),
    } as unknown as import('@weave/node').Backend;
    const seen = agentView(fake, 'helper');
    expect((await seen.spaces()).map((s) => s.id)).toEqual(['open']);
    expect((await seen.feed({})).map((i) => i.id)).toEqual(['2']);
    await expect(seen.posts({ space: 'Acme' })).rejects.toThrow(/isn't approved/);
    await expect(seen.post('p')).rejects.toThrow(/isn't approved/);
  });
});
