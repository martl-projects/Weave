import type { Json } from './bytes.ts';
import type { WeaveEvent } from './events.ts';
import type { Did } from './keys.ts';

/*
 * Working together inside a group (or in public). All of these are ordinary
 * events — sealed when they belong to a group — and every client derives the
 * same threads, issues and vote results from them.
 *
 *   weave.thread        {title, text}                     start a discussion
 *   weave.reply         {target, text}                    reply to a thread, issue or proposal
 *   weave.msg           {text}                            chat message
 *   weave.issue         {title, text, labels}             open an issue
 *   weave.issue.claim   {issue}                           take it on (the signer — person or agent — is the assignee)
 *   weave.issue.status  {issue, status}                   open | in-progress | done | closed
 *   weave.proposal      {title, text, deadline, quorum}   put something to a vote
 *   weave.vote          {proposal, choice}                yes | no | abstain; latest before the deadline counts
 *   weave.vote.delegate {to}                              my vote in this group follows `to` unless I vote myself
 */
export const KIND_THREAD = 'weave.thread';
export const KIND_REPLY = 'weave.reply';
export const KIND_MSG = 'weave.msg';
export const KIND_ISSUE = 'weave.issue';
export const KIND_ISSUE_CLAIM = 'weave.issue.claim';
export const KIND_ISSUE_STATUS = 'weave.issue.status';
export const KIND_PROPOSAL = 'weave.proposal';
export const KIND_VOTE = 'weave.vote';
export const KIND_VOTE_DELEGATE = 'weave.vote.delegate';

