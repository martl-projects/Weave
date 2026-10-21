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
}

export interface Access extends Person {
  /** Which of the project's groups (and the host's own groups and tiers) they're in. */
  groups: Group[];
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
  project(): Promise<Project>;
  access(did: string, options?: { group?: string }): Promise<Access>;
}

/** Weave as the app was started with it (WEAVE_API, WEAVE_TOKEN, WEAVE_PROJECT), or undefined when Weave didn't start it. */
export declare function connect(env?: { WEAVE_API?: string; WEAVE_TOKEN?: string; WEAVE_PROJECT?: string }): Weave | undefined;
