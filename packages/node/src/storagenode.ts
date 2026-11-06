import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b64u, publicKeyFromDid, Replica, verify, type Did } from '@weave/core';
import { LineChannel, PeerSession2, signinMessage, SwarmNode, wsPeerStream, type HeldSpace, type SpaceAccess, type TextSocket } from '@weave/net';
import { SqliteStore } from './sqlitestore.ts';

/*
 * A storage node (docs/web-stage2.md): always on, it holds people's spaces without being able to open them. Each
 * account has its own log, its own place on the network and a quota; deleting an account deletes a folder. It gets
 * auth keys and topics, never a key: its protocol is in @weave/net (storageclient.ts).
 *
 * Accounts come by invitation. An account's id is a key of its own, not the person's identity.
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
const CONTROL_MS = 60_000;

/** A place on the network for one account: Hyperswarm in production. */
export interface StorageNetwork {
  join(topic: string): Promise<void>;
  leave(topic: string): Promise<void>;
  announce(): void;
  destroy(): Promise<void>;
}

export interface StorageOptions {
  dir: string;
  network(replica: Replica, access: SpaceAccess): StorageNetwork;
  quota?: number;
}

interface HeldRecord {
  space: string;
  auths: string[];
  topics: string[];
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
}

const tokenHash = (token: string): string => createHash('sha256').update('weave/storage/token/v1').update(token).digest('base64url');
const folderOf = (id: Did): string => createHash('sha256').update(id).digest('hex').slice(0, 32);
const isText = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function writeJson(path: string, value: unknown): void {
  const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, path);
}

function validHold(spaces: unknown): HeldRecord[] | undefined {
  if (!Array.isArray(spaces) || spaces.length > MAX_SPACES) return undefined;
  const held: HeldRecord[] = [];
  for (const s of spaces as Array<Record<string, unknown>>) {
    if (!s || !isText(s.space, 200) || !Array.isArray(s.auths) || !Array.isArray(s.topics)) return undefined;
    if (s.space === 'public' || !s.auths.length || s.auths.length > MAX_KEYS || s.topics.length > MAX_KEYS) return undefined;
    if (!s.auths.every((a) => isText(a, 64)) || !s.topics.every((t) => isText(t, 200))) return undefined;
    held.push({ space: s.space, auths: s.auths as string[], topics: s.topics as string[] });
  }
  return held;
}

/** An account's place on the real network: a Hyperswarm of its own (`options.bootstrap` for a test network). */
export const swarmNetwork =
  (options: ConstructorParameters<typeof SwarmNode>[1] = {}) =>
  (replica: Replica, access: SpaceAccess): StorageNetwork =>
    new SwarmNode(replica, options, undefined, access);

export class StorageNode {
  readonly #dir: string;
  readonly #accounts = new Map<Did, Account>();
  readonly #boxes = new Map<string, Did>();
  readonly #options: StorageOptions;
  #invites: string[];
  #closing = false;

  private constructor(options: StorageOptions) {
    this.#options = options;
    this.#dir = options.dir;
    mkdirSync(join(this.#dir, 'accounts'), { recursive: true });
    const invites = join(this.#dir, 'invites.json');
    this.#invites = existsSync(invites) ? (JSON.parse(readFileSync(invites, 'utf8')) as string[]) : [];
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
    const account: Account = { file, dir, store, replica, network: undefined as unknown as StorageNetwork, sessions: new Set(), over: false };
    // Strangers are turned away: only who shows one of these spaces gets anything.
    account.network = this.#options.network(replica, { firewall: true, spaces: () => (account.over ? [] : this.#held(account)) });
    this.#accounts.set(file.id, account);
    for (const hash of Object.keys(file.boxes)) this.#boxes.set(hash, file.id);
    this.measure(file.id);
    if (!account.over) await Promise.all(file.spaces.flatMap((s) => s.topics).map((t) => account.network.join(t)));
    return account;
  }

  #held(account: Account): HeldSpace[] {
    return account.file.spaces.map((s) => ({ space: s.space, keys: s.auths.map((a) => b64u.decode(a)), blind: true as const }));
  }

  #save(account: Account): void {
    writeJson(join(account.dir, 'account.json'), account.file);
  }

  /** A new invitation: one account, once. Only its hash is kept. */
  invite(): string {
    const code = randomBytes(18).toString('base64url');
    this.#invites.push(tokenHash(code));
    writeJson(join(this.#dir, 'invites.json'), this.#invites);
    return code;
  }

  #takeInvite(code: string): boolean {
    const hash = Buffer.from(tokenHash(code));
    const at = this.#invites.findIndex((i) => i.length === hash.length && timingSafeEqual(Buffer.from(i), hash));
    if (at < 0) return false;
    this.#invites.splice(at, 1);
    writeJson(join(this.#dir, 'invites.json'), this.#invites);
    return true;
  }

  #usedBy(account: Account): number {
    let used = 0;
    for (const name of readdirSync(account.dir)) if (name.startsWith('log.sqlite')) used += statSync(join(account.dir, name)).size;
    return used;
  }

  /** Look at what an account uses: over its quota it stops collecting, under it again it goes on. */
  measure(id: Did): { used: number; quota: number; over: boolean } {
    const account = this.#accounts.get(id)!;
    const quota = account.file.quota ?? this.#options.quota ?? QUOTA;
    const used = this.#usedBy(account);
    const over = used > quota;
    if (over !== account.over) {
      account.over = over;
      for (const topic of account.file.spaces.flatMap((s) => s.topics)) void (over ? account.network.leave(topic) : account.network.join(topic)).catch(() => {});
      account.network.announce();
    }
    return { used, quota, over };
  }

  async #hold(account: Account, spaces: HeldRecord[]): Promise<void> {
    const before = new Set(account.file.spaces.flatMap((s) => s.topics));
    const after = new Set(spaces.flatMap((s) => s.topics));
    account.file.spaces = spaces;
    this.#save(account);
    if (!account.over) {
      for (const topic of before) if (!after.has(topic)) await account.network.leave(topic).catch(() => {});
      for (const topic of after) if (!before.has(topic)) await account.network.join(topic).catch(() => {});
    }
    account.network.announce();
  }

  async #delete(account: Account): Promise<void> {
    this.#accounts.delete(account.file.id);
    for (const hash of Object.keys(account.file.boxes)) this.#boxes.delete(hash);
    for (const session of account.sessions) session.close();
    await account.network.destroy().catch(() => {});
    account.store.close();
    rmSync(account.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    const proved = (id: unknown, sig: unknown): id is Did => {
      if (!isText(id, 200) || !isText(sig, 200)) return false;
      try {
        return verify(b64u.decode(sig), signinMessage(stream.handshakeHash), publicKeyFromDid(id));
      } catch {
        return false;
      }
    };

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
          const session = new PeerSession2(mine.replica, channel.release(), { access: { spaces: () => this.#held(mine) } });
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
          await handle(message as Record<string, unknown>).catch(() => no('that failed'));
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
  }
}
