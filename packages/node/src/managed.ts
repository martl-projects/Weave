import { hkdfSync } from 'node:crypto';
import { join as joinPath } from 'node:path';
import { type Did, type Json, KIND_KMS, KIND_MANAGED, KIND_SEALED, type ManagedSetting, type WeaveRecord, b64u, currentEpoch, isDid, open, openIn, randomBytes, rekey, seal, sealFor, spaceScope } from '@weave/core';
import { type SpaceInfo } from './backend.ts';
import { type KeyProvider, type ProviderSpec, type VaultCredentials, envCredentials, providerFor } from './keyproviders.ts';
import { type StoredSpace } from './spacestore.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';
import type { SpaceKind, SpaceState } from '@weave/core';
import type { WeaveNode } from './node.ts';

/*
 * Managed spaces (stage 6): a company's key service holds half of each epoch's
 * key. This keeps the company halves (read from the space's events, wrapped,
 * published), unlocks them, and gives sealing and opening with the keys of both
 * halves while unlocked (cipher). It sees the node's internals only through
 * ManagedCore; the node delegates the Backend methods to it.
 */

/** A space's managed setting and its wrapped company halves, by epoch and by who published them. */
interface ManagedRaw {
  setting?: ManagedSetting;
  parts: Map<number, Map<Did, string>>;
}

/** What ManagedKeys needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface ManagedCore {
  /** Decoded views go stale: keys came or went. */
  invalidateDecoded(): void;
  delegated(scope: string): Promise<string | undefined>;
  held(state: SpaceState): boolean;
  rotateKey(space: StoredSpace): void;
  saveSpace(space: StoredSpace): void;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  spaceInfo(space: StoredSpace): SpaceInfo;
  readonly spaces: Map<string, StoredSpace>;
  ssoToken(): string | undefined;
  state(space: StoredSpace): SpaceState;
}

export class ManagedKeys {
  private readonly node: WeaveNode;
  private readonly core: ManagedCore;

  constructor(node: WeaveNode, core: ManagedCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- managed spaces (stage 6)

  /** How this node signs in to key services: a token, or the person's SSO token (see #ssoToken). Set by the app or by tests. */
  kmsCredentials?: VaultCredentials;
  /** Unlocked epoch keys of managed spaces, in memory: `space:epoch` → key, until when. */
  #managedKeys = new Map<string, { key: string; until: number }>();
  /** Unlocks in flight, per space: a second asker waits for the first. */
  #unlocking = new Map<string, Promise<number>>();
  managedProblems = new Map<string, string>();

  provider(setting: ManagedSetting): KeyProvider {
    // A company's node signs in to its key service with a Vault token or an Azure app's secret (or token), from its environment;
    // people sign in with their company account.
    const env = process.env;
    return providerFor(
      setting.provider as unknown as ProviderSpec,
      this.node.home,
      this.kmsCredentials ?? {
        ...envCredentials(env),
        idToken: () => this.core.ssoToken(),
        delegated: (scope) => this.core.delegated(scope),
      },
    );
  }
  /** Per space, its managed setting and halves: built once, kept up to date as events come, dropped when its keys change. */
  rawCache = new Map<string, ManagedRaw>();

  /**
   * A space's managed setting and wrapped company halves, read straight from
   * its events with the Weave half alone (that's how they're sealed): what
   * unlocks a space can't need the space unlocked, nor decoding, which needs
   * this. Kept until the next event arrives.
   */
  managedRaw(space: StoredSpace): ManagedRaw {
    const kept = this.rawCache.get(space.id);
    if (kept) return kept;
    const scope = spaceScope(space);
    const out: ManagedRaw = { parts: new Map() };
    for (const r of this.node.replica.events((e) => e.scope === scope && e.kind === KIND_SEALED && !e.missing)) this.takeRaw(space, out, r);
    this.rawCache.set(space.id, out);
    return out;
  }

  /** One event of a space, for its managed setting and halves (only those sealed with the Weave half open here). */
  takeRaw(space: StoredSpace, into: ManagedRaw, r: WeaveRecord): boolean {
    const inner = openIn(space, r);
    if (!inner || (inner.kind !== KIND_MANAGED && inner.kind !== KIND_KMS)) return false;
    const b = inner.body as Record<string, unknown> | null;
    if (inner.kind === KIND_MANAGED && r.author === space.founder && b?.provider && Number(b.ttlMinutes) > 0 && Number(b.graceHours) >= 0 && (!into.setting || r.time >= into.setting.time))
      into.setting = { provider: b.provider as Json, ttlMinutes: Number(b.ttlMinutes), graceHours: Number(b.graceHours), ...(isDid(b.attestor) ? { attestor: b.attestor } : {}), ...(typeof b.company === 'string' ? { company: b.company } : {}), ...(Number.isSafeInteger(b.from) ? { from: b.from as number } : {}), by: r.author, time: r.time };
    if (inner.kind === KIND_KMS && Number.isSafeInteger(b?.epoch) && typeof b?.wrapped === 'string') {
      // Every author's part kept apart: which counts is decided by whose rekey we seal with (#kmsParts).
      let byAuthor = into.parts.get(b.epoch as number);
      if (!byAuthor) into.parts.set(b.epoch as number, (byAuthor = new Map()));
      if (!byAuthor.has(r.author)) byAuthor.set(r.author, b.wrapped);
    }
    return true;
  }

  /**
   * Each epoch's company half (WUCPqIBs): the one by whoever made the rekey we
   * seal with, else the owner's, else the first. A part from anyone else (any
   * member can seal one with the Weave half) never stands in for it.
   */
  #kmsParts(space: StoredSpace): Map<number, string> {
    const out = new Map<number, string>();
    for (const [epoch, byAuthor] of this.managedRaw(space).parts) {
      const rekeyer = space.rekeyers?.[String(epoch)];
      const part = rekeyer ? byAuthor.get(rekeyer) : (byAuthor.get(space.founder) ?? byAuthor.values().next().value);
      if (part) out.set(epoch, part);
    }
    return out;
  }

