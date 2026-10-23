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
  /** This node is a company's attestor (stage 6): it checks employees' sign-ins with this OIDC provider and vouches for them. */
  attestor?: { issuer: string; audience: string; hours?: number };
  /** An archive node (stage 6): it keeps everything of its spaces, never forgets or lets go of anything. */
  archive?: boolean;
  /** Where to look for new Weave versions, instead of the Weave project and its repository. */
  updates?: { project?: string; repo?: string };
  /** The company's node serves SCIM for its user management on this port (stage 12; the token is kept sealed). */
  scim?: { port: number; invite?: boolean };
  /** A standby company server (stage 14): it follows the active one and writes nothing, until promoted. */
  standby?: boolean;
  /** The company's node serves the admin console on this port (stage 12). */
  console?: { port: number; url?: string; clientId?: string };
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
    // A company's node (stages 6 and 12): written by weave company create and friends, read back here.
    ...(stored.attestor && typeof stored.attestor.issuer === 'string' && typeof stored.attestor.audience === 'string'
      ? { attestor: { issuer: stored.attestor.issuer, audience: stored.attestor.audience, ...(typeof stored.attestor.hours === 'number' ? { hours: stored.attestor.hours } : {}) } }
      : {}),
    ...(stored.archive === true ? { archive: true } : {}),
    ...(stored.standby === true ? { standby: true } : {}),
    ...(stored.scim && Number.isInteger(stored.scim.port) ? { scim: { port: stored.scim.port, ...(stored.scim.invite === true ? { invite: true } : {}) } } : {}),
    ...(stored.console && Number.isInteger(stored.console.port)
      ? { console: { port: stored.console.port, ...(typeof stored.console.url === 'string' ? { url: stored.console.url } : {}), ...(typeof stored.console.clientId === 'string' ? { clientId: stored.console.clientId } : {}) } }
      : {}),
    ...(stored.updates && typeof stored.updates === 'object'
      ? { updates: { ...(typeof stored.updates.project === 'string' ? { project: stored.updates.project } : {}), ...(typeof stored.updates.repo === 'string' ? { repo: stored.updates.repo } : {}) } }
      : {}),
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
