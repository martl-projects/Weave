import type { Choice, Did, IssueStatus, Json, SpaceKind } from '@weave/core';
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
  /** Set for events inside a group or project. */
  space?: SpaceRef;
  /** Set for events only you can read (private follows, blocks, mutes). */
  private?: true;
}

export interface SpaceRef {
  id: string;
  kind: SpaceKind;
  name: string;
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
  projects: number;
  peers: number;
  logs: number;
  events: number;
  pending: number;
}

export interface PublishInput {
  kind: string;
  body?: Json;
  /** Group or project (name or id); the event is encrypted for its members. */
  space?: string;
  /** Agent name to sign with instead of the root identity. */
  as?: string;
}

export interface FeedQuery {
  limit?: number;
  kinds?: string[];
  /** Group or project (name or id): only its events. */
  space?: string;
  /** Only events by this person (name or did:key). */
  author?: string;
  /** Only public events. */
  publicOnly?: boolean;
}

/** A group or project this node belongs to. */
export interface SpaceInfo extends SpaceRef {
  founder: Did;
  founderName?: string;
  members: number;
  epoch: number;
}

export const PROJECT_STATUSES = ['idea', 'active', 'paused', 'shipped', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectPage {
  description: string;
  status: ProjectStatus;
  /** Shown to everyone: in the maintainers' spaces and on the public website. */
  public: boolean;
}

export interface ProjectInfo extends SpaceInfo {
  kind: 'project';
  page: ProjectPage;
  maintainers: Actor[];
  /** Groups invited as a whole, and whether their newcomers are admitted automatically. */
  groups: Array<{ id: string; name: string; auto: boolean }>;
  /** You may invite, admit, remove and change the page. */
  maintainer: boolean;
}

/** A project shown publicly in someone's space. */
export interface PublicProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  time: string;
}

/** Someone a project's maintainers are asked about. */
export interface Admission {
  project: SpaceRef;
  did: Did;
  name?: string;
  group: SpaceRef;
  /** join: they joined an invited group · leave: they left the group they came through. */
  change: 'join' | 'leave';
}

export interface MemberInfo {
  did: Did;
  name?: string;
  invitedBy?: Did;
  invitedByName?: string;
  /** Project participants who came in through a group. */
  via?: SpaceRef;
  maintainer?: true;
  since: string;
  /** Time of their latest event in the space. */
  lastActive?: string;
  /** Names of their agents seen acting in the space. */
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
  /** Projects they show publicly. */
  projects: PublicProject[];
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
  /** How your vote counts: directly, or through the participant you delegated to. */
  myVote?: { choice: Choice; via?: Actor };
  replies: ReplyInfo[];
}

/** Anything you can say in a group or project: where, and optionally an agent to sign with. */
export interface InSpace {
  space: string;
  as?: string;
}

/** Work that only happens in projects. */
export interface InProject {
  project: string;
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
 * What the CLI, the desktop app and agents can do with a node. Implemented
 * locally by WeaveNode and remotely, over the daemon's HTTP API, by ApiClient.
 *
 * A group is a collection of people with its own chat. A project is something
 * being built: participants (people and whole groups) chat, discuss, vote and
 * work on issues, and maintainers decide who takes part.
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

  // groups and projects
  spaces(kind?: SpaceKind): Promise<SpaceInfo[]>;
  createGroup(name: string): Promise<SpaceInfo>;
  createProject(input: { name: string; description?: string }): Promise<ProjectInfo>;
  /** An invite link for a group (any member) or a project (maintainers), valid for `hours`. */
  invite(space: string, hours?: number): Promise<string>;
  joinSpace(invite: string): Promise<SpaceInfo>;
  members(space: string): Promise<MemberInfo[]>;
  /** Group founder or project maintainer: remove someone and rotate the key. */
  removeMember(space: string, who: string): Promise<void>;