  /** One epoch's key, from both halves. */
  #splitKey(space: StoredSpace, epoch: number, weavePart: string, kmsPart: Uint8Array): string {
    const info = `weave/managed-epoch/v1:${space.id}:${epoch}`;
    return b64u.encode(new Uint8Array(hkdfSync('sha256', Buffer.concat([b64u.decode(weavePart), kmsPart]), Buffer.alloc(0), info, 32)));
  }

  /** On disk while offline grace allows (sealed at rest): `space:epoch` → key, until. */
  #graceCache(): Record<string, { key: string; until: number }> {
    return readSecretJson<Record<string, { key: string; until: number }>>(this.node.home, joinPath(this.node.home.dir, 'managed-keys.json')) ?? {};
  }

  #remember(space: StoredSpace, setting: ManagedSetting, epoch: number, key: string): void {
    const now = this.node.clock();
    this.#managedKeys.set(`${space.id}:${epoch}`, { key, until: now + setting.ttlMinutes * 60_000 });
    if (setting.graceHours > 0) {
      const cache = this.#graceCache();
      cache[`${space.id}:${epoch}`] = { key, until: now + setting.graceHours * 3_600_000 };
      writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'managed-keys.json'), cache);
    }
  }

  /**
   * A space as sealing and opening see it: for a managed space, the epochs
   * with a company half carry the key made of both halves, while unlocked
   * (in memory for the TTL, or on disk within the offline grace); locked ones
   * are left out, so nothing can be read or written with them.
   */
  cipher(space: StoredSpace): StoredSpace {
    const setting = this.managedRaw(space).setting;
    if (!setting) return space;
    const parts = this.#kmsParts(space);
    const now = this.node.clock();
    const grace = parts.size ? this.#graceCache() : {};
    const keys: Record<string, string> = {};
    let locked = false;
    // From which epoch on the company's half is needed (yHsKySEi): the setting says, or (settings from before) the first epoch with one.
    const from = setting.from ?? (parts.size ? Math.min(...parts.keys()) : Infinity);
    for (const [epoch, weavePart] of Object.entries(space.keys)) {
      const id = `${space.id}:${epoch}`;
      const memory = this.#managedKeys.get(id);
      if (memory && memory.until > now) {
        keys[epoch] = memory.key;
        this.decodedValidUntil = Math.min(this.decodedValidUntil, Math.max(memory.until, grace[id]?.until ?? 0));
      } else if (parts.has(Number(epoch))) {
        if (grace[id] && grace[id].until > now) {
          keys[epoch] = grace[id].key;
          this.decodedValidUntil = Math.min(this.decodedValidUntil, grace[id].until);
        } else locked = true;
      } else if (!memory && Number(epoch) < from) keys[epoch] = weavePart; // from before the space was managed
      else locked = true;
    }
    if (locked) void this.unlock(space);
    // The newest epoch locked: it stays the newest, without a key, so writing waits for it (sealFor refuses) instead of using an older one.
    const newest = String(currentEpoch(space));
    if (!(newest in keys)) keys[newest] = undefined as unknown as string;
    return { ...space, keys };
  }

  /** A space's keys to write with: a managed space's newest epoch unlocked first, if it can be (else sealFor refuses to write). */
  async cipherReady(space: StoredSpace): Promise<StoredSpace> {
    const cipher = this.cipher(space);
    if (cipher.keys[String(currentEpoch(cipher))]) return cipher;
    await this.unlock(space);
    return this.cipher(space);
  }

  /** Unlock the company halves this node doesn't hold (or whose time ran out). */
  async unlock(space: StoredSpace): Promise<number> {
    const running = this.#unlocking.get(space.id);
    if (running) return running;
    const work = this.#unlockNow(space).finally(() => this.#unlocking.delete(space.id));
    this.#unlocking.set(space.id, work);
    return work;
  }

  /** The earliest time a managed key used by the decoded views runs out: then they decode again, without it. */
  decodedValidUntil = Infinity;

  async #unlockNow(space: StoredSpace): Promise<number> {
    const setting = this.managedRaw(space).setting;
    if (!setting) return 0;
    let unlocked = 0;
    let problem: string | undefined;
    try {
      const provider = this.provider(setting);
      const now = this.node.clock();
      for (const [epoch, wrapped] of this.#kmsParts(space)) {
        const weavePart = space.keys[String(epoch)];
        const kept = this.#managedKeys.get(`${space.id}:${epoch}`);
        if (!weavePart || (kept && kept.until > now)) continue;
        // Each epoch on its own: one that can't be unwrapped doesn't keep the others locked (WUCPqIBs).
        try {
          const kmsPart = await provider.unwrap(wrapped, { space: spaceScope(space), epoch });
          this.#remember(space, setting, epoch, this.#splitKey(space, epoch, weavePart, kmsPart));
          unlocked++;
        } catch (error) {
          problem = `key ${epoch}: ${(error as Error).message}`;
        }
      }
    } catch (error) {
      problem = (error as Error).message;
    }
    if (problem) this.managedProblems.set(space.id, problem);
    else this.managedProblems.delete(space.id);
    if (unlocked) this.core.invalidateDecoded();
    return unlocked;
  }

  /** After a rekey in a managed space: a fresh company half, wrapped by the provider and published. */
  afterRekey(space: StoredSpace, epoch: number, weavePart: string): void {
    const setting = this.managedRaw(space).setting;
    if (!setting) return;
    const kmsPart = new Uint8Array(randomBytes(32));
    (space.rekeyers ??= {})[String(epoch)] = this.node.identity.author;
    this.core.saveSpace(space);
    this.#remember(space, setting, epoch, this.#splitKey(space, epoch, weavePart, kmsPart));
    this.halves.set(`${space.id}:${epoch}`, { space, epoch, kmsPart });
    this.#saveHalves();
    void this.publishHalf(`${space.id}:${epoch}`);
  }

  /**
   * Halves not published yet, kept on disk (sealed at rest) so that a restart
   * doesn't lose them (AsPMzM8O): without its half nobody else ever reads that
   * epoch, and after the grace not even we.
   */
  #saveHalves(): void {
    const file = joinPath(this.node.home.dir, 'managed-halves.json');
    const out: Record<string, { space: string; epoch: number; kmsPart: string }> = {};
    for (const [id, h] of this.halves) out[id] = { space: h.space.id, epoch: h.epoch, kmsPart: b64u.encode(h.kmsPart) };
    writeSecretJson(this.node.home, file, out);
  }

  loadHalves(): void {
    const saved = readSecretJson<Record<string, { space: string; epoch: number; kmsPart: string }>>(this.node.home, joinPath(this.node.home.dir, 'managed-halves.json')) ?? {};
    for (const [id, h] of Object.entries(saved)) {
      const space = this.core.spaces.get(h.space);
      const setting = space && this.managedRaw(space).setting;
      const weavePart = space?.keys[String(h.epoch)];
      if (!space || !setting || !weavePart) continue;
      const kmsPart = b64u.decode(h.kmsPart);
      this.halves.set(id, { space, epoch: h.epoch, kmsPart });
      // Ours to read with meanwhile, as before the restart.
      if (!this.#managedKeys.has(id)) this.#remember(space, setting, h.epoch, this.#splitKey(space, h.epoch, weavePart, kmsPart));
    }
  }

  /** Company halves wrapped and published in the background; kept until published, and tried again on reconcile. */
  halves = new Map<string, { space: StoredSpace; epoch: number; kmsPart: Uint8Array; publishing?: Promise<void> }>();

  publishHalf(id: string): Promise<void> {
    const half = this.halves.get(id);
    if (!half) return Promise.resolve();
    half.publishing ??= (async () => {
      const { space, epoch, kmsPart } = half;
      try {
        const setting = this.managedRaw(space).setting!;
        const wrapped = await this.provider(setting).wrap(kmsPart, { space: spaceScope(space), epoch });
        this.node.replica.write(this.node.identity, sealFor(space, { kind: KIND_KMS, body: { epoch, wrapped } }));
        this.halves.delete(id);
        this.#saveHalves();
      } catch (error) {
        this.managedProblems.set(space.id, `couldn't wrap the new key: ${(error as Error).message}`);
      } finally {
        half.publishing = undefined;
      }
    })();
    return half.publishing;
  }
  async manageSpace(input: { space: string; provider: ProviderSpec; ttlMinutes?: number; graceHours?: number; attestor?: string; company?: string }): Promise<SpaceInfo> {
    const space = this.core.space(input.space);
    const state = this.core.state(space);
    if (space.kind === 'direct') throw new Error('a direct chat belongs to two people, not a company');
    if (state.founder !== this.node.identity.author) throw new Error(`only the owner of ${space.name} puts its keys under a company's key service`);
    const setting: ManagedSetting = { provider: input.provider as unknown as Json, ttlMinutes: input.ttlMinutes ?? 15, graceHours: input.graceHours ?? 8, by: this.node.identity.author, time: new Date().toISOString() };
    // Check the provider works before anything depends on it.
    const probe = new Uint8Array(randomBytes(32));
    const back = await this.provider(setting).unwrap(await this.provider(setting).wrap(probe, { space: spaceScope(space), epoch: -1 }), { space: spaceScope(space), epoch: -1 });
    if (b64u.encode(back) !== b64u.encode(probe)) throw new Error('the key service gave back something else');
    const attestor = input.attestor ? this.node.resolve(input.attestor) : undefined;
    this.node.replica.write(this.node.identity, sealFor(space, { kind: KIND_MANAGED, body: { provider: setting.provider, ttlMinutes: setting.ttlMinutes, graceHours: setting.graceHours, ...(attestor ? { attestor } : {}), ...(input.company ? { company: input.company } : {}), from: currentEpoch(space) + 1 } }));
    // From the next key on, half of it is the company's.
    this.core.rotateKey(space);
    return this.core.spaceInfo(space);
  }

  async unlockSpace(ref: string): Promise<SpaceInfo> {
    const space = this.core.space(ref);
    await this.unlock(space);
    const problem = this.managedProblems.get(space.id);
    if (problem) throw new Error(problem);
    return this.core.spaceInfo(space);
  }

  async destroyCompanyKey(ref: string): Promise<void> {
    const space = this.core.space(ref);
    const state = this.core.state(space);
    if (!state.managed) throw new Error(`${space.name} isn't under a company's key service`);
    if (state.founder !== this.node.identity.author) throw new Error(`only the owner of ${space.name} destroys its company key`);
    if (this.core.held(state)) throw new Error(`${space.name} is on legal hold until ${state.hold!.until.slice(0, 10)}: its company key stays`);
    await this.provider(state.managed).destroy();
    for (const id of [...this.#managedKeys.keys()]) if (id.startsWith(`${space.id}:`)) this.#managedKeys.delete(id);
    const cache = this.#graceCache();
    for (const id of Object.keys(cache)) if (id.startsWith(`${space.id}:`)) delete cache[id];
    writeSecretJson(this.node.home, joinPath(this.node.home.dir, 'managed-keys.json'), cache);
    this.core.invalidateDecoded();
  }
  managedInfo(space: StoredSpace, setting: ManagedSetting): NonNullable<SpaceInfo['managed']> {
    const spec = setting.provider as unknown as ProviderSpec;
    const current = this.cipher(space).keys[String(currentEpoch(space))] !== undefined;
    const problem = this.managedProblems.get(space.id);
    return {
      agents: [...(this.core.state(space).approvedAgents ?? [])].map((did) => {
        const grant = this.node.replica.authority.grant(did);
        return grant ? `${this.node.nameOf(grant.author) ?? grant.author}/${grant.name ?? did.slice(8, 16)}` : did;
      }),
      provider: spec.kind === 'vault' ? `Vault at ${spec.address} (${spec.key})` : spec.kind === 'azure' ? `Azure Key Vault ${spec.vault} (${spec.key})` : spec.kind === 'aws' || spec.kind === 'gcp' ? providerFor(spec, this.node.home, {}).describe().keyRef : spec.kind,
      unlocked: current,
      ttlMinutes: setting.ttlMinutes,
      graceHours: setting.graceHours,
      ...(setting.attestor ? { attestor: setting.attestor } : {}),
      ...(problem ? { problem } : {}),
    };
  }
}
