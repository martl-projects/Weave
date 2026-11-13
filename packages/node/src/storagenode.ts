import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b64u, blobHash, MAX_BLOB, publicKeyFromDid, Replica, verify, type Did } from '@weave/core';
import { LineChannel, PeerSession2, planMessage, sharedDht, signinMessage, SwarmNode, wsPeerStream, type BlobSource, type HeldSpace, type SpaceAccess, type TextSocket } from '@weave/net';
import { BlobStore } from './blobstore.ts';
import { SqliteStore } from './sqlitestore.ts';
import { PlanStore } from './storageplans.ts';
import type HyperDHT from 'hyperdht';

/*
 * A storage node (docs/web-stage2.md): always on, it holds people's spaces without being able to open them. Each
 * account has its own log, its own place on the network and a quota; deleting an account deletes a folder. It gets
 * auth keys and topics, never a key: its protocol is in @weave/net (storageclient.ts).
 *
 * Accounts come by invitation. An account's id is a key of its own, not the person's identity.
 *
 * Blobs go by hash alone. What a blob is for lies in sealed events, so a node can't look for them itself: it keeps what
 * its person's browser hands it, and when the browser asks for one it hasn't got, it asks the peers and keeps that too.
 */

const QUOTA = 512 * 1024 * 1024;
/** Over the quota nothing new is collected; this far over, a browser can't sync either (it could fill a disk otherwise). */
const HARD_LIMIT = 2;
const MAX_LINE = 512 * 1024;
const MAX_BOX = 256 * 1024;
const MAX_BOXES = 8;
const MAX_SPACES = 5000;
const MAX_KEYS = 64;
/** Wrong tokens, proofs or invitations on one connection before it's closed. */
const MAX_TRIES = 5;
/** A ticket for the relay (relayTicket) is good this long, once. */
const TICKET_MS = 60_000;
/** Relayed connections to websites one account may have open at once. */
const MAX_RELAYS = 4;
const CONTROL_MS = 60_000;
/** A person's own space: its events are all theirs (packages/node/src/shared.ts). */
const SELF_SCOPE = 'self';
/** Blobs looked for at once, per account. */
const MAX_ASKED = 512;

/** A place on the network for one account: Hyperswarm in production. */
export interface StorageNetwork {
  /** `announce: false` only looks: someone else's meeting point. */
  join(topic: string, options?: { announce?: boolean }): Promise<void>;
  leave(topic: string): Promise<void>;
  announce(): void;
  /** Ask whoever is there for blobs. */
  want?(hashes: string[]): void;
  /** Whose public events peers get changed. */
  refreshPublic?(): void;
  destroy(): Promise<void>;
}

/**
 * Where each account goes on the network; `close` ends what they share, after them. `dht`: the DHT node they share, which
 * also carries browsers' connections to websites (relayDht), if this network has one.
 */
export type StorageNetworks = ((replica: Replica, access: SpaceAccess, blobs: BlobSource) => StorageNetwork) & { close?(): Promise<void>; dht?(): HyperDHT };

export interface StorageOptions {
  dir: string;
  network: StorageNetworks;
  quota?: number;
}

interface HeldRecord {
  space: string;
  auths: string[];
  topics: string[];
  looks?: string[];
  proof?: true;
}

/** Every topic of a list, and whether to be found there: where it's announced on anywhere, it is. */
function topicsOf(spaces: HeldRecord[]): Map<string, boolean> {
  const topics = new Map<string, boolean>();
  for (const s of spaces) for (const topic of s.looks ?? []) topics.set(topic, false);
  for (const s of spaces) for (const topic of s.topics) topics.set(topic, true);
  return topics;
}

interface AccountFile {
  id: Did;
  created: string;
  quota?: number;
  spaces: HeldRecord[];
  /** Sealed boxes by the hash of their token. */
  boxes: Record<string, string>;
}

interface Account {
  file: AccountFile;
  dir: string;
  store: SqliteStore;
  replica: Replica;
  network: StorageNetwork;
  sessions: Set<PeerSession2>;
  over: boolean;
  blobs: BlobStore;
  blobBytes: number;
  /** Who wrote in each space it holds, as the envelopes say: for whose public events a peer gets. */
  authors: Map<string, Set<Did>>;
  /** Blobs the browser asked for, that the peers are being asked for. */
  asked: Set<string>;
}

