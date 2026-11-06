import { isLanguage, type Language } from '@weave/core';
import { readJson, writeJson, type Home } from './home.ts';

export interface Config {
  /** The UI's language on this computer (docs/localization.md): a shipped language, or absent for the system's. */
  language?: Language;
  /** Topics this node joins on the DHT. */
  topics: string[];
  /** DHT bootstrap nodes; empty means Hyperswarm's public defaults. */
  bootstrap: Array<{ host: string; port: number }>;
  /** Tiers to ask to join once the creator's node has been reached (e.g. from the app's bundle). */
  pendingMemberships: Array<{ tier: string; creator: string; note?: string }>;
  /** You've been asked once whether to tell your agent harnesses about Weave. */
  agentsOffered?: boolean;
  /** This node is a company's attestor (stage 6): it checks employees' sign-ins with this OIDC provider and vouches for them. */
  attestor?: { issuer: string; audience: string; hours?: number };
  /** An archive node (stage 6): it keeps everything of its spaces, never forgets or lets go of anything. */
  archive?: boolean;
  /**
   * Where to look for new Weave versions, instead of the Weave project, its repository and its artifact (the desktop
   * app's installers); auto: false stops the app from downloading them in the background (it still says there's one).
   */
  updates?: { project?: string; repo?: string; artifact?: string; auto?: boolean };
  /** The company's node serves SCIM for its user management on this port (stage 12; the token is kept sealed). */
  scim?: { port: number; invite?: boolean };
  /** A standby company server (stage 14): it follows the active one and writes nothing, until promoted. */
  standby?: boolean;
  /** When this person last saved a backup file here (saveBackup), or restored from one: for the reminder that nobody else can bring their data back. */
  lastBackup?: string;
  /** Which server of an identity this is (nQ9JHlUV): promoting a standby counts it up; an older one that sees a newer one stands down. */
  generation?: number;
  /** The company's node serves the admin console on this port (stage 12). */
  console?: { port: number; url?: string; clientId?: string };
  /** Follow Claude Code sessions for links to posts (the Mentions panel). */
  followClaudeCode?: boolean;
  /** Space id → folders on this computer its sessions ran in, latest first (see rememberFolder). */
  spaceFolders?: Record<string, string[]>;
  /** Your desk: its project, and the folder here where your daily driver works. */
  desk?: { space: string; folder?: string; driver?: { provider: string; id: string; host?: string; folder?: string } };
  /** false: peers that share nothing with this node and hold none of its links get in all the same (as before 0.27). */
  firewall?: false;
  /**
   * This node is its person's front door: it's found at the public meeting point (the one `weave contact --door` links
   * give out) and lets in whoever comes through it. Unset: an always-on node is one, a person's computer isn't.
   */
  frontDoor?: boolean;
}

/** What this build reads of the config; anything else in the file is kept as it is (see loadConfig). */
const KNOWN: ReadonlySet<string> = new Set<keyof Config>([
  'topics', 'bootstrap', 'pendingMemberships', 'agentsOffered', 'attestor', 'archive', 'updates', 'scim', 'standby', 'generation', 'console', 'followClaudeCode', 'spaceFolders', 'desk', 'language', 'firewall', 'frontDoor',
]);

export function loadConfig(home: Home): Config {
  const stored = readJson<Partial<Config>>(home.config) ?? {};
  // A newer build's settings survive an older one saving (a desk once vanished that way): kept, never read.
  const unknown = Object.fromEntries(Object.entries(stored).filter(([key]) => !KNOWN.has(key)));
  return {
    ...unknown,
    topics: stored.topics ?? [],
    bootstrap: stored.bootstrap ?? [],
    pendingMemberships: stored.pendingMemberships ?? [],
    ...(stored.agentsOffered ? { agentsOffered: true } : {}),
    // A company's node (stages 6 and 12): written by weave company create and friends, read back here.
    ...(stored.attestor && typeof stored.attestor.issuer === 'string' && typeof stored.attestor.audience === 'string'
      ? { attestor: { issuer: stored.attestor.issuer, audience: stored.attestor.audience, ...(typeof stored.attestor.hours === 'number' ? { hours: stored.attestor.hours } : {}) } }
      : {}),
    ...(stored.archive === true ? { archive: true } : {}),
    ...(stored.standby === true ? { standby: true } : {}),
    ...(Number.isSafeInteger(stored.generation) && stored.generation! > 0 ? { generation: stored.generation } : {}),
    ...(stored.scim && Number.isInteger(stored.scim.port) ? { scim: { port: stored.scim.port, ...(stored.scim.invite === true ? { invite: true } : {}) } } : {}),
    ...(stored.console && Number.isInteger(stored.console.port)
      ? { console: { port: stored.console.port, ...(typeof stored.console.url === 'string' ? { url: stored.console.url } : {}), ...(typeof stored.console.clientId === 'string' ? { clientId: stored.console.clientId } : {}) } }
      : {}),
    ...(stored.updates && typeof stored.updates === 'object'
      ? {
          updates: {
            ...(typeof stored.updates.project === 'string' ? { project: stored.updates.project } : {}),
            ...(typeof stored.updates.repo === 'string' ? { repo: stored.updates.repo } : {}),
            ...(typeof stored.updates.artifact === 'string' ? { artifact: stored.updates.artifact } : {}),
            ...(stored.updates.auto === false ? { auto: false } : {}),
          },
        }
      : {}),
    ...(stored.followClaudeCode ? { followClaudeCode: true } : {}),
    ...(stored.spaceFolders ? { spaceFolders: stored.spaceFolders } : {}),
    ...(stored.desk ? { desk: stored.desk } : {}),
    ...(isLanguage(stored.language) ? { language: stored.language } : {}),
    ...(stored.firewall === false ? { firewall: false as const } : {}),
    ...(typeof stored.frontDoor === 'boolean' ? { frontDoor: stored.frontDoor } : {}),
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
