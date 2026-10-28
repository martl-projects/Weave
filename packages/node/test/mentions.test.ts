import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, WeaveNode, type FeedItem, type MentionInfo } from '../src/index.ts';

const dirs: string[] = [];
const temp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  closeOpenStores(); // weave.db stays open until then, and Windows won't delete it
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

/** Waits until `count` mentions arrived (or a few seconds passed). */
function collect(node: WeaveNode, count: number): Promise<MentionInfo[]> {
  const got: MentionInfo[] = [];
  const watching = new AbortController();
  return new Promise((resolve) => {
    const done = () => {
      watching.abort();
      resolve(got);
    };
    const timer = setTimeout(done, 5000);
    void node.watch((item: FeedItem) => {
      if (item.kind !== 'weave.mention') return;
      got.push(item.body as unknown as MentionInfo);
      if (got.length >= count) {
        clearTimeout(timer);
        done();
      }
    }, watching.signal);
  });
}

/** Where the Claude Code session ran, as a path of this computer (sessions run where Weave does). */
const SESSION_FOLDER = process.platform === 'win32' ? 'C:\\code\\weave' : '/code/weave';

const line = (entry: object) => `${JSON.stringify(entry)}\n`;
const answer = (text: string, extra: object = {}) =>
  line({ type: 'assistant', sessionId: 'session-1', cwd: SESSION_FOLDER, message: { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] }, ...extra });

