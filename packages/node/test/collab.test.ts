import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'weave-collab-'));
  dirs.push(dir);
  const node = WeaveNode.init('Martin', dir);
  await node.createGroup('Weave');
  await node.addAgent('forge', ['weave.reply', 'weave.msg', 'weave.issue.*']);
  return node;
}

describe('working together in a group', () => {
  it('runs threads with replies, by short id, from people and agents', async () => {
    const node = await setup();
    const thread = await node.startThread({ group: 'Weave', title: 'Should we use Hypercore?', text: 'For the logs' });
    await node.reply({ target: thread.short, text: 'Leaning yes' });
    await node.reply({ target: thread.id, text: 'Benchmarks look good', as: 'forge' });

    const [t] = await node.threads('Weave');
    expect(t.replies.map((r) => [r.by.name, r.by.agent, r.text])).toEqual([
      ['Martin', undefined, 'Leaning yes'],
      ['Martin', 'forge', 'Benchmarks look good'],
    ]);
    await expect(node.reply({ target: 'abc', text: 'x' })).rejects.toThrow(/at least 6/);
  });

  it('keeps a chat', async () => {
    const node = await setup();
    await node.say({ group: 'Weave', text: 'morning!' });
    await node.say({ group: 'Weave', text: 'build is green', as: 'forge' });
    expect((await node.messages('Weave')).map((m) => m.text)).toEqual(['morning!', 'build is green']);
  });

  it('tracks issues claimed and finished by an agent', async () => {
    const node = await setup();
    const issue = await node.openIssue({ group: 'Weave', title: 'Encrypt keys at rest', labels: ['security'] });
    expect(issue.status).toBe('open');
    const claimed = await node.claimIssue({ issue: issue.short, as: 'forge' });
    expect(claimed).toMatchObject({ status: 'in-progress', assignee: { name: 'Martin', agent: 'forge' } });
    const done = await node.setIssueStatus({ issue: issue.id, status: 'done', as: 'forge' });
    expect(done.status).toBe('done');
  });

  it('shows your own group events right after joining offline, before membership has synced', async () => {
    const founder = await setup();
    const dir = mkdtempSync(join(tmpdir(), 'weave-collab-'));
    dirs.push(dir);
    const joiner = WeaveNode.init('Lena', dir);
    await joiner.joinGroup(await founder.invite('Weave'));
    const issue = await joiner.openIssue({ group: 'Weave', title: 'Written offline' });
    expect(issue.title).toBe('Written offline');
    expect((await joiner.feed({ group: 'Weave', kinds: ['weave.issue'] })).length).toBe(1);
  });

  it('votes on proposals, and agents without the permission cannot', async () => {
    const node = await setup();
    const proposal = await node.propose({ group: 'Weave', title: 'Ship M5', hours: 1 });
    expect(proposal).toMatchObject({ eligible: 1, quorum: 1, voted: 0, closed: false });
    const after = await node.vote({ proposal: proposal.short, choice: 'yes' });
    expect(after).toMatchObject({ yes: 1, quorumReached: true, myVote: { choice: 'yes' } });
    await expect(node.vote({ proposal: proposal.id, choice: 'no', as: 'forge' })).rejects.toThrow(/may not sign weave.vote/);
  });
});
