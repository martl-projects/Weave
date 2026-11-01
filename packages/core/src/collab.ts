import { TEXT_LIMITS } from './limits.ts';
import type { Json } from './bytes.ts';
import type { EventView } from './records.ts';
import type { Did } from './keys.ts';
import { attachmentOf, type Attachment } from './blobs.ts';

/*
 * Working together inside a group (or in public). All of these are ordinary
 * events — sealed when they belong to a group — and every client derives the
 * same threads, issues and vote results from them.
 *
 *   weave.thread        {title, text}                     start a discussion
 *   weave.reply         {target, text}                    reply to a thread, issue or proposal
 *   weave.msg           {text, channel, post, replyTo, file}  chat message in a channel (default "general") or in a post's chat, optionally replying to one;
 *                                                         file {ref, name, size, type}: a file or image attached (its blob by wblob: reference); text may be empty then;
 *                                                         weave.post.delete {target} takes it down too (its author, or the space's maintainers or moderators)
 *   weave.channel       {name, topic}                     create a chat channel
 *   weave.react         {target, emoji, on}               add or remove an emoji reaction on any event
 *   weave.issue         {title, text, labels}             open an issue
 *   weave.issue.claim   {issue}                           take it on (the signer — person or agent — is the assignee)
 *   weave.issue.status  {issue, status}                   open | in-progress | done | closed
 *   weave.proposal      {title, text, deadline, quorum}   put something to a vote
 *   weave.vote          {proposal, choice}                yes | no | abstain; latest before the deadline counts
 *   weave.proposal.close {proposal, upTo}                 by its proposer, after the deadline: the last number of each
 *                                                         voting key that counts. Votes are dated by their authors, so
 *                                                         once closed only these count, whatever date a later one claims
 *   weave.vote.delegate {to}                              my vote in this group follows `to` unless I vote myself
 */
export const KIND_THREAD = 'weave.thread';
export const KIND_REPLY = 'weave.reply';
export const KIND_MSG = 'weave.msg';
export const KIND_CHANNEL = 'weave.channel';
export const KIND_REACT = 'weave.react';
export const DEFAULT_CHANNEL = 'general';
/** The same delete as a post's (posts.ts), here for chat messages. */
const KIND_DELETE = 'weave.post.delete';
export const KIND_ISSUE = 'weave.issue';
export const KIND_ISSUE_CLAIM = 'weave.issue.claim';
export const KIND_ISSUE_STATUS = 'weave.issue.status';
export const KIND_PROPOSAL = 'weave.proposal';
export const KIND_VOTE = 'weave.vote';
export const KIND_VOTE_DELEGATE = 'weave.vote.delegate';
export const KIND_PROPOSAL_CLOSE = 'weave.proposal.close';

