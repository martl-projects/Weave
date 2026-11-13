import { b64u, sign, utf8, type Did, type Replica, type SigningIdentity } from '@weave/core';
import type { BlobSource } from './session.ts';
import { PeerSession2, type PeerStream, type SpaceAccess } from './session2.ts';
import { wsPeerStream, type TextSocket } from './wspeer.ts';

/*
 * Talking to a storage node (docs/web-stage2.md): a connection starts with a few requests, one JSON object per line,
 * each answered {t:'ok', …} or {t:'no', why}, and then becomes a sync session.
 *
 *   open {token}                 the sealed box a token opens (a new device: nothing else is needed for this)
 *   register {id, sig, invite}   a new account; `id` is a key of its own, not the person's identity
 *   signin {id, sig}             sig: the account key over "weave/storage/signin/v1" ‖ this connection's handshake hash
 *   hold {spaces}                what to hold: per space its auth keys and topics, the whole list each time
 *   box {token, data}            keep a sealed box under a token; unbox {token} lets it go
 *   usage                        bytes used and allowed
 *   delete                       the account and everything in it go, now
 *   sync                         the rest of the connection is a PeerSession2
 *
 * A token is a secret only the person can make (from their passkey's PRF value, or their recovery words), so a device
 * with nothing else finds its sealed keys. The node keeps a hash of it and can't open the box.
 */

export interface HeldByNode {
  space: string;
  /** Auth keys (`authKey`), newest first. */
  auths: Uint8Array[];
  topics: string[];
  /** Meeting points only looked up, never announced on: someone else's, from a contact link. */
  looks?: string[];
  /** Not a space: a contact link's meeting point, which only lets the peer in. Nothing of it is synced. */
  proof?: true;
}

export interface StorageUsage {
  used: number;
  quota: number;
  /** Over the quota: the node stopped collecting until the account shrinks or gets more. */
  over?: boolean;
}

export const signinMessage = (handshakeHash: Uint8Array): Uint8Array => new Uint8Array([...utf8('weave/storage/signin/v1'), ...handshakeHash]);
/** What a creator signs, as their Weave identity, to put, list or revoke onboarding links (never an account's signin). */
export const planMessage = (handshakeHash: Uint8Array): Uint8Array => new Uint8Array([...utf8('weave/storage/plan/v1'), ...handshakeHash]);

/** An onboarding link's plan as a creator puts it: sealed, with the key's check, and what its preview shows. */
export interface PutPlan {
  sealed: string;
  check: string;
  preview?: { title: string; text?: string };
  /** The preview's picture: a PNG, base64. */
  image?: string;
  /** The game's app icon (square, the project's icon): a PNG, base64. */
  icon?: string;
  uses?: number;
  expires?: string;
}

/** A creator's link as the storage node keeps it. */
export interface PlanListing {
  code: string;
  preview?: { title: string; text?: string };
  image?: true;
  uses?: number;
  used: number;
  expires?: string;
  revoked?: true;
  created: string;
}

/** A connection's first part, line by line; `release` hands what follows to a session, with nothing lost in between. */
export class LineChannel {
  readonly #stream: PeerStream & { handshakeHash: Uint8Array; isInitiator: boolean };
  #buffer = '';
  #onLine: (line: string) => void;
  #forward?: (chunk: string) => void;
  #released = false;
  /** The next line is the last one read here: what follows it is for a session that doesn't exist yet. */
  #lastLine = false;
  readonly #max: number;

  constructor(stream: PeerStream & { handshakeHash: Uint8Array; isInitiator: boolean }, onLine: (line: string) => void, max: number) {
    this.#stream = stream;
    this.#onLine = onLine;
    this.#max = max;
    stream.on('data', (chunk: { toString(): string }) => this.#receive(chunk.toString()));
  }

  #receive(text: string): void {
    if (this.#released) return this.#forward ? this.#forward(text) : void (this.#buffer += text);
    this.#buffer += text;
    if (this.#buffer.length > this.#max) return void this.#stream.destroy();
    let end: number;
    while (!this.#released && (end = this.#buffer.indexOf('\n')) >= 0) {
      const line = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      if (this.#lastLine) this.#released = true;
      this.#onLine(line);
    }
  }

  /** Whatever comes after the next line waits for `release`: the answer to the last request may have the session's first words right behind it. */
  lastLine(): void {
    this.#lastLine = true;
  }

  /** That answer was a no: go on reading lines. */
  goOn(): void {
    this.#lastLine = false;
    this.#released = false;
    this.#receive('');
  }

  send(message: unknown): void {
    this.#stream.write(`${JSON.stringify(message)}\n`);
  }

  close(): void {
    this.#stream.destroy();
  }

  get handshakeHash(): Uint8Array {
    return this.#stream.handshakeHash;
  }

  /** From here on the connection is a stream again, starting with what came after the last line read. */
  release(): PeerStream & { handshakeHash: Uint8Array; isInitiator: boolean } {
    this.#released = true;
    const stream = this.#stream;
    return {
      handshakeHash: stream.handshakeHash,
      isInitiator: stream.isInitiator,
      write: (text) => stream.write(text),
      destroy: () => stream.destroy(),
      on: (event, listener) => {
        if (event !== 'data') return stream.on(event, listener);
        this.#forward = listener;
        queueMicrotask(() => {
          const rest = this.#buffer;
          this.#buffer = '';
          if (rest) listener(rest);
        });
      },
    };
  }
}

export class StorageClient {
  readonly #channel: LineChannel;
  #waiting: Array<{ resolve(answer: Record<string, unknown>): void; reject(error: Error): void }> = [];

  private constructor(stream: Awaited<ReturnType<typeof wsPeerStream>>) {
    this.#channel = new LineChannel(stream, (line) => this.#answer(line), 1024 * 1024);
    stream.on('close', () => {
      for (const waiting of this.#waiting.splice(0)) waiting.reject(new Error('the storage node closed the connection'));
    });
  }

  static async connect(socket: TextSocket): Promise<StorageClient> {
    return new StorageClient(await wsPeerStream(socket, true));
  }

  #answer(line: string): void {
    const waiting = this.#waiting.shift();
    if (!waiting) return;
    const answer = JSON.parse(line) as Record<string, unknown>;
    if (answer.t === 'ok') waiting.resolve(answer);
    else waiting.reject(new Error(typeof answer.why === 'string' ? answer.why : 'the storage node said no'));
  }

  #ask(message: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.#waiting.push({ resolve, reject });
      this.#channel.send(message);
    });
  }

