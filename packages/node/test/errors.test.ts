import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { errorToWire, WeaveError } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { startApi, type ApiServer } from '../src/api.ts';
import { ApiClient } from '../src/client.ts';

/*
 * The daemon's named errors (docs/localization.md, "Texts the daemon writes"): a WeaveError
 * crosses the local API as {error, name, values} and is a WeaveError again in the client, so
 * a screen shows it in the reader's language and a terminal prints the English message.
 */

const dirs: string[] = [];
const servers: ApiServer[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

async function running(): Promise<{ node: WeaveNode; api: ApiServer; client: ApiClient }> {
  const dir = mkdtempSync(join(tmpdir(), 'weave-errors-'));
  dirs.push(dir);
  const node = WeaveNode.init('martl', dir);
  const api = await startApi(node);
  servers.push(api);
  return { node, api, client: new ApiClient(api.port, api.token) };
}

describe('named errors over the API', () => {
  it('answers a WeaveError with its message, name and values, and the client throws it as a WeaveError again', async () => {
    const { api, client } = await running();
    const res = await fetch(`http://127.0.0.1:${api.port}/v1/rpc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${api.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'post', args: ['zzzzzz'] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no post found with id zzzzzz', name: 'daemon.post.not.found', values: { id: 'zzzzzz' } });

    const error = await client.post('zzzzzz').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WeaveError);
    expect((error as WeaveError).message).toBe('no post found with id zzzzzz');
    expect((error as WeaveError).text).toEqual({ name: 'daemon.post.not.found', values: { id: 'zzzzzz' } });
  });

  it('answers a plain error with its message only, and the client throws a plain Error', async () => {
    const { api, client } = await running();
    const res = await fetch(`http://127.0.0.1:${api.port}/v1/rpc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${api.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'invite', args: ['no-such-space'] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
    expect(body).not.toHaveProperty('name');

    const error = await client.invite('no-such-space').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WeaveError);
  });

  it('names what screens show on purpose: a permission refusal carries the space, an agent refusal the agent and kind', async () => {
    const { node } = await running();
    await node.createProject({ name: 'Weave' });
    await node.addAgent('claude', ['weave.reply']);
    const refused = await node.publish({ kind: 'weave.post', body: { title: 'x' }, space: 'Weave', as: 'claude' } as never).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(WeaveError);
    expect((refused as WeaveError).text).toEqual({ name: 'daemon.agent.may.not.sign', values: { agent: 'claude', kind: 'weave.post' } });
    expect(errorToWire(refused)).toMatchObject({ name: 'daemon.agent.may.not.sign', values: { agent: 'claude', kind: 'weave.post' } });

    const closed = await node.closeSpace({ space: 'Weave', closed: true }).then(
      () => node.say({ space: 'Weave', text: 'hi' }),
      (e: unknown) => e,
    ).catch((e: unknown) => e);
    expect(closed).toBeInstanceOf(WeaveError);
    expect((closed as WeaveError).text.name).toMatch(/^daemon\./);
  });

  it('a WeaveError without values carries only its name', () => {
    expect(new WeaveError('daemon.post.title', undefined, 'a post needs a title').text).toEqual({ name: 'daemon.post.title' });
    expect(new WeaveError('daemon.post.title', {}, 'a post needs a title').text).toEqual({ name: 'daemon.post.title' });
    expect(errorToWire(new Error('plain'))).toEqual({ error: 'plain' });
  });
});