export const ISSUE_STATUSES = ['open', 'in-progress', 'done', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const CHOICES = ['yes', 'no', 'abstain'] as const;
export type Choice = (typeof CHOICES)[number];

/** A readable event: its id, the signed event and its (decrypted) kind and body. */
export interface Entry {
  id: string;
  event: EventView;
  kind: string;
  body: Json;
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);
const str = (body: Json, key: string, max: number = TEXT_LIMITS.text): string => {
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

export interface Reaction {
  emoji: string;
  /** Who reacted: the signing key (so an agent's reaction is its own) and the person it belongs to. */
  by: Array<{ author: Did; signer: Did }>;
}

export interface Message {
  id: string;
  author: Did;
  signer: Did;
  text: string;
  time: string;
  channel: string;
  /** Set for messages in a post's chat; they belong to no channel. */
  post?: string;
  replyTo?: string;
  reactions: Reaction[];
  /** It announces something live in the project: a website opened, a version offered (by its id there). */
  announce?: Announce;
  /** A file or image attached: its blob and what the message says about it. */
  file?: Attachment;
}

/** What a message announces: a website (its id, or the service hosting it) or a released version (its artifact id). */
export interface Announce {
  kind: 'website' | 'release';
  id: string;
}

const announceOf = (body: Json): Announce | undefined => {
  const a = field(body, 'announce') as Record<string, unknown> | undefined;
  return a && (a.kind === 'website' || a.kind === 'release') && typeof a.id === 'string' && a.id.length <= 200 ? { kind: a.kind, id: a.id } : undefined;
};

export interface Channel {
  name: string;
  topic: string;
  /** Time of the latest message, if any. */
  last?: string;
}

/** Channel names are short, lowercase words with dashes: "general", "build-log". */
export function channelName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().toLowerCase().replace(/^#/, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 32);
  return name || undefined;
}

const MAX_EMOJI_LENGTH = 16;

/**
 * Reactions per target, latest event per (signer, target, emoji) wins. Keyed by
 * signer, so an agent reacting is told apart from the person it acts for.
 */
export function reactionsOf(entries: Entry[]): Map<string, Reaction[]> {
  const state = new Map<string, Map<string, Map<Did, Did>>>(); // target → emoji → signer → author
  for (const e of entries.filter((x) => x.kind === KIND_REACT).sort(byTime)) {
    const target = str(e.body, 'target', 200);
    const emoji = str(e.body, 'emoji', MAX_EMOJI_LENGTH);
    if (!target || !emoji) continue;
    const byEmoji = state.get(target) ?? new Map<string, Map<Did, Did>>();
    const who = byEmoji.get(emoji) ?? new Map<Did, Did>();
    if (field(e.body, 'on') === false) who.delete(e.event.signer);
    else who.set(e.event.signer, e.event.author);
    byEmoji.set(emoji, who);
    state.set(target, byEmoji);
  }
  const out = new Map<string, Reaction[]>();
  for (const [target, byEmoji] of state) {
    const reactions = [...byEmoji]
      .filter(([, who]) => who.size > 0)
      .map(([emoji, who]) => ({ emoji, by: [...who].map(([signer, author]) => ({ author, signer })) }));
    if (reactions.length) out.set(target, reactions);
  }
  return out;
}

/** Channels: "general" first, then the others by name. A channel exists once created or used. */
export function channelsOf(entries: Entry[]): Channel[] {
  const channels = new Map<string, Channel>([[DEFAULT_CHANNEL, { name: DEFAULT_CHANNEL, topic: '' }]]);
  for (const e of entries.filter((x) => x.kind === KIND_CHANNEL).sort(byTime)) {
    const name = channelName(field(e.body, 'name'));
    if (name && !channels.has(name)) channels.set(name, { name, topic: str(e.body, 'topic', 200) });
  }
  for (const e of entries.filter((x) => x.kind === KIND_MSG && !str(x.body, 'post', 200))) {
    const name = channelName(field(e.body, 'channel')) ?? DEFAULT_CHANNEL;
    const channel = channels.get(name) ?? { name, topic: '' };
    if (!channel.last || e.event.time > channel.last) channel.last = e.event.time;
    channels.set(name, channel);
  }
  return [...channels.values()].sort((a, b) => (a.name === DEFAULT_CHANNEL ? -1 : b.name === DEFAULT_CHANNEL ? 1 : a.name.localeCompare(b.name)));
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

/** Chat messages taken down: by their author, or by the space's maintainers or moderators. */
export function deletedMessages(entries: Entry[], maintainers: ReadonlySet<Did> = new Set()): Set<string> {
  const authors = new Map(entries.filter((e) => e.kind === KIND_MSG || e.kind === KIND_REPLY).map((e) => [e.id, e.event.author]));
  const deleted = new Set<string>();
  for (const e of entries.filter((x) => x.kind === KIND_DELETE)) {
    const target = str(e.body, 'target', 200);
    const author = authors.get(target);
    if (author && (author === e.event.author || maintainers.has(e.event.author))) deleted.add(target);
  }
  return deleted;
}

/**
 * Chat messages, oldest first: in one channel, or in one post's chat. Replies
 * (weave.reply, from before posts had chats) show up in their target's chat.
 * Those taken down (see deletedMessages) are left out.
 */
export function messagesOf(entries: Entry[], where: { channel?: string; post?: string } = {}, maintainers: ReadonlySet<Did> = new Set()): Message[] {
  const reactions = reactionsOf(entries);
  const deleted = deletedMessages(entries, maintainers);
  return entries
    .filter((e) => (e.kind === KIND_MSG || e.kind === KIND_REPLY) && (str(e.body, 'text') || (e.kind === KIND_MSG && attachmentOf(e.body))) && !deleted.has(e.id))
    .map((e) => {
      const replyTo = str(e.body, 'replyTo', 200);
      const post = str(e.body, e.kind === KIND_REPLY ? 'target' : 'post', 200);
      const announce = e.kind === KIND_MSG ? announceOf(e.body) : undefined;
      const file = e.kind === KIND_MSG ? attachmentOf(e.body) : undefined;
      return {
        ...(announce ? { announce } : {}),
        ...(file ? { file } : {}),
        id: e.id,
        author: e.event.author,
        signer: e.event.signer,
        text: str(e.body, 'text'),
        time: e.event.time,
        channel: channelName(field(e.body, 'channel')) ?? DEFAULT_CHANNEL,
        ...(post ? { post } : {}),
        ...(replyTo ? { replyTo } : {}),
        reactions: reactions.get(e.id) ?? [],
        _sort: e,
      };
    })
    .filter((m) => (where.post ? m.post === where.post : !m.post && (!where.channel || m.channel === where.channel)))
    .sort((a, b) => byTime(a._sort, b._sort))
    .map(({ _sort, ...message }) => message);
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
  // Closed by its proposer: what counts is what they counted, by number; until then, by the date votes claim.
  const close = entries.find((x) => x.kind === KIND_PROPOSAL_CLOSE && str(x.body, 'proposal', 200) === proposal.id && x.event.author === proposal.event.author);
  const upTo = close ? new Map(Object.entries((field(close.body, 'upTo') ?? {}) as Record<string, unknown>).filter((e): e is [string, number] => Number.isSafeInteger(e[1]))) : undefined;
  const counts = (e: Entry) => (upTo ? (upTo.get(e.event.signer) ?? -1) >= e.event.seq : !(deadline && e.event.time > deadline));
  const direct = new Map<Did, Choice>();
  for (const e of entries.filter((x) => x.kind === KIND_VOTE && str(x.body, 'proposal', 200) === proposal.id).sort(byTime)) {
    const choice = str(e.body, 'choice', 10) as Choice;
    if (!CHOICES.includes(choice) || !members.has(e.event.author)) continue;
    if (!counts(e)) continue;
    direct.set(e.event.author, choice);
  }
  const delegateTo = new Map<Did, Did>();
  for (const e of entries.filter((x) => x.kind === KIND_VOTE_DELEGATE).sort(byTime)) {
    if (!counts(e)) continue;
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

/** `members`: who may vote, for all proposals or per proposal (e.g. the writers of its board). */
/** What a proposal's close names (upTo): per key that voted on it or delegated, the last number held now. */
export function closingUpTo(proposal: Entry, entries: Entry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const relevant = (e.kind === KIND_VOTE && str(e.body, 'proposal', 200) === proposal.id) || e.kind === KIND_VOTE_DELEGATE;
    if (relevant && e.event.seq > (out[e.event.signer] ?? -1)) out[e.event.signer] = e.event.seq;
  }
  return out;
}

export function proposalsOf(entries: Entry[], members: Set<Did> | ((proposal: Entry) => Set<Did>), now?: string): Proposal[] {
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
      tally: tally(e, entries, typeof members === 'function' ? members(e) : members, now),
      replies: replies.get(e.id) ?? [],
    }))
    .sort((a, b) => b.time.localeCompare(a.time));
}