  #proof(account: SigningIdentity): { id: Did; sig: string } {
    return { id: account.did, sig: b64u.encode(sign(signinMessage(this.#channel.handshakeHash), account.keys.secretKey)) };
  }

  #planProof(identity: SigningIdentity): { id: Did; sig: string } {
    return { id: identity.did, sig: b64u.encode(sign(planMessage(this.#channel.handshakeHash), identity.keys.secretKey)) };
  }

  /** Put an onboarding link's plan, as its creator; the node answers with its code. */
  async putPlan(identity: SigningIdentity, plan: PutPlan): Promise<string> {
    return (await this.#ask({ t: 'plan.put', ...this.#planProof(identity), ...plan })).code as string;
  }

  /** A link's sealed plan and who made it; refused once the link no longer works. */
  async getPlan(code: string): Promise<{ sealed: string; by: Did }> {
    const { sealed, by } = await this.#ask({ t: 'plan.get', code });
    return { sealed: sealed as string, by: by as Did };
  }

  /** Use a link (with the key's check); `account`: one is needed, and its invitation comes back. */
  async takePlan(code: string, check: string, account: boolean): Promise<{ invite?: string }> {
    const { invite } = await this.#ask({ t: 'plan.take', code, check, account });
    return typeof invite === 'string' ? { invite } : {};
  }

  /** Leave a box for a link's creator (with the key's check): for a link to a person, which shares no space. */
  async helloPlan(code: string, check: string, box: string): Promise<void> {
    await this.#ask({ t: 'plan.hello', code, check, box });
  }

  /** The boxes left at one of your links. */
  async planHellos(identity: SigningIdentity, code: string): Promise<string[]> {
    return (await this.#ask({ t: 'plan.hellos', ...this.#planProof(identity), code })).hellos as string[];
  }

  async revokePlan(identity: SigningIdentity, code: string): Promise<void> {
    await this.#ask({ t: 'plan.revoke', ...this.#planProof(identity), code });
  }

  async listPlans(identity: SigningIdentity): Promise<PlanListing[]> {
    return (await this.#ask({ t: 'plan.list', ...this.#planProof(identity) })).plans as PlanListing[];
  }

  /** The sealed box this token opens, if there is one. */
  async open(token: Uint8Array): Promise<string | undefined> {
    return (await this.#ask({ t: 'open', token: b64u.encode(token) })).data as string | undefined;
  }

  async register(account: SigningIdentity, invite: string): Promise<void> {
    await this.#ask({ t: 'register', ...this.#proof(account), invite });
  }

  async signIn(account: SigningIdentity): Promise<void> {
    await this.#ask({ t: 'signin', ...this.#proof(account) });
  }

  async hold(spaces: HeldByNode[]): Promise<void> {
    await this.#ask({ t: 'hold', spaces: spaces.map((s) => ({ space: s.space, auths: s.auths.map((a) => b64u.encode(a)), topics: s.topics, ...(s.looks?.length ? { looks: s.looks } : {}), ...(s.proof ? { proof: true } : {}) })) });
  }

  async putBox(token: Uint8Array, data: string): Promise<void> {
    await this.#ask({ t: 'box', token: b64u.encode(token), data });
  }

  async removeBox(token: Uint8Array): Promise<void> {
    await this.#ask({ t: 'unbox', token: b64u.encode(token) });
  }

  /** A ticket for the storage node's relay (/dht?ticket=…): good once, for a minute, for the account signed in here; with `hours`, again and again for that long. */
  async relayTicket(hours?: number): Promise<string> {
    return (await this.#ask({ t: 'relay', ...(hours ? { hours } : {}) })).ticket as string;
  }

  async usage(): Promise<StorageUsage> {
    const { used, quota, over } = await this.#ask({ t: 'usage' });
    return { used: used as number, quota: quota as number, ...(over ? { over: true } : {}) };
  }

  async deleteAccount(): Promise<void> {
    await this.#ask({ t: 'delete' });
  }

  /** The connection becomes a sync session with the storage node. */
  async sync(replica: Replica, access: SpaceAccess, blobs?: BlobSource): Promise<PeerSession2> {
    this.#channel.lastLine();
    await this.#ask({ t: 'sync' }).catch((error: Error) => {
      this.#channel.goOn();
      throw error;
    });
    return new PeerSession2(replica, this.#channel.release(), { access, blobs });
  }

  close(): void {
    this.#channel.close();
  }
}