describe('the Mentions panel', () => {
  it('shows posts an agent points to, newest first, on this computer only', async () => {
    const martin = WeaveNode.init('Martin', temp('weave-mentions-'));
    await martin.addAgent('claude', ['weave.post']);
    await martin.createProject({ name: 'Weave' });
    const idea = await martin.submit({ space: 'Weave', board: 'ideas', title: 'KMS System' });
    const arriving = collect(martin, 1);
    const shown = await martin.showPosts({ posts: [idea.url], note: 'From our plan', as: 'claude' });
    expect(shown).toMatchObject([{ source: 'agent', agent: 'claude', note: 'From our plan', post: { id: idea.id, title: 'KMS System', board: 'ideas', url: idea.url } }]);
    expect(await arriving).toHaveLength(1);
    expect((await martin.mentions()).map((m) => m.post.title)).toEqual(['KMS System']);
    await expect(martin.showPosts({ posts: ['weave~zzzz/ideas/zzzz'] })).rejects.toThrow(/no post found/);
    await expect(martin.showPosts({ posts: [idea.id], as: 'nobody' })).rejects.toThrow();
  });

  it('gives a session Ctrl+click opened its item, once the Claude app says which session it is', async () => {
    const claude = temp('weave-claude-');
    const log = join(temp('weave-claude-log-'), 'main.log');
    writeFileSync(log, '2026-10-23 13:00:00 [info] [CCD] LocalSessions.setFocusedSession: sessionId=local_busy\n');
    process.env.CLAUDE_CONFIG_DIR = claude;
    process.env.WEAVE_CLAUDE_APP_LOG = log;
    const martin = WeaveNode.init('Martin', temp('weave-mentions-'));
    try {
      await martin.createProject({ name: 'Desk' });
      const entry = await martin.submit({ space: 'Desk', board: 'ideas', title: 'Friday, 23 October 2026' });
      const other = await martin.submit({ space: 'Desk', board: 'ideas', title: 'Something else' });
      await martin.workOn({ session: { id: 'busy-cli', host: 'local_busy' }, post: other.id });
      await martin.followClaudeCode({ on: true });
      await martin.expectSession({ post: entry.id, folder: 'C:\\desk' });
      const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

      // Passing through a session that has work doesn't take the item.
      appendFileSync(log, '2026-10-23 13:00:05 [info] Mapping internal session local_busy to CLI session busy-cli\n');
      await settle();
      expect((await martin.session({ id: 'busy-cli' })).stack.map((s) => s.post.id)).toEqual([other.id]);
      // The new session shows up, but its id only comes with the first message.
      appendFileSync(log, '2026-10-23 13:00:10 [info] [CCD] LocalSessions.setFocusedSession: sessionId=null\n2026-10-23 13:00:10 [info] [CCD] LocalSessions.setFocusedSession: sessionId=local_new\n');
      await settle();
      expect(await martin.sessions()).toHaveLength(1);
      appendFileSync(log, '2026-10-23 13:00:30 [info] Mapping internal session local_new to CLI session new-cli\n');
      await settle();
      expect(await martin.session({ id: 'new-cli' })).toMatchObject({ host: 'local_new', folder: 'C:\\desk', stack: [{ post: { id: entry.id } }] });
      expect((await martin.focusedSession())?.id).toBe('new-cli');
    } finally {
      await martin.followClaudeCode({ on: false });
      delete process.env.CLAUDE_CONFIG_DIR;
      delete process.env.WEAVE_CLAUDE_APP_LOG;
      await martin.close();
    }
  });

  it('gives a session the Sessions page opened its job and projects, once the Claude app says which session it is', async () => {
    const claude = temp('weave-claude-');
    const log = join(temp('weave-claude-log-'), 'main.log');
    writeFileSync(log, '2026-10-28 09:00:00 [info] [CCD] LocalSessions.setFocusedSession: sessionId=null\n');
    process.env.CLAUDE_CONFIG_DIR = claude;
    process.env.WEAVE_CLAUDE_APP_LOG = log;
    const martin = WeaveNode.init('Martin', temp('weave-mentions-'));
    try {
      const project = await martin.createProject({ name: 'Snake Flight' });
      await martin.rememberFolder({ space: project.id, folder: 'C:\\snake' });
      expect(await martin.folders({ space: 'Snake Flight' })).toEqual(['C:\\snake']);
      await expect(martin.expectSession({ folder: 'C:\\snake' })).rejects.toThrow(/item, a job/);
      await martin.followClaudeCode({ on: true });
      await martin.expectSession({ folder: 'C:\\snake', role: 'worker', projects: ['Snake Flight'] });
      const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

      appendFileSync(log, '2026-10-28 09:00:10 [info] [CCD] LocalSessions.setFocusedSession: sessionId=local_new\n');
      appendFileSync(log, '2026-10-28 09:00:30 [info] Mapping internal session local_new to CLI session new-cli\n');
      await settle();
      const session = await martin.session({ id: 'new-cli' });
      expect(session).toMatchObject({ host: 'local_new', folder: 'C:\\snake', role: 'worker', available: true, stack: [] });
      expect(session.projects?.map((p) => p.name)).toEqual(['Snake Flight']);
    } finally {
      await martin.followClaudeCode({ on: false });
      delete process.env.CLAUDE_CONFIG_DIR;
      delete process.env.WEAVE_CLAUDE_APP_LOG;
      await martin.close();
    }
  });

  it("follows Claude Code sessions for links in the agent's answers, once switched on", async () => {
    const claude = temp('weave-claude-');
    const folder = join(claude, 'projects', 'C--code-weave');
    mkdirSync(folder, { recursive: true });
    const transcript = join(folder, 'session-1.jsonl');
    const martin = WeaveNode.init('Martin', temp('weave-mentions-'));
    await martin.createProject({ name: 'Weave' });
    const idea = await martin.submit({ space: 'Weave', board: 'ideas', title: 'KMS System' });
    const issue = await martin.submit({ space: 'Weave', board: 'issues', title: 'Keys rotate twice' });
    // Written before following starts: never shown.
    writeFileSync(transcript, answer(`Earlier: ${idea.url}`));

    process.env.CLAUDE_CONFIG_DIR = claude;
    try {
      expect(await martin.followClaudeCode({ on: true })).toMatchObject({ on: true, found: true });
      const arriving = collect(martin, 2);
      appendFileSync(
        transcript,
        line({ type: 'user', message: { role: 'user', content: `look at ${idea.url}` } }) + // yours: not a mention
          answer('A subagent found weave~x/y/zzzz', { isSidechain: true }) + // a subagent's: not shown in the chat
          answer(`I've updated [KMS System](${idea.url}) and opened weave~${issue.space!.id.slice(0, 4)}/issues/${issue.id.slice(0, 4)}. Again: ${idea.url}`) +
          '{ not json\n',
      );
      const mentions = await arriving;
      expect(mentions.map((m) => [m.source, m.post.title, m.session])).toEqual([
        ['claude-code', 'KMS System', { id: 'session-1', folder: 'weave' }],
        ['claude-code', 'Keys rotate twice', { id: 'session-1', folder: 'weave' }],
      ]);
      // The same post again in the same session within the hour: not repeated.
      appendFileSync(transcript, answer(`Still ${idea.url}`));
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect((await martin.mentions()).length).toBe(2);
      expect(await martin.followClaudeCode({ on: false })).toMatchObject({ on: false });
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
      await martin.close();
    }
  });
});