export const ISSUE_STATUSES = ['open', 'in-progress', 'done', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const CHOICES = ['yes', 'no', 'abstain'] as const;
export type Choice = (typeof CHOICES)[number];

/** A readable event: its id, the signed event and its (decrypted) kind and body. */
export interface Entry {
  id: string;
  event: WeaveEvent;
  kind: string;
  body: Json;
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
const str = (body: Json, key: string, max = 10_000): string => {
  const value = field(body, key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};
const byTime = (a: Entry, b: Entry) => a.event.time.localeCompare(b.event.time) || a.event.signer.localeCompare(b.event.signer) || a.event.seq - b.event.seq;

export interface Reply {
  id: string;
  author: Did;
  signer: Did;
  text: string;
  time: string;
}

export interface Thread {
  id: string;
  author: Did;
  signer: Did;
  title: string;
  text: string;
  time: string;
  replies: Reply[];
  /** Time of the latest reply, or of the thread itself. */
  active: string;
}

export interface Issue {
  id: string;
  author: Did;
  signer: Did;
  title: string;
  text: string;
  labels: string[];
  status: IssueStatus;
  /** Who claimed it last: the author and the key that signed (an agent, if one claimed it). */
  assignee?: { author: Did; signer: Did };
  time: string;
  replies: Reply[];
}

export interface Message {
  id: string;
  author: Did;
  signer: Did;
  text: string;
  time: string;
}

function repliesByTarget(entries: Entry[]): Map<string, Reply[]> {
  const map = new Map<string, Reply[]>();
  for (const e of entries.filter((x) => x.kind === KIND_REPLY).sort(byTime)) {
    const target = str(e.body, 'target', 200);
    const text = str(e.body, 'text');
    if (!target || !text) continue;
    const list = map.get(target) ?? [];
    list.push({ id: e.id, author: e.event.author, signer: e.event.signer, text, time: e.event.time });
    map.set(target, list);
  }
  return map;
}

/** Discussion threads, most recently active first. */
export function threadsOf(entries: Entry[]): Thread[] {
  const replies = repliesByTarget(entries);
  return entries
    .filter((e) => e.kind === KIND_THREAD && str(e.body, 'title'))
    .map((e) => {
      const r = replies.get(e.id) ?? [];
      return {
        id: e.id,
        author: e.event.author,
        signer: e.event.signer,
        title: str(e.body, 'title', 200),
        text: str(e.body, 'text'),
        time: e.event.time,
        replies: r,
        active: r.at(-1)?.time ?? e.event.time,
      };
    })
    .sort((a, b) => b.active.localeCompare(a.active));
}

/** Chat messages, oldest first. */
export function messagesOf(entries: Entry[]): Message[] {
  return entries
    .filter((e) => e.kind === KIND_MSG && str(e.body, 'text'))
    .sort(byTime)
    .map((e) => ({ id: e.id, author: e.event.author, signer: e.event.signer, text: str(e.body, 'text'), time: e.event.time }));
}

/**
 * Issues with their current status and assignee. Anyone in the group may
 * claim or change status; the latest event wins, and the history stays in the logs.
 */
export function issuesOf(entries: Entry[]): Issue[] {
  const replies = repliesByTarget(entries);
  const issues = new Map<string, Issue>();
  for (const e of entries.filter((x) => x.kind === KIND_ISSUE && str(x.body, 'title'))) {
    const labels = field(e.body, 'labels');
    issues.set(e.id, {
      id: e.id,
      author: e.event.author,
      signer: e.event.signer,
      title: str(e.body, 'title', 200),
      text: str(e.body, 'text'),
      labels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string').slice(0, 10) : [],
      status: 'open',
      time: e.event.time,
      replies: replies.get(e.id) ?? [],
    });
  }
  for (const e of entries.filter((x) => x.kind === KIND_ISSUE_CLAIM || x.kind === KIND_ISSUE_STATUS).sort(byTime)) {
    const issue = issues.get(str(e.body, 'issue', 200));
    if (!issue) continue;
    if (e.kind === KIND_ISSUE_CLAIM) {
      issue.assignee = { author: e.event.author, signer: e.event.signer };
      if (issue.status === 'open') issue.status = 'in-progress';
    } else {
      const status = str(e.body, 'status', 20) as IssueStatus;
      if (ISSUE_STATUSES.includes(status)) issue.status = status;
    }
  }
  return [...issues.values()].sort((a, b) => b.time.localeCompare(a.time));
}

export interface Tally {
  yes: number;
  no: number;
  abstain: number;
  /** Members whose vote counts, directly or through delegation. */
  voted: number;
  eligible: number;
  quorum: number;
  quorumReached: boolean;
  closed: boolean;
  /** Only meaningful once closed: quorum reached and more yes than no. */
  passed: boolean;
  /** How each member's vote was counted. */
  votes: Map<Did, { choice: Choice; via?: Did }>;
}

export interface Proposal {
  id: string;
  author: Did;
  signer: Did;
  title: string;
  text: string;
  deadline: string;
  time: string;
  tally: Tally;
  replies: Reply[];
}

/**
 * Votes counted per person (author), one vote each, whoever signed for them.
 * A member who didn't vote follows their delegation chain to the first member
 * who did; cycles and non-members count as not voting. Only members vote.
 */
export function tally(proposal: Entry, entries: Entry[], members: Set<Did>, now = new Date().toISOString()): Tally {
  const deadline = str(proposal.body, 'deadline', 40);
  const closed = deadline !== '' && now >= deadline;
  const direct = new Map<Did, Choice>();
  for (const e of entries.filter((x) => x.kind === KIND_VOTE && str(x.body, 'proposal', 200) === proposal.id).sort(byTime)) {
    const choice = str(e.body, 'choice', 10) as Choice;
    if (!CHOICES.includes(choice) || !members.has(e.event.author)) continue;
    if (deadline && e.event.time > deadline) continue;
    direct.set(e.event.author, choice);
  }
  const delegateTo = new Map<Did, Did>();
  for (const e of entries.filter((x) => x.kind === KIND_VOTE_DELEGATE).sort(byTime)) {
    if (deadline && e.event.time > deadline) continue;
    const to = field(e.body, 'to');
    if (typeof to === 'string' && to !== e.event.author) delegateTo.set(e.event.author, to as Did);
    else delegateTo.delete(e.event.author);
  }

  const votes = new Map<Did, { choice: Choice; via?: Did }>();
  for (const member of members) {
    const own = direct.get(member);
    if (own) {
      votes.set(member, { choice: own });
      continue;
    }
    const seen = new Set<Did>([member]);
    let next = delegateTo.get(member);
    while (next && !seen.has(next) && members.has(next)) {
      const choice = direct.get(next);
      if (choice) {
        votes.set(member, { choice, via: next });
        break;
      }
      seen.add(next);
      next = delegateTo.get(next);
    }
  }

  const count = (c: Choice) => [...votes.values()].filter((v) => v.choice === c).length;
  const requested = Number(field(proposal.body, 'quorum'));
  const quorum = Number.isInteger(requested) && requested > 0 ? Math.min(requested, members.size) : Math.ceil(members.size / 2);
  const t = { yes: count('yes'), no: count('no'), abstain: count('abstain'), voted: votes.size, eligible: members.size, quorum };
  const quorumReached = t.voted >= quorum;
  return { ...t, quorumReached, closed, passed: closed && quorumReached && t.yes > t.no, votes };
}

export function proposalsOf(entries: Entry[], members: Set<Did>, now?: string): Proposal[] {
  const replies = repliesByTarget(entries);
  return entries
    .filter((e) => e.kind === KIND_PROPOSAL && str(e.body, 'title'))
    .map((e) => ({
      id: e.id,
      author: e.event.author,
      signer: e.event.signer,
      title: str(e.body, 'title', 200),
      text: str(e.body, 'text'),
      deadline: str(e.body, 'deadline', 40),
      time: e.event.time,
      tally: tally(e, entries, members, now),
      replies: replies.get(e.id) ?? [],
    }))
    .sort((a, b) => b.time.localeCompare(a.time));
}