  // projects
  project(ref: string): Promise<ProjectInfo>;
  setProjectPage(input: { project: string } & Partial<ProjectPage>): Promise<ProjectInfo>;
  setMaintainer(input: { project: string; who: string; on: boolean }): Promise<void>;
  /** Invite a whole group into a project; its current members take part right away. */
  inviteGroup(input: { project: string; group: string }): Promise<void>;
  /** Stop inviting a group's newcomers; people already in stay. */
  uninviteGroup(input: { project: string; group: string }): Promise<void>;
  /** Admit (or stop admitting) a group's newcomers without asking. */
  setRule(input: { project: string; group: string; auto: boolean }): Promise<void>;
  /** People the maintainers are asked about: newcomers to invited groups, and those who left them. */
  admissions(project?: string): Promise<Admission[]>;
  /** Let a group newcomer in; `always` also admits the group's future newcomers, in every project you maintain that invited it. */
  admit(input: { project: string; who: string; group: string; always?: boolean }): Promise<void>;
  decline(input: { project: string; who: string; group: string }): Promise<void>;

  // people
  setEdge(input: EdgeInput): Promise<void>;
  social(): Promise<Social>;
  /** A person's space; defaults to your own. */
  profile(who?: string): Promise<Profile>;
  /** Update your name and/or theme. */
  setProfile(input: ProfileInput): Promise<Profile>;
  /** Everyone whose profile this node has seen, yourself excluded. */
  directory(): Promise<Profile[]>;

  // chat, in groups and projects
  channels(space: string): Promise<ChannelInfo[]>;
  createChannel(input: InSpace & { name: string; topic?: string }): Promise<ChannelInfo>;
  messages(space: string, options?: { channel?: string; limit?: number }): Promise<MessageInfo[]>;
  say(input: InSpace & { text: string; channel?: string; replyTo?: string }): Promise<MessageInfo>;
  /** Add (or with on: false remove) an emoji reaction on a message, post, thread, reply, issue or proposal. */
  react(input: { target: string; emoji: string; on?: boolean; as?: string }): Promise<void>;

  // working together, in projects
  threads(project: string): Promise<ThreadInfo[]>;
  startThread(input: InProject & { title: string; text?: string }): Promise<ThreadInfo>;
  /** Reply to a thread, issue or proposal (full or short id); it lands in the same project. */
  reply(input: { target: string; text: string; as?: string }): Promise<ReplyInfo>;
  issues(project: string): Promise<IssueInfo[]>;
  openIssue(input: InProject & { title: string; text?: string; labels?: string[] }): Promise<IssueInfo>;
  claimIssue(input: { issue: string; as?: string }): Promise<IssueInfo>;
  setIssueStatus(input: { issue: string; status: IssueStatus; as?: string }): Promise<IssueInfo>;
  proposals(project: string): Promise<ProposalInfo[]>;
  propose(input: InProject & { title: string; text?: string; hours?: number; quorum?: number }): Promise<ProposalInfo>;
  vote(input: { proposal: string; choice: Choice; as?: string }): Promise<ProposalInfo>;
  /** Let someone's votes in this project count for you when you don't vote; `who` undefined clears it. */
  delegateVote(input: { project: string; who?: string }): Promise<void>;
  /** Whose votes count for yours in this project, if anyone's. */
  votingDelegate(project: string): Promise<Actor | null>;
}

/** Backend methods callable over the daemon's API (watch is a separate event stream). */
export type RpcMethod = Exclude<keyof Backend, 'watch'>;

export const RPC_METHODS: readonly RpcMethod[] = [
  'whoami', 'publish', 'feed', 'addAgent', 'join', 'status',
  'spaces', 'createGroup', 'createProject', 'invite', 'joinSpace', 'members', 'removeMember',
  'project', 'setProjectPage', 'setMaintainer', 'inviteGroup', 'uninviteGroup', 'setRule', 'admissions', 'admit', 'decline',
  'setEdge', 'social', 'profile', 'setProfile', 'directory',
  'channels', 'createChannel', 'messages', 'say', 'react',
  'threads', 'startThread', 'reply', 'issues', 'openIssue', 'claimIssue', 'setIssueStatus',
  'proposals', 'propose', 'vote', 'delegateVote', 'votingDelegate',
];
