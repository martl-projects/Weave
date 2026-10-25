import { describe, expect, it } from 'vitest';
import { createIdentity, mayAct, type Did, type SpaceAction, type SpaceKind, type SpaceState } from '../src/index.ts';

/* Who may do what in a space: one table, from authz.ts (W3wTw_-7). */

const [owner, maintainer, member, outsider] = [createIdentity(), createIdentity(), createIdentity(), createIdentity()].map((i) => i.did as Did);

function state(kind: SpaceKind, tier = false): SpaceState {
  const members = new Map([owner, maintainer, member].map((did) => [did, { did, since: '' }]));
  return { kind, founder: owner, members, removed: new Map(), maintainers: new Set(kind === 'group' ? [owner] : [owner, maintainer]), groups: new Map(), declined: new Map(), left: new Set(), ...(tier ? { tier: true as const } : {}) };
}

const ACTIONS: SpaceAction[] = ['invite', 'admit', 'remove', 'manage', 'promote', 'group', 'curate', 'own'];
const who = { owner, maintainer, member, outsider };
const table = (s: SpaceState) => Object.fromEntries(ACTIONS.map((a) => [a, Object.entries(who).filter(([, did]) => mayAct(s, did, a).ok).map(([name]) => name)]));

describe('mayAct', () => {
  it('projects: maintainers do it all but owning; members nothing', () => {
    expect(table(state('project'))).toEqual({ invite: ['owner', 'maintainer'], admit: ['owner', 'maintainer'], remove: ['owner', 'maintainer'], manage: ['owner', 'maintainer'], promote: ['owner', 'maintainer'], group: ['owner', 'maintainer'], curate: ['owner', 'maintainer'], own: ['owner'] });
  });

  it('communities: any member invites; moderators manage; no groups as a whole, no direct admits', () => {
    expect(table(state('community'))).toEqual({ invite: ['owner', 'maintainer', 'member'], admit: [], remove: ['owner', 'maintainer'], manage: ['owner', 'maintainer'], promote: ['owner', 'maintainer'], group: [], curate: ['owner', 'maintainer'], own: ['owner'] });
  });

  it('groups: any member invites; the owner does the rest; tiers: only their creator lets people in', () => {
    expect(table(state('group'))).toEqual({ invite: ['owner', 'maintainer', 'member'], admit: ['owner'], remove: ['owner'], manage: ['owner'], promote: [], group: [], curate: ['owner'], own: ['owner'] });
    expect(table(state('group', true)).invite).toEqual(['owner']);
    expect(table(state('group', true)).admit).toEqual([]);
  });

  it('direct chats: nobody, with a reason', () => {
    expect(Object.values(table(state('direct'))).every((list) => list.length === 0)).toBe(true);
    expect(mayAct(state('direct'), owner, 'manage')).toMatchObject({ ok: false, reason: expect.stringMatching(/direct chat/) });
  });
});
