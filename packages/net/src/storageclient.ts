import { b64u, sign, utf8, type Did, type Replica, type SigningIdentity } from '@weave/core';
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
}

export interface StorageUsage {
  used: number;
  quota: number;
  /** Over the quota: the node stopped collecting until the account shrinks or gets more. */
  over?: boolean;
}

export const signinMessage = (handshakeHash: Uint8Array): Uint8Array => new Uint8Array([...utf8('weave/storage/signin/v1'), ...handshakeHash]);

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
    await this.#ask({ t: 'hold', spaces: spaces.map((s) => ({ space: s.space, auths: s.auths.map((a) => b64u.encode(a)), topics: s.topics })) });
  }

  async putBox(token: Uint8Array, data: string): Promise<void> {
    await this.#ask({ t: 'box', token: b64u.encode(token), data });
  }

  async removeBox(token: Uint8Array): Promise<void> {
    await this.#ask({ t: 'unbox', token: b64u.encode(token) });
  }

  async usage(): Promise<StorageUsage> {
    const { used, quota, over } = await this.#ask({ t: 'usage' });
    return { used: used as number, quota: quota as number, ...(over ? { over: true } : {}) };
  }

  async deleteAccount(): Promise<void> {
    await this.#ask({ t: 'delete' });
  }

  /** The connection becomes a sync session with the storage node. */
  async sync(replica: Replica, access: SpaceAccess): Promise<PeerSession2> {
    this.#channel.lastLine();
    await this.#ask({ t: 'sync' }).catch((error: Error) => {
      this.#channel.goOn();
      throw error;
    });
    return new PeerSession2(replica, this.#channel.release(), { access });
  }

  close(): void {
    this.#channel.close();
  }
}
