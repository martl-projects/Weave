import type { Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';

/*
 * GitHub repositories that follow a space's membership. An owner links a
 * repository to a group, tier or project (optionally to one board of a
 * project: then whoever may read that board); members who share their GitHub
 * account get read access, and lose it again when they leave. The owner's
 * node does the inviting, with the owner's own GitHub sign-in.
 *
 *   weave.github.repo     {repo, board?, access?, writers?, on}
 *                         sealed in the space, by an owner or maintainer: the repo follows this
 *                         space; its author's node keeps it in step. access: read (the default:
 *                         members get read access, an organization's repositories only), none (just
 *                         linked, nobody gets anything), write (the people named in writers, picked
 *                         one by one, never through a group: a person's repositories only have
 *                         collaborators who can write)
 *   weave.github.account  {login, on}          sealed in the space, by a member: "give my
 *                         GitHub account access" (one personal account each, never a team)
 *   weave.github.added    {repo, login, on}    sealed to the owner: who Weave gave access, so it
 *                         only ever takes away what it gave
 *   weave.github.public   {login, gist}        public: a GitHub account shown on the hub, proven
 *                         by a gist of that account naming the person's did
 */
export const KIND_GITHUB_REPO = 'weave.github.repo';
export const KIND_GITHUB_ACCOUNT = 'weave.github.account';
export const KIND_GITHUB_ADDED = 'weave.github.added';
export const KIND_GITHUB_PUBLIC = 'weave.github.public';

/** owner/name, as GitHub allows them. */
export const isRepoName = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(value) && !value.endsWith('/.') && !value.endsWith('/..');

/** A GitHub username: letters, digits and single inner hyphens, at most 39. */
export const isLogin = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value);

/** What linking a repository gives people: read access for members, nothing, or write access for people picked one by one. */
export type RepoAccess = 'read' | 'none' | 'write';
export const REPO_ACCESS: readonly RepoAccess[] = ['read', 'none', 'write'];

/** The most writers one link names. */
export const MAX_WRITERS = 50;

export interface RepoLink {
  repo: string;
  /** Only people who may read this board of the project. */
  board?: string;
  access: RepoAccess;
  /** With write access: the people picked, one by one. */
  writers?: Did[];
  /** Who linked it: their node invites and removes people. */
  by: Did;
  time: string;
}

const bodyOf = (entry: Entry): Record<string, unknown> => (entry.body && typeof entry.body === 'object' && !Array.isArray(entry.body) ? (entry.body as Record<string, unknown>) : {});

/** The repositories linked to a space: the latest word per repo from someone who may manage it, unlinked ones dropped. */
export function reposOf(entries: Entry[], mayManage: (did: Did) => boolean): RepoLink[] {
  const latest = new Map<string, RepoLink | null>();
  for (const entry of entries) {
    if (entry.kind !== KIND_GITHUB_REPO || !mayManage(entry.event.author)) continue;
    const body = bodyOf(entry);
    if (!isRepoName(body.repo)) continue;
    const key = body.repo.toLowerCase();
    if (body.on === false) {
      latest.set(key, null);
      continue;
    }
    const board = typeof body.board === 'string' && body.board ? body.board.slice(0, 60) : undefined;
    // Links from before access existed give read access.
    const access: RepoAccess = body.access === 'none' || body.access === 'write' ? body.access : 'read';
    const writers = access === 'write' && Array.isArray(body.writers) ? [...new Set(body.writers.filter(isDid))].slice(0, MAX_WRITERS) : undefined;
    latest.set(key, { repo: body.repo, ...(board ? { board } : {}), access, ...(writers ? { writers } : {}), by: entry.event.author, time: entry.event.time });
  }
  return [...latest.values()].filter((l): l is RepoLink => !!l).sort((a, b) => a.repo.localeCompare(b.repo));
}

/** The GitHub accounts members shared in a space (the latest word of each member). */
export function accountsOf(entries: Entry[]): Map<Did, string> {
  const out = new Map<Did, string>();
  for (const entry of entries) {
    if (entry.kind !== KIND_GITHUB_ACCOUNT) continue;
    const body = bodyOf(entry);
    if (body.on === false) out.delete(entry.event.author);
    else if (isLogin(body.login)) out.set(entry.event.author, body.login);
  }
  return out;
}

export interface RepoCollaborators {
  /** People with access now (lowercase logins). */
  collaborators: Set<string>;
  /** Invited and not accepted yet: login → invitation id. */
  invited: Map<string, number>;
}

export interface SyncPlan {
  invite: string[];
  /** Taken away again: only people Weave added. `invitation` when they never accepted. */
  remove: Array<{ login: string; invitation?: number }>;
}

/**
 * What to change on GitHub so a repo matches the space: invite who should be
 * in and isn't (or isn't invited yet), and take away access Weave gave to
 * people who shouldn't have it any more. People added on GitHub by hand stay.
 * `added`: the logins Weave gave access and hasn't taken it back from.
 */
export function planSync(wanted: Iterable<string>, access: RepoCollaborators, added: Iterable<string>): SyncPlan {
  const want = new Set([...wanted].map((l) => l.toLowerCase()));
  const gave = new Set([...added].map((l) => l.toLowerCase()));
  // Someone Weave invited who isn't in (or invited) any more declined or left on GitHub: not asked again.
  const invite = [...want].filter((l) => !access.collaborators.has(l) && !access.invited.has(l) && !gave.has(l)).sort();
  const remove = [...gave]
    .filter((l) => !want.has(l) && (access.collaborators.has(l) || access.invited.has(l)))
    .sort()
    .map((login) => (access.invited.has(login) ? { login, invitation: access.invited.get(login)! } : { login }));
  return { invite, remove };
}

/** The text of a hub proof gist: anyone can check the gist's owner wrote it for this did. */
export const githubProofText = (did: Did, login: string): string => `I am ${login} on GitHub and ${did} on Weave.\n`;
