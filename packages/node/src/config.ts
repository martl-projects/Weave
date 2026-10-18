import { readJson, writeJson, type Home } from './home.ts';

export interface Config {
  /** Topics this node joins on the DHT. */
  topics: string[];
  /** DHT bootstrap nodes; empty means Hyperswarm's public defaults. */
  bootstrap: Array<{ host: string; port: number }>;
  /** Tiers to ask to join once the creator's node has been reached (e.g. from the app's bundle). */
  pendingMemberships: Array<{ tier: string; creator: string; note?: string }>;
}

export function loadConfig(home: Home): Config {
  const stored = readJson<Partial<Config>>(home.config) ?? {};
  return { topics: stored.topics ?? [], bootstrap: stored.bootstrap ?? [], pendingMemberships: stored.pendingMemberships ?? [] };
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
