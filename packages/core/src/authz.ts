import type { Did } from './keys.ts';
import type { EventView } from './records.ts';
import { isPast, type SpaceState } from './spaces.ts';

/*
 * Who may do what in a space: decided here, and nowhere else (W3wTw_-7). The
 * reducer (spaceState) asks this for every event it folds, and node code asks
 * it before acting and when judging others' events. A new kind of event names
 * the action it needs instead of growing its own role check.
 *
 * Actions:
 * - invite:  make an invite link. Projects: maintainers. Tiers: their creator. Groups and communities: any member.
 * - admit:   let someone in directly. Projects: maintainers. Groups (not tiers): their owner (a company putting its people in).
 * - remove:  remove a member. Groups: the owner. Projects: maintainers. Communities: moderators.
 * - manage:  rotate keys, shred, close, set history, approve agents: as remove.
 * - promote: make or unmake a maintainer (projects) or moderator (communities): maintainers, moderators.
 * - group:   invite a group as a whole, set its rule, turn its newcomers away: project maintainers.
 * - curate:  board rules, others' posts, the page, releases: maintainers or moderators, and the owner.
 * - own:     hand over, put on hold, put under a key service, grant a tier: the owner.
 *
 * A direct chat has nobody who manages it: there, nobody may do any of these.
 */
export type SpaceAction = 'invite' | 'admit' | 'remove' | 'manage' | 'promote' | 'group' | 'curate' | 'own';

export type Decision = { ok: true } | { ok: false; reason: string };

const yes: Decision = { ok: true };
const no = (reason: string): Decision => ({ ok: false, reason });

const managers = (state: SpaceState) => ({ project: 'maintainers', community: 'moderators', group: 'owner', direct: 'nobody' })[state.kind];

/** May this person do this in the space, as its state stands? */
export function mayAct(state: SpaceState, did: Did, action: SpaceAction): Decision {
  if (state.kind === 'direct') return no('a direct chat is between two people: nobody manages it');
  const owner = did === state.founder;
  const maintainer = state.maintainers.has(did);
  switch (action) {
    case 'invite':
      if (state.kind === 'project') return maintainer ? yes : no('only maintainers invite people into a project');
      if (state.tier) return owner ? yes : no('only its creator lets people into a tier');
      return state.members.has(did) ? yes : no('only members invite people');
    case 'admit':
      if (state.kind === 'project') return maintainer ? yes : no('only maintainers let people into a project');
      if (state.kind === 'group' && !state.tier) return owner ? yes : no("only a group's owner lets people in directly");
      return no(`nobody lets people into a ${state.tier ? 'tier' : state.kind} directly`);
    case 'remove':
    case 'manage':
      if (state.kind === 'group') return owner ? yes : no(`only the group's owner ${action === 'remove' ? 'removes members' : 'does that'}`);
      return maintainer ? yes : no(`only the ${managers(state)} ${action === 'remove' ? 'remove people' : 'do that'}`);
    case 'promote':
      if (state.kind === 'group') return no('a group has only its owner to manage it');
      return maintainer ? yes : no(`only the ${managers(state)} choose the ${managers(state)}`);
    case 'group':
      if (state.kind !== 'project') return no('only projects invite whole groups');
      return maintainer ? yes : no("only maintainers decide about a project's groups");
    case 'curate':
      return maintainer || owner ? yes : no(`only the ${managers(state)} do that`);
    case 'own':
      return owner ? yes : no('only the owner does that');
  }
}

/**
 * May an event's author have done this when they did, judged causally: as the
 * state stands, or, for someone who lost the role later, by whether the event
 * comes before that loss (within its cutoff, not past it). Their rekey from
 * before a demotion counts; one numbered past it doesn't.
 */
export function mayActAt(state: SpaceState, event: Pick<EventView, 'author' | 'signer' | 'seq' | 'cseq' | 'cs'>, action: SpaceAction): Decision {
  const now = mayAct(state, event.author, action);
  if (now.ok) return now;
  if ((action === 'manage' || action === 'remove') && state.cutoffs?.some((c) => c.managed && c.signer === event.signer && !isPast(c, event))) return yes;
  return now;
}

/** May this person remove members and rotate keys? (mayAct 'manage', for callers from before it.) */
export const canManage = (state: SpaceState, did: Did): boolean => mayAct(state, did, 'manage').ok;

/** Does a rekey count? Judged by when it was made (mayActAt 'manage'). */
export const rekeyCounts = (state: SpaceState, event: Pick<EventView, 'author' | 'signer' | 'seq' | 'cseq' | 'cs'>): boolean => mayActAt(state, event, 'manage').ok;
