import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { placeholderComponent, serviceFromRelease } from './helpers/release.ts';

/*
 * Visiting agents and services (block 2): a space decides what people's agents and services may do in it, not only
 * the person they act for. Those who manage the space set it: whose count (everyone's, approved ones, none) and
 * which kinds they may write. What the space doesn't let them do counts for nobody, and their own node refuses it.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-visitors-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

describe('visiting agents and services', () => {
  it("lets a space decide whose agents and services count in it, and what they may write", async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    await lena.addAgent('claude', ['weave.post', 'weave.msg']);
    await martl.addAgent('helper', ['weave.msg']);
    const bot = await serviceFromRelease(lena, { name: 'bot', manifest: { app: 'bot', name: 'Bot', service: { reads: 'addressed', writes: ['weave.msg'], version: '1.0' } }, component: placeholderComponent(), spaces: ['Weave'] });
    sync([martl, lena]);
    const texts = async (node: WeaveNode) => (await node.messages('Weave')).map((m) => m.text);

    // By default, everyone's agents act as their person lets them.
    expect((await martl.spaces()).find((s) => s.name === 'Weave')!.visitors).toEqual({ agents: { who: 'everyone' }, services: { who: 'everyone' }, approved: [] });
    await lena.say({ space: 'Weave', as: 'claude', text: 'claude was here' });
    sync([martl, lena]);
    expect(await texts(martl)).toContain('claude was here');

    // Only those who manage the space set its rules.
    await expect(lena.setVisitors({ space: 'Weave', agents: { who: 'nobody' } })).rejects.toThrow(/only those who manage Weave/);

    // Agents may only chat now: Lena's node refuses a post by claude, and says why.
    await martl.setVisitors({ space: 'Weave', agents: { who: 'everyone', kinds: ['weave.msg'] } });
    sync([martl, lena]);
    await expect(lena.submit({ space: 'Weave', title: 'A post by claude', as: 'claude' })).rejects.toThrow(/Weave doesn't let agents write weave.post \(only weave.msg\)/);
    await lena.say({ space: 'Weave', as: 'claude', text: 'still chatting' });

    // Approved agents only: claude's messages stop counting until martl approves it; martl's own helper isn't held to it.
    await martl.setVisitors({ space: 'Weave', agents: { who: 'approved', kinds: ['weave.msg'] } });
    sync([martl, lena]);
    await expect(lena.say({ space: 'Weave', as: 'claude', text: 'not approved yet' })).rejects.toThrow(/agent "claude" isn't approved in Weave[^]*approve-agent "Weave" Lena\/claude/);
    await martl.say({ space: 'Weave', as: 'helper', text: 'the maintainer’s helper' });
    await martl.approveAgent({ space: 'Weave', agent: 'Lena/claude' });
    sync([martl, lena]);
    await lena.say({ space: 'Weave', as: 'claude', text: 'approved now' });
    sync([martl, lena]);
    expect(await texts(martl)).toEqual(expect.arrayContaining(['still chatting', 'the maintainer’s helper', 'approved now']));
    expect((await martl.spaces()).find((s) => s.name === 'Weave')!.visitors?.approved).toEqual(['Lena/claude']);

    // A rule decides what counts for everyone reading, over the whole history: with agents off, what claude wrote
    // stops counting (nothing is deleted: a looser rule shows it again).
    await martl.setVisitors({ space: 'Weave', agents: { who: 'nobody' } });
    sync([martl, lena]);
    expect(await texts(martl)).not.toContain('approved now');
    await expect(lena.say({ space: 'Weave', as: 'claude', text: 'blocked' })).rejects.toThrow(/Weave doesn't let agents act in it/);
    expect((await lena.agentBlocked('claude')).map((s) => s.name)).toEqual(['Weave']);

    // Services have a rule of their own: approved only, and Lena's bot is approved by its name.
    await martl.setVisitors({ space: 'Weave', services: { who: 'approved' } });
    sync([martl, lena]);
    await expect(lena.say({ space: 'Weave', as: 'bot', text: 'from the bot' })).rejects.toThrow(/service "bot" isn't approved in Weave/);
    await martl.approveAgent({ space: 'Weave', agent: 'Lena/bot' });
    sync([martl, lena]);
    await lena.say({ space: 'Weave', as: 'bot', text: 'from the bot' });
    sync([martl, lena]);
    expect(await texts(martl)).toContain('from the bot');
    expect((await martl.spaces()).find((s) => s.name === 'Weave')!.visitors).toMatchObject({ agents: { who: 'nobody' }, services: { who: 'approved' }, approved: ['Lena/claude', 'Lena/bot'] });
    expect(bot.name).toBe('bot');

    // Loosened again, what claude wrote counts again: nothing was deleted.
    await martl.setVisitors({ space: 'Weave', agents: { who: 'everyone' } });
    sync([martl, lena]);
    expect(await texts(martl)).toEqual(expect.arrayContaining(['claude was here', 'still chatting', 'approved now']));
  });
});
