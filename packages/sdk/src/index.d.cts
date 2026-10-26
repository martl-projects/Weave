/** A person as Weave shows them to the app. */
export interface Person {
  /** Their Weave identity: stable across devices and name changes. */
  did: string;
  name?: string;
  /** The host: whoever runs the app on this computer. */
  host: boolean;
  member: boolean;
  maintainer: boolean;
}

/** A player behind a connection, and the room they came through. */
export interface Player extends Person {
  room?: { id: string; name: string };
}

export interface Group {
  id: string;
  name: string;
  /** A membership tier (supporters). */
  tier?: true;
}

export interface Project {
  id: string;
  name: string;
  host: { did: string; name?: string };
  /** Open rooms of this project hosted on this computer, with who's in them. */
  rooms: Array<{ id: string; name: string; people: Person[] }>;
  /** The project's groups, and the host's own groups and tiers. */
  groups: Group[];
  /** When a service asks: its name, and the settings it was given for this space. */
  service?: string;
  settings?: Record<string, string>;
}

export interface Access extends Person {
  /** Which of the project's groups (and the host's own groups and tiers) they're in. */
  groups: Group[];
}

/** A badge of the project: lasting recognition, signed by the maintainer who gave it. */
/** A show someone holds a ticket to, as its host let them in. */
export interface Ticket {
  show: string;
  name: string;
  room?: string;
  starts: string;
  ends: string;
  /** On right now (from an hour before the start to the end), and not called off. */
  open: boolean;
  cancelled: boolean;
}

export interface Badge {
  id: string;
  /** image: its picture (wblob: reference), shown next to the holder's name instead of the symbol. */
  series: { id: string; name: string; symbol: string; image?: string; limit?: number };
  /** Its number in the series: #7 of 20. */
  n: number;
  issuer: { did: string; name?: string };
  note: string;
  /** What it's for, e.g. the post an idea came from. */
  ref?: string;
  time: string;
}

/** Something a connection can be told by: a request, a socket, Bun's server.requestIP(req), or a remote port. */
export type ConnectionLike = number | { address?: string; port: number } | { remotePort?: number; remoteAddress?: string } | { socket: { remotePort?: number; remoteAddress?: string } };

export declare class WeaveError extends Error {
  readonly status: number;
}

export declare class Weave {
  constructor(options: { api: string; token: string; project?: string });
  readonly api: string;
  readonly projectId?: string;
  /** The host: the person running the app on this computer. */
  me(): Promise<Person>;
  /** Who is behind a connection; undefined when it didn't come through Weave. The host's own browser counts as the host. */
  who(from: ConnectionLike): Promise<Player | undefined>;
  /** The project; a service in several spaces names which (id or name). */
  project(space?: string): Promise<Project>;
  access(did: string, options?: { group?: string }): Promise<Access>;
  /** The project's shows someone has a ticket to (paid on chain), and whether each is on right now: let them in while `open`. */
  tickets(did: string): Promise<Ticket[]>;
  /** The project's badges someone holds: only valid ones, checked against the issuer's signatures. */
  badges(did: string): Promise<Badge[]>;
}

/** Weave as the app was started with it (WEAVE_API, WEAVE_TOKEN, WEAVE_PROJECT), or undefined when Weave didn't start it. */
export declare function connect(env?: { WEAVE_API?: string; WEAVE_TOKEN?: string; WEAVE_PROJECT?: string }): Weave | undefined;
