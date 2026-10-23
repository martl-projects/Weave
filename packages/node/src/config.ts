import { readJson, writeJson, type Home } from './home.ts';

export interface Config {
  /** Topics this node joins on the DHT. */
  topics: string[];
  /** DHT bootstrap nodes; empty means Hyperswarm's public defaults. */
  bootstrap: Array<{ host: string; port: number }>;
  /** Tiers to ask to join once the creator's node has been reached (e.g. from the app's bundle). */
  pendingMemberships: Array<{ tier: string; creator: string; note?: string }>;
  /** Project id → this computer's copy of the project's app (never published). */
  appFolders: Record<string, string>;
  /** Project id → the start command and folder the person approved (a fingerprint, see applaunch.ts). */
  approvedLaunches: Record<string, string>;
  /** You've been asked once whether to tell your agent harnesses about Weave. */
  agentsOffered?: boolean;
  /** Your own GitHub App to sign in through, instead of Weave Connect. */
  githubApp?: { clientId: string; slug: string; name: string; owner: string };
  /** Follow Claude Code sessions for links to posts (the Mentions panel). */
  followClaudeCode?: boolean;
}

export function loadConfig(home: Home): Config {
  const stored = readJson<Partial<Config>>(home.config) ?? {};
  return {
    topics: stored.topics ?? [],
    bootstrap: stored.bootstrap ?? [],
    pendingMemberships: stored.pendingMemberships ?? [],
    appFolders: stored.appFolders ?? {},
    approvedLaunches: stored.approvedLaunches ?? {},
    ...(stored.githubApp ? { githubApp: stored.githubApp } : {}),
    ...(stored.agentsOffered ? { agentsOffered: true } : {}),
    ...(stored.followClaudeCode ? { followClaudeCode: true } : {}),
  };
}

export function saveConfig(home: Home, config: Config): void {
  writeJson(home.config, config);
}

/** Parses `host:port`. */
export function parseBootstrap(value: string): { host: string; port: number } {
  const [host, port] = value.split(':');
  if (!host || !Number.isInteger(Number(port))) throw new Error(`bootstrap must be host:port, got "${value}"`);
  return { host, port: Number(port) };
}