const tokenHash = (token: string): string => createHash('sha256').update('weave/storage/token/v1').update(token).digest('base64url');
const folderOf = (id: Did): string => createHash('sha256').update(id).digest('hex').slice(0, 32);
const fieldsOf = (message: unknown): Record<string, unknown> => (message && typeof message === 'object' ? (message as Record<string, unknown>) : {});
const isText = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function writeJson(path: string, value: unknown): void {
  const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, path);
}

/** An invitation's hash: for one account (a string, as before), or for several, with how many are left. */
export type StoredInvite = string | { hash: string; left: number };

const readInvites = (dir: string): StoredInvite[] => {
  const path = join(dir, 'invites.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as StoredInvite[]) : [];
};
const hashOf = (invite: StoredInvite): string => (typeof invite === 'string' ? invite : invite.hash);

function validHold(spaces: unknown): HeldRecord[] | undefined {
  if (!Array.isArray(spaces) || spaces.length > MAX_SPACES) return undefined;
  const held: HeldRecord[] = [];
  for (const s of spaces as Array<Record<string, unknown>>) {
    if (!s || !isText(s.space, 200) || !Array.isArray(s.auths) || !Array.isArray(s.topics)) return undefined;
    const looks = s.looks === undefined ? [] : s.looks;
    if (!Array.isArray(looks) || (s.proof !== undefined && s.proof !== true)) return undefined;
    if (s.space === 'public' || !s.auths.length || s.auths.length > MAX_KEYS || s.topics.length > MAX_KEYS || looks.length > MAX_KEYS) return undefined;
    if (!s.auths.every((a) => isText(a, 64)) || !s.topics.every((t) => isText(t, 200)) || !looks.every((t) => isText(t, 200))) return undefined;
    held.push({ space: s.space, auths: s.auths as string[], topics: s.topics as string[], ...(looks.length ? { looks: looks as string[] } : {}), ...(s.proof ? { proof: true as const } : {}) });
  }
  return held;
}

/**
 * An account's place on the real network: a Hyperswarm of its own, with a key of its own, on the one DHT node all the
 * accounts share (`options.bootstrap` for a test network). The DHT node comes up with the first account.
 */
export function swarmNetwork(options: { bootstrap?: Array<{ host: string; port: number }> } = {}): StorageNetworks {
  let shared: ReturnType<typeof sharedDht> | undefined;
  const networks = (replica: Replica, access: SpaceAccess, blobs: BlobSource): StorageNetwork => {
    shared ??= sharedDht(options);
    return new SwarmNode(replica, { dht: shared.dht }, blobs, access);
  };
  return Object.assign(networks, { close: async () => void (await shared?.destroy()), dht: () => (shared ??= sharedDht(options)).dht });
}

/** Join each topic, looking only where that's all it should do. */
const joinAll = (network: StorageNetwork, topics: Map<string, boolean>) => Promise.all([...topics].map(([topic, announce]) => network.join(topic, announce ? undefined : { announce: false })));

export class StorageNode {
  readonly #dir: string;
  readonly #accounts = new Map<Did, Account>();
  readonly #boxes = new Map<string, Did>();
  readonly #options: StorageOptions;
  /** Onboarding links' plans, sealed, and their previews (storageplans.ts). */
  readonly plans: PlanStore;
  #closing = false;
  /** Tickets for the relay, by their hash: whose, and until when. */
  readonly #tickets = new Map<string, { id: Did; until: number; again?: boolean }>();
  /** Relayed connections open, per account. */
  readonly #relays = new Map<Did, number>();

  private constructor(options: StorageOptions) {
    this.#options = options;
    this.#dir = options.dir;
    mkdirSync(join(this.#dir, 'accounts'), { recursive: true });
    this.plans = new PlanStore(this.#dir);
  }

  /** Open a storage node: every account comes back and takes its place on the network. */
  static async open(options: StorageOptions): Promise<StorageNode> {
    const node = new StorageNode(options);
    for (const folder of readdirSync(join(node.#dir, 'accounts'))) {
      const path = join(node.#dir, 'accounts', folder, 'account.json');
      if (existsSync(path)) await node.#start(JSON.parse(readFileSync(path, 'utf8')) as AccountFile);
    }
    return node;
  }

  async #start(file: AccountFile): Promise<Account> {
    const dir = join(this.#dir, 'accounts', folderOf(file.id));
    mkdirSync(dir, { recursive: true });
    const store = new SqliteStore(join(dir, 'log.sqlite'));
    const replica = new Replica(store);
    const blobDir = join(dir, 'blobs');
    const blobBytes = existsSync(blobDir) ? readdirSync(blobDir).reduce((n, name) => n + statSync(join(blobDir, name)).size, 0) : 0;
    const account: Account = { file, dir, store, replica, network: undefined as unknown as StorageNetwork, sessions: new Set(), over: false, blobs: new BlobStore(blobDir), blobBytes, asked: new Set(), authors: new Map() };
    const wrote = (scope: string, author: Did): boolean => {
      const set = account.authors.get(scope) ?? new Set<Did>();
      account.authors.set(scope, set);
      return !set.has(author) && !!set.add(author);
    };
    for (const r of replica.events()) wrote(r.scope, r.author);
    // Someone new in a space: peers sharing it may now get their public side (their keys, without which nothing of theirs is taken).
    let refresh: ReturnType<typeof setTimeout> | undefined;
    replica.onAppend((r) => {
      if (!wrote(r.scope, r.author) || r.scope === 'public') return;
      clearTimeout(refresh);
      // Not once the node or this account closed: its store is gone by then (a test closing at once saw it, on CI).
      refresh = setTimeout(() => !this.#closing && this.#accounts.get(file.id) === account && account.network.refreshPublic?.(), 100);
      refresh.unref?.();
    });
    // Strangers are turned away: only who shows one of these spaces gets anything.
    account.network = this.#options.network(replica, { firewall: true, spaces: () => (account.over ? [] : this.#held(account)), publicFor: (shared) => this.#publicFor(account, shared) }, this.#fromPeers(account));
    this.#accounts.set(file.id, account);
    for (const hash of Object.keys(file.boxes)) this.#boxes.set(hash, file.id);
    this.measure(file.id);
    if (!account.over) await joinAll(account.network, topicsOf(file.spaces));
    return account;
  }

  /**
   * Whose public events a peer on the network gets: the account's person, and whoever wrote in what the peer shares
   * with it, as a person's own node decides (SpaceAccess.publicFor). Who the person is shows in their own space, the
   * only one whose events they all sign. Someone let in by a contact link learns the person they reached, not whom
   * that person knows.
   */
  #publicFor(account: Account, shared: ReadonlySet<string>): (author: Did) => boolean {
    // Public is shared with everyone: who wrote there says nothing of whom the peer may see.
    const seen = [...shared, SELF_SCOPE].filter((scope) => scope !== 'public');
    return (author) => seen.some((scope) => account.authors.get(scope)?.has(author));
  }

  /** Keep a blob, if it is what it says and there's room. */
  #keep(account: Account, hash: string, data: Uint8Array): boolean {
    if (account.over || data.length > MAX_BLOB || blobHash(data) !== hash) return false;
    if (!account.blobs.has(hash)) {
      account.blobs.put(data);
      account.blobBytes += data.length;
      this.measure(account.file.id);
    }
    return true;
  }

  /** Blobs as peers on the network see them: they get what's here, and bring only what was asked for. */
  #fromPeers(account: Account): BlobSource {
    return {
      get: (hash) => account.blobs.get(hash),
      wanted: () => [...account.asked],
      receive: (hash, data) => {
        if (!account.asked.delete(hash) || !this.#keep(account, hash, data)) return;
        for (const session of account.sessions) session.pushBlob(hash, data);
      },
    };
  }

  /** Blobs as the person's browser sees them: what it hands over is kept, and what isn't here is looked for. */
  #fromOwner(account: Account): BlobSource {
    return {
      get: (hash) => {
        const data = account.blobs.get(hash);
        if (!data && !account.over && account.asked.size < MAX_ASKED && !account.asked.has(hash)) {
          account.asked.add(hash);
          account.network.want?.([hash]);
        }
        return data;
      },
      wanted: () => [],
      receive: (hash, data) => void this.#keep(account, hash, data),
    };
  }

  #held(account: Account): HeldSpace[] {
    return account.file.spaces.map((s) => ({ space: s.space, keys: s.auths.map((a) => b64u.decode(a)), blind: true as const, ...(s.proof ? { proof: true as const } : {}) }));
  }

  #save(account: Account): void {
    writeJson(join(account.dir, 'account.json'), account.file);
  }

  /** A new invitation: for one account, or for `accounts` of them (one link to share). Only its hash is kept. */
  invite(accounts = 1): string {
    return StorageNode.inviteIn(this.#dir, accounts);
  }

  /** An invitation written straight into a node's folder, from another process while it runs: it reads the file when one is used. */
  static inviteIn(dir: string, accounts = 1): string {
    if (!Number.isInteger(accounts) || accounts < 1) throw new Error('an invitation is for one account or more');
    mkdirSync(dir, { recursive: true });
    const code = randomBytes(18).toString('base64url');
    const hash = tokenHash(code);
    writeJson(join(dir, 'invites.json'), [...readInvites(dir), accounts === 1 ? hash : { hash, left: accounts }]);
    return code;
  }

  /** The invitations not used up: how many for one account, and per shared one (by the start of its hash) how many are left. */
  static invitesIn(dir: string): { single: number; shared: Array<{ id: string; left: number }> } {
    const invites = readInvites(dir);
    return {
      single: invites.filter((i) => typeof i === 'string').length,
      shared: invites.flatMap((i) => (typeof i === 'string' ? [] : [{ id: i.hash.slice(0, 8), left: i.left }])),
    };
  }

  #takeInvite(code: string): boolean {
    const hash = Buffer.from(tokenHash(code));
    const invites = readInvites(this.#dir);
    const at = invites.findIndex((i) => hashOf(i).length === hash.length && timingSafeEqual(Buffer.from(hashOf(i)), hash));
    if (at < 0) return false;
    const taken = invites[at];
    if (typeof taken !== 'string' && taken.left > 1) invites[at] = { ...taken, left: taken.left - 1 };
    else invites.splice(at, 1);
    writeJson(join(this.#dir, 'invites.json'), invites);
    return true;
  }

  #usedBy(account: Account): number {
    let used = 0;
    for (const name of readdirSync(account.dir)) if (name.startsWith('log.sqlite')) used += statSync(join(account.dir, name)).size;
    return used + account.blobBytes;
  }

  /** Look at what an account uses: over its quota it stops collecting, under it again it goes on. */
  measure(id: Did): { used: number; quota: number; over: boolean } {
    const account = this.#accounts.get(id)!;
    const quota = account.file.quota ?? this.#options.quota ?? QUOTA;
    const used = this.#usedBy(account);
    const over = used > quota;
    if (over !== account.over) {
      account.over = over;
      for (const [topic, announce] of topicsOf(account.file.spaces)) void (over ? account.network.leave(topic) : account.network.join(topic, announce ? undefined : { announce: false })).catch(() => {});
      account.network.announce();
    }
    return { used, quota, over };
  }

  async #hold(account: Account, spaces: HeldRecord[]): Promise<void> {
    const before = topicsOf(account.file.spaces);
    const after = topicsOf(spaces);
    account.file.spaces = spaces;
    this.#save(account);
    if (!account.over) {
      for (const topic of before.keys()) if (!after.has(topic)) await account.network.leave(topic).catch(() => {});
      for (const [topic, announce] of after) if (before.get(topic) !== announce) await account.network.join(topic, announce ? undefined : { announce: false }).catch(() => {});
    }
    account.network.announce();
    for (const session of account.sessions) session.announce();
  }

  async #delete(account: Account): Promise<void> {
    this.#accounts.delete(account.file.id);
    for (const hash of Object.keys(account.file.boxes)) this.#boxes.delete(hash);
    for (const session of account.sessions) session.close();
    await account.network.destroy().catch(() => {});
    account.store.close();
    rmSync(account.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  /**
   * The relay, for a ticket (once, within a minute): the DHT a browser's connections to websites go through, and the
   * account's place among the relayed connections, given back by `done`. Undefined: no ticket, or too many open.
   */
  relayFor(ticket: string): { dht: HyperDHT; done(): void } | undefined {
    const hash = tokenHash(ticket);
    const t = this.#tickets.get(hash);
    if (!t?.again) this.#tickets.delete(hash);
    const dht = this.#options.network.dht?.();
    if (!t || t.until <= Date.now() || !dht) return undefined;
    const open = this.#relays.get(t.id) ?? 0;
    if (open >= MAX_RELAYS) return undefined;
    this.#relays.set(t.id, open + 1);
    let given = false;
    return {
      dht,
      done: () => {
        if (given) return;
        given = true;
        const left = (this.#relays.get(t.id) ?? 1) - 1;
        if (left > 0) this.#relays.set(t.id, left);
        else this.#relays.delete(t.id);
      },
    };
  }

  /** Serve a WebSocket just accepted. Who may connect is anyone: what they get depends on what they prove. */
  async accept(socket: TextSocket): Promise<void> {
    const stream = await wsPeerStream(socket, false);
    let account: Account | undefined;
    let tries = 0;
    let busy: Promise<void> = Promise.resolve();
    const timer = setTimeout(() => channel.close(), CONTROL_MS);
    timer.unref?.();
    stream.on('close', () => clearTimeout(timer));

    const no = (why: string) => {
      channel.send({ t: 'no', why });
      if (++tries >= MAX_TRIES) channel.close();
    };
    const proved = (id: unknown, sig: unknown, message = signinMessage): id is Did => {
      if (!isText(id, 200) || !isText(sig, 200)) return false;
      try {
        return verify(b64u.decode(sig), message(stream.handshakeHash), publicKeyFromDid(id));
      } catch {
        return false;
      }
    };
    // A planner signs as their Weave identity, over this connection, with a message of its own.
    const planner = (m: Record<string, unknown>): Did | undefined => (proved(m.id, m.sig, planMessage) ? m.id : undefined);

    const handle = async (m: Record<string, unknown>): Promise<void> => {
      switch (m.t) {
        case 'open': {
          const id = isText(m.token, 128) ? this.#boxes.get(tokenHash(m.token)) : undefined;
          const data = id && this.#accounts.get(id)?.file.boxes[tokenHash(m.token as string)];
          // Nothing tells a wrong token from an account that isn't here; it still counts as a try.
          if (!data) tries++;
          channel.send({ t: 'ok', ...(data ? { data } : {}) });
          if (tries >= MAX_TRIES) channel.close();
          return;
        }
        case 'register': {
          if (!proved(m.id, m.sig)) return no('that proof is not from this key');
          if (this.#accounts.has(m.id)) return no('that account exists');
          if (!isText(m.invite, 200) || !this.#takeInvite(m.invite)) return no('that invitation is not valid');
          account = await this.#start({ id: m.id, created: new Date().toISOString(), spaces: [], boxes: {} });
          this.#save(account);
          return channel.send({ t: 'ok' });
        }
        case 'signin': {
          if (!proved(m.id, m.sig) || !this.#accounts.has(m.id)) return no('no such account, or the wrong key');
          account = this.#accounts.get(m.id);
          return channel.send({ t: 'ok' });
        }
        // Onboarding links: anyone with a code may look and take; only a planner, as themselves, puts and revokes.
        case 'plan.get': {
          const plan = this.plans.get(m.code);
          return plan ? channel.send({ t: 'ok', ...plan }) : no('this invite link no longer works');
        }
        case 'plan.take': {
          const taken = this.plans.take(m.code, m.check, m.account === true, () => this.invite());
          return channel.send({ t: 'ok', ...taken });
        }
        case 'plan.hello': {
          this.plans.hello(m.code, m.check, m.box);
          return channel.send({ t: 'ok' });
        }
        case 'plan.hellos': {
          const by = planner(m);
          if (!by) return no('that proof is not from this key');
          return channel.send({ t: 'ok', hellos: this.plans.hellos(by, m.code) });
        }
        case 'plan.put': {
          const by = planner(m);
          if (!by) return no('that proof is not from this key');
          return channel.send({ t: 'ok', code: this.plans.put(by, m) });
        }
        case 'plan.revoke': {
          const by = planner(m);
          if (!by) return no('that proof is not from this key');
          this.plans.revoke(by, m.code);
          return channel.send({ t: 'ok' });
        }
        case 'plan.list': {
          const by = planner(m);
          if (!by) return no('that proof is not from this key');
          return channel.send({ t: 'ok', plans: this.plans.list(by) });
        }
      }
      if (!account) return no('sign in first');
      const mine = account;
      switch (m.t) {
        case 'hold': {
          const spaces = validHold(m.spaces);
          if (!spaces) return no('that is not a list of spaces');
          await this.#hold(mine, spaces);
          return channel.send({ t: 'ok' });
        }
        case 'box': {
          if (!isText(m.token, 128) || !isText(m.data, MAX_BOX)) return no('that is not a box');
          const hash = tokenHash(m.token);
          const taken = this.#boxes.get(hash);
          if (taken && taken !== mine.file.id) return no('that token is taken');
          if (!mine.file.boxes[hash] && Object.keys(mine.file.boxes).length >= MAX_BOXES) return no('too many boxes');
          mine.file.boxes[hash] = m.data;
          this.#boxes.set(hash, mine.file.id);
          this.#save(mine);
          return channel.send({ t: 'ok' });
        }
        case 'unbox': {
          if (!isText(m.token, 128)) return no('that is not a token');
          const hash = tokenHash(m.token);
          if (mine.file.boxes[hash] !== undefined) {
            delete mine.file.boxes[hash];
            this.#boxes.delete(hash);
            this.#save(mine);
          }
          return channel.send({ t: 'ok' });
        }
        // A ticket for the relay (/dht): a browser's way to its websites, which it opens next to this connection.
        case 'relay': {
          if (!this.#options.network.dht) return no('this storage node relays nothing');
          const ticket = randomBytes(24).toString('base64url');
          const now = Date.now();
          for (const [hash, t] of this.#tickets) if (t.until <= now) this.#tickets.delete(hash);
          // For hours (a visit Weave hands over, at most 12): good again for each connection in that time.
          const hours = typeof m.hours === 'number' && m.hours > 0 ? Math.min(12, m.hours) : undefined;
          this.#tickets.set(tokenHash(ticket), { id: mine.file.id, until: now + (hours ? hours * 3600_000 : TICKET_MS), ...(hours ? { again: true } : {}) });
          return channel.send({ t: 'ok', ticket });
        }
        case 'usage': {
          const { used, quota, over } = this.measure(mine.file.id);
          return channel.send({ t: 'ok', used, quota, ...(over ? { over: true } : {}) });
        }
        case 'delete': {
          await this.#delete(mine);
          account = undefined;
          return channel.send({ t: 'ok' });
        }
        case 'sync': {
          const { used, quota } = this.measure(mine.file.id);
          if (used > quota * HARD_LIMIT) return no('this account is over its quota');
          clearTimeout(timer);
          channel.send({ t: 'ok' });
          const session = new PeerSession2(mine.replica, channel.release(), { access: { spaces: () => this.#held(mine) }, blobs: this.#fromOwner(mine) });
          mine.sessions.add(session);
          stream.on('close', () => mine.sessions.delete(session));
          return;
        }
      }
      no('what is that?');
    };

    const channel: LineChannel = new LineChannel(
      stream,
      (line) => {
        // One at a time, in order: `sync` must not overtake what came before it.
        busy = busy.then(async () => {
          let message: unknown;
          try {
            message = JSON.parse(line);
          } catch {
            return channel.close();
          }
          if (!message || typeof message !== 'object') return channel.close();
          await handle(message as Record<string, unknown>).catch((error: Error) => no(String(fieldsOf(message).t ?? '').startsWith('plan.') ? error.message : 'that failed'));
        });
      },
      MAX_LINE,
    );
  }

  async close(): Promise<void> {
    if (this.#closing) return;
    this.#closing = true;
    for (const account of this.#accounts.values()) {
      for (const session of account.sessions) session.close();
      await account.network.destroy().catch(() => {});
      account.store.close();
    }
    this.#accounts.clear();
    await this.#options.network.close?.();
  }
}
