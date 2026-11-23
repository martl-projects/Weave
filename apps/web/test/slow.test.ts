import { afterEach, describe, expect, it, vi } from 'vitest';
import { called, measure } from '../src/slow.ts';

afterEach(() => vi.restoreAllMocks());

describe('what keeps the node busy in a page', () => {
  it('names a call that took long, and says nothing of a quick one', async () => {
    const said = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let at = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => at);
    expect(await called('status', async () => 'fine')).toBe('fine');
    expect(said).not.toHaveBeenCalled();
    // 800 ms before it first waits, 3 s in all.
    const answer = await called('boardView', () => {
      at += 800;
      return Promise.resolve().then(() => ((at += 2200), 'view'));
    });
    expect(answer).toBe('view');
    expect(said).toHaveBeenCalledWith('weave: boardView took 3000 ms (800 ms before it first waited)');
    // A call that fails is named too, and fails as before.
    await expect(called('boards', async () => ((at += 5000), Promise.reject(new Error('no'))))).rejects.toThrow('no');
    expect(said).toHaveBeenLastCalledWith(expect.stringMatching(/^weave: boards took 5000 ms/));
  });

  it('measures a method without changing what it does', () => {
    const replica = { taken: 0, ingest(n: number) { return (this.taken += n); } };
    measure(replica, 'ingest', 'events taken in');
    expect(replica.ingest(2)).toBe(2);
    expect(replica.ingest(3)).toBe(5);
  });
});
