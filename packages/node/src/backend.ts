import type { Choice, Did, IssueStatus, Json } from '@weave/core';
import type { Theme } from './theme.ts';

/** An event as shown to people and agents: decrypted where possible, with resolved names. */
export interface FeedItem {
  id: string;
  time: string;
  kind: string;
  scope: string;
  body: Json;
  author: Did;
  authorName?: string;
  signer: Did;
  /** Set when an agent or device signed for the author. */
  signerName?: string;
  seq: number;
  /** Set for events inside a group. */
  group?: { id: string; name: string };
  /** Set for events only you can read (private follows, blocks, mutes). */
  private?: true;
}

export interface AgentInfo {
  name: string;
  did: Did;
  permissions: string[];
}

export interface Whoami {
  did: Did;
  name?: string;
  agents: AgentInfo[];
}

export interface Status {
  did: Did;
  name?: string;
  online: boolean;
  topics: string[];
  groups: number;
  peers: number;
  logs: number;
  events: number;
  pending: number;
}

export interface PublishInput {
  kind: string;
  body?: Json;
  /** Group name or id; the event is encrypted for its members. */
  group?: string;
  /** Agent name to sign with instead of the root identity. */
  as?: string;
}

export interface FeedQuery {
  limit?: number;
  kinds?: string[];
  /** Group name or id: only that group's events. */
  group?: string;
  /** Only events by this person (name or did:key). */
  author?: string;
  /** Only public events. */
  publicOnly?: boolean;
}

export interface GroupInfo {
  id: string;
  name: string;
  founder: Did;
  founderName?: string;
  members: number;
  epoch: number;
}

export interface ReactionInfo {
  emoji: string;
  count: number;
  /** You (or one of your agents) reacted with this. */
  mine: boolean;
  /** Display names of who reacted, agents as "Martin · forge". */
  by: string[];
}

export interface ChannelInfo {
  name: string;
  topic: string;
  last?: string;
}

export interface MemberInfo {
  did: Did;
  name?: string;
  invitedBy?: Did;
  invitedByName?: string;
  since: string;
  /** Time of their latest event in the group. */
  lastActive?: string;
  /** Names of their agents seen acting in the group. */
  agents: string[];
}

export interface Person {
  did: Did;
  name?: string;
}

/** Someone's space as this node sees it. */
export interface Profile {
  did: Did;
  name?: string;
  theme: Theme;
  me: boolean;
  /** I follow them. */
  following: boolean;
  /** They follow me. */
  followsMe: boolean;
  blocked: boolean;
  muted: boolean;
  /** Number of public posts. */
  posts: number;
}

export interface ProfileInput {
  name?: string;
  theme?: Partial<Theme>;
}

/** Who did something: the person, and the agent if one acted for them. */
export interface Actor {
  did: Did;
  name?: string;
  agent?: string;
}

export interface ReplyInfo {
  id: string;
  by: Actor;
  text: string;
  time: string;
}

export interface ThreadInfo {
  id: string;
  /** First characters of the id; enough to refer to it in the CLI. */
  short: string;
  by: Actor;
  title: string;
  text: string;
  time: string;
  active: string;
  replies: ReplyInfo[];
}

export interface MessageInfo {
  id: string;
  short: string;
  by: Actor;
  text: string;
  time: string;
  channel: string;
  /** The message this one answers, if it is still known. */
  replyTo?: { id: string; by: Actor; text: string };
  reactions: ReactionInfo[];
}

export interface IssueInfo {
  id: string;
  short: string;
  by: Actor;
  title: string;
  text: string;
  labels: string[];
  status: IssueStatus;
  assignee?: Actor;
  time: string;
  replies: ReplyInfo[];
}

export interface ProposalInfo {
  id: string;
  short: string;
  by: Actor;
  title: string;
  text: string;
  deadline: string;
  time: string;
  yes: number;
  no: number;
  abstain: number;
  voted: number;
  eligible: number;
  quorum: number;
  quorumReached: boolean;
  closed: boolean;
  passed: boolean;
  /** How your vote counts: directly, or through the member you delegated to. */
  myVote?: { choice: Choice; via?: Actor };
  replies: ReplyInfo[];
}

/** Common to everything you can post into a group: the group, and optionally an agent to sign with. */
export interface InGroup {
  group: string;
  as?: string;
}

export interface Social {
  following: Person[];
  followers: Person[];
  friends: Person[];
  blocked: Person[];
  muted: Person[];
}

export type Edge = 'follow' | 'block' | 'mute';

export interface EdgeInput {
  edge: Edge;
  /** A did:key or a known profile name. */
  who: string;
  on: boolean;
  /** Seal the edge so only your own nodes can read it. Default: public for follow, private for block and mute. */
  private?: boolean;
}

/**
 * What the CLI (and later the desktop app) can do with a node. Implemented
 * locally by WeaveNode and remotely, over the daemon's HTTP API, by ApiClient.
 */
export interface Backend {
  whoami(): Promise<Whoami>;
  publish(input: PublishInput): Promise<FeedItem>;
  feed(query?: FeedQuery): Promise<FeedItem[]>;
  addAgent(name: string, permissions: string[]): Promise<AgentInfo>;
  join(topic: string): Promise<void>;
  status(): Promise<Status>;
  /** Calls `onItem` for every newly accepted event this node can read, until `signal` aborts. */
  watch(onItem: (item: FeedItem) => void, signal: AbortSignal): Promise<void>;

  createGroup(name: string): Promise<GroupInfo>;
  groups(): Promise<GroupInfo[]>;
  /** An invite link for a group, valid for `hours`. */
  invite(group: string, hours?: number): Promise<string>;
  joinGroup(invite: string): Promise<GroupInfo>;
  members(group: string): Promise<MemberInfo[]>;
  /** Founder only: remove a member and rotate the group key. */
  removeMember(group: string, who: string): Promise<void>;

  setEdge(input: EdgeInput): Promise<void>;
  social(): Promise<Social>;

  /** A person's space; defaults to your own. */
  profile(who?: string): Promise<Profile>;
  /** Update your name and/or theme. */
  setProfile(input: ProfileInput): Promise<Profile>;
  /** Everyone whose profile this node has seen, yourself excluded. */
  directory(): Promise<Profile[]>;

  threads(group: string): Promise<ThreadInfo[]>;
  startThread(input: InGroup & { title: string; text?: string }): Promise<ThreadInfo>;
  /** Reply to a thread, issue or proposal (full or short id); it lands in the same group. */
  reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo>;

  channels(group: string): Promise<ChannelInfo[]>;
  createChannel(input: InGroup & { name: string; topic?: string }): Promise<ChannelInfo>;
  messages(group: string, options?: { channel?: string; limit?: number }): Promise<MessageInfo[]>;
  say(input: InGroup & { text: string; channel?: string; replyTo?: string }): Promise<MessageInfo>;
  /** Add (or with on: false remove) an emoji reaction on a message, post, thread, reply, issue or proposal. */
  react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void>;

  issues(group: string): Promise<IssueInfo[]>;
  openIssue(input: InGroup & { title: string; text?: string; labels?: string[] }): Promise<IssueInfo>;
  claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo>;
  setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo>;

  proposals(group: string): Promise<ProposalInfo[]>;
  propose(input: InGroup & { title: string; text?: string; hours?: number; quorum?: number }): Promise<ProposalInfo>;
  vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo>;
  /** Let someone's votes in this group count for you when you don't vote; `who` undefined clears it. */
  delegateVote(input: { group: string; who?: string }): Promise<void>;
  /** Whose votes count for yours in this group, if anyone's. */
  votingDelegate(group: string): Promise<Actor | null>;
}
