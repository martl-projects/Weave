import { type AppManifest, type BoardLens, type CarriedFile, type Did, type Json, type LensChannel, KIND_ADMIT, KIND_APP, KIND_ARTIFACT_MIRROR, KIND_INVITE, KIND_KNOCK, KIND_KNOCK_HANDLED, KIND_KNOCK_PENDING, KIND_SERVING, type WeaveRecord, artifactsOf, decodeKnock, encodeKnock, gift, guestNote, guestsOf, inviteKeys, mirrorsOf, openGuestNote, openKnock, knockFor, KIND_LENS_GUEST, sealFor, spaceScope, type GuestNote } from '@weave/core';
import type { MembershipCore } from './membership.ts';
import type { WeaveNode } from './node.ts';
import type { StoredSpace } from './spacestore.ts';

/*
 * Release channels (the Fotobuch guests): a project's lens is pinned to a board elsewhere, and whoever reads that
 * board gets the lens's releases straight from the project, checked against what its maintainers signed, without
 * joining it.
 *
 * - The channel is a space of the project's own (`releasesOf`), whose members are the project's maintainers, held for
 *   others by them alone (serving: maintainers): its guests find only them at its meeting points, never one another.
 * - The maintainers' nodes publish each lens release of the project there again (the same manifest), with a mirror of
 *   its file as blobs: once per release, however many guests there are.
 * - A board the lens is pinned to carries the channel (LensChannel): its keys, its meeting point, a reader link.
 * - A guest's node holds the channel to read only (StoredSpace.reader), writes nothing in it, and knocks once with the
 *   link: boxed to the maintainer who made it, who alone learns who it is.
 * - That maintainer's node lets the guest in by itself (unless they said to ask first): a note in the project, boxed
 *   to its maintainers (lensguests.ts). Only now do the maintainers give the guest the channel (sync protocol 4 gives
 *   a space to its members otherwise); a note that takes the guest off ends that, without a new key.
 */

/** A maintainer's choice per channel: let guests in as they knock (the default), or ask first. Sealed to themselves. */
export const KIND_GUEST_MODE = 'weave.lens.guests.mode';

/** How long a channel's reader link lasts: as long as the boards that carry it. */
const READER_LINK_DAYS = 3650;

export interface GuestInfo {
  did: Did;
  name?: string;
  on: boolean;
  at: string;
}

export interface ChannelsHost {
  /** A release file of the project, fetched and checked here once, kept as blobs to mirror in the channel. */
  carry(a: { project: string; id: string; tag: string; manifest: AppManifest }, platform: string): Promise<CarriedFile & { sha256?: string }>;
}

export class Channels {
  private readonly node: WeaveNode;
  private readonly core: MembershipCore;
  private readonly host: () => ChannelsHost;

  constructor(node: WeaveNode, core: MembershipCore, host: () => ChannelsHost) {
    this.node = node;
    this.core = core;
    this.host = host;
  }

  get #kernel() {
    return this.core.kernel;
  }

  get #me(): Did {
    return this.node.identity.author;
  }

  /** The project's release channel this node holds as one of its maintainers, if there is one. */
  channelOf(projectId: string): StoredSpace | undefined {
    return [...this.core.spaces.values()].find((s) => !s.reader && s.kind === 'project' && this.#kernel.state(s).releasesOf === projectId && this.#kernel.state(s).members.has(this.#me));
  }

  /** The release channel a guest's node reads for a lens's project, if it holds one. */
  readerChannel(lens: BoardLens): StoredSpace | undefined {
    const id = lens.channel?.space.id;
    return id ? this.core.spaces.get(id) : undefined;
  }

  /**
   * The project's release channel, made now if there is none: by one of its maintainers, held for others by its
   * maintainers alone. Its name says whose releases it holds.
   */
  async ensure(project: StoredSpace): Promise<StoredSpace> {
    const have = this.channelOf(project.id);
    if (have) return have;
    if (!this.#kernel.state(project).maintainers.has(this.#me)) throw new Error(`only the maintainers of ${project.name} hand out its releases to guests`);
    const channel = await this.#kernel.createSpace('project', `${this.#kernel.spaceName(project)} · Releases`, { releasesOf: project.id });
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(channel), { kind: KIND_SERVING, body: { who: 'maintainers' } }));
    return channel;
  }

  /**
   * What a board carries along with the lens of a project of ours: the channel's keys, its meeting point and our reader
   * link (made once, kept as long as boards last).
   */
  async forBoard(project: StoredSpace): Promise<LensChannel> {
    const channel = await this.ensure(project);
    await this.restate(project, channel);
    const knock = this.#readerLink(channel) ?? this.#makeReaderLink(channel);
    const keys = this.#kernel.keysForNewcomers(channel);
    return { space: { ...keys, kind: 'project', name: channel.name, founder: channel.founder } as unknown as LensChannel['space'], entry: this.#kernel.entryPoint() as unknown as LensChannel['entry'], knock };
  }

  /** Our live reader link to a channel, again (the invite is in the channel, its secret part isn't needed to knock). */
  #readerLink(channel: StoredSpace): string | undefined {
    const now = new Date(this.node.clock()).toISOString();
    const invite = this.#kernel
      .entries(channel)
      .filter((e) => e.kind === KIND_INVITE && e.event.author === this.#me)
      .map((e) => e.body as { invite?: unknown; expires?: unknown; accept?: unknown; reader?: unknown })
      .find((b) => b.reader === true && b.accept === true && typeof b.invite === 'string' && typeof b.expires === 'string' && b.expires > now);
    if (!invite) return undefined;
    return this.#knockLink(channel, String(invite.invite), String(invite.expires));
  }

  #makeReaderLink(channel: StoredSpace): string {
    const { invite } = inviteKeys();
    const expires = new Date(this.node.clock() + READER_LINK_DAYS * 24 * 3600_000).toISOString();
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(channel), { kind: KIND_INVITE, body: { invite, expires, accept: true, reader: true } }));
    return this.#knockLink(channel, invite, expires);
  }

  #knockLink(channel: StoredSpace, invite: string, expires: string): string {
    return encodeKnock({
      v: 1,
      space: { kind: 'project', id: channel.id, name: channel.name, founder: channel.founder },
      invite,
      inviter: this.#me,
      enc: this.core.encryptionKeyOf(this.#me),
      expires,
      entry: this.#kernel.entryPoint(),
    });
  }

  /**
   * The project's lens releases again in its channel, each once (the same manifest, which names the same file and
   * SHA-256), each with a mirror of its file as blobs, so guests need neither its provider nor to be in the project.
   * Also lets the project's other maintainers into the channel, so they give it to guests too. What changed.
   */
  async restate(project: StoredSpace, channel: StoredSpace): Promise<number> {
    const pState = this.#kernel.state(project);
    const cState = this.#kernel.state(channel);
    if (!pState.maintainers.has(this.#me) || !cState.maintainers.has(this.#me)) return 0;
    let changed = 0;
    // The project's maintainers are the channel's.
    for (const did of pState.maintainers) {
      if (did === this.#me || this.#kernel.state(channel).members.has(did)) continue;
      this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(channel), { kind: KIND_ADMIT, body: { member: did } }));
      this.node.replica.write(this.node.identity, gift(this.#kernel.keysForNewcomers(channel) as never, [did], spaceScope(this.#kernel.direct(did)), this.#kernel.entryPoint(), this.core.encryptionKeyOf));
      changed++;
    }
    for (const did of pState.maintainers) {
      const now = this.#kernel.state(channel);
      if (did === this.#me || !now.members.has(did) || now.maintainers.has(did)) continue;
      this.#kernel.appoint(channel, did, true);
      changed++;
    }
    const theirs = artifactsOf(this.#kernel.entries(project), pState.maintainers).filter((a) => a.manifest.client && a.manifest.install?.assets?.wasm);
    for (const a of theirs) {
      const wasm = a.manifest.install!.assets!.wasm!;
      let here = this.#restated(channel, a.manifest.app, a.tag, wasm.sha256);
      if (!here) {
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(channel), { kind: KIND_APP, body: a.manifest as unknown as Json }));
        here = this.#restated(channel, a.manifest.app, a.tag, wasm.sha256);
        changed++;
      }
      if (!here) continue;
      const members = this.#kernel.state(channel).members;
      if (wasm.parts?.length || mirrorsOf(this.#kernel.entries(channel), (did) => members.has(did), here.id, 'wasm').some((m) => m.sha256 === wasm.sha256)) continue;
      try {
        const kept = await this.host().carry({ project: project.id, id: a.id, tag: a.tag, manifest: a.manifest }, 'wasm');
        this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(channel), { kind: KIND_ARTIFACT_MIRROR, body: { release: here.id, platform: 'wasm', file: wasm.file, size: kept.size, sha256: wasm.sha256, parts: kept.parts } as unknown as Json }));
        changed++;
      } catch {
        // Its provider or file isn't reachable now: the next round tries again.
      }
    }
    return changed;
  }

  /** The channel's release of this lens version (same app, tag and file), as its maintainers published it there. */
  #restated(channel: StoredSpace, app: string, tag: string, sha256: string): { id: string; author: Did } | undefined {
    const state = this.#kernel.state(channel);
    const found = artifactsOf(this.#kernel.entries(channel), state.maintainers).find((x) => x.manifest.app === app && x.tag === tag && x.manifest.install?.assets?.wasm?.sha256 === sha256);
    return found ? { id: found.id, author: found.author } : undefined;
  }

  /**
   * For a lens a board here shows: its release in the channel, if the channel holds the very file the board names
   * (the official version, signed by a maintainer of its project); undefined while it doesn't (yet).
   */
  official(lens: BoardLens): { channel: StoredSpace; release: string; by: Did } | undefined {
    const wasm = lens.manifest.install?.assets?.wasm;
    if (!wasm) return undefined;
    const channel = this.readerChannel(lens) ?? this.channelOf(lens.origin.project);
    if (!channel) return undefined;
    const found = this.#restated(channel, lens.app, lens.tag, wasm.sha256);
    return found ? { channel, release: found.id, by: found.author } : undefined;
  }

  /**
   * Every round, on a guest's side: the channels of the lenses on boards here whose projects we aren't in, held to
   * read, and knocked at once. On a maintainer's side: the project's releases restated, knocks answered.
   */
  async duties(): Promise<number> {
    let changed = 0;
    for (const space of [...this.core.spaces.values()]) {
      if (space.reader || space.kind === 'direct' || this.#kernel.directs.has(space.id)) continue;
      const state = this.#kernel.state(space);
      if (!state.members.has(this.#me)) continue;
      // A channel of ours: its project's releases in it.
      if (state.releasesOf) {
        const project = this.core.spaces.get(state.releasesOf);
        if (project && !project.reader) changed += await this.restate(project, space);
        continue;
      }
      for (const board of this.#kernel.spacePosts(space).boards) {
        const lens = board.lens;
        if (!lens?.channel) continue;
        const project = this.core.spaces.get(lens.origin.project);
        if (project && !project.reader && this.#kernel.state(project).members.has(this.#me)) continue;
        changed += await this.#read(lens.channel);
      }
    }
    changed += this.#answerKnocks();
    return changed;
  }

  /** Hold a channel to read and knock once (a guest). */
  async #read(channel: LensChannel): Promise<number> {
    if (this.core.spaces.has(channel.space.id)) return 0;
    let link;
    try {
      link = decodeKnock(channel.knock);
    } catch {
      return 0;
    }
    if (link.space.id !== channel.space.id || link.inviter === this.#me) return 0;
    try {
      this.#kernel.adoptBootstrap(link.entry);
    } catch {
      return 0;
    }
    const space: StoredSpace = { ...(channel.space as unknown as StoredSpace), entry: channel.entry as unknown as StoredSpace['entry'], via: link.inviter, reader: true };
    await this.#kernel.addSpace(space);
    for (const topic of new Set(link.entry.topics)) await this.node.join(topic);
    this.node.replica.write(this.node.identity, this.#kernel.sealForSelf({ kind: KIND_KNOCK_PENDING, body: { space: link.space.id, inviter: link.inviter, reader: true, ...(link.entry.meet ? { meet: link.entry.meet } : {}) } }));
    this.node.replica.write(this.node.identity, knockFor(link, '', this.#kernel.entryPoint()));
    return 1;
  }

  /** Is this a knock with one of our live reader links (a guest asking for a channel's releases)? */
  readerKnock(event: WeaveRecord): { id: string; channel: StoredSpace; did: Did } | undefined {
    if (event.kind !== KIND_KNOCK || event.author === this.#me) return undefined;
    const opened = this.core.tryOpen((me) => openKnock(event, me));
    const channel = opened && this.core.spaces.get(opened.space);
    if (!opened || !channel || channel.reader || !this.#kernel.state(channel).releasesOf) return undefined;
    const now = new Date(this.node.clock()).toISOString();
    const reader = this.#kernel.entries(channel).some((e) => {
      const b = e.body as { invite?: unknown; reader?: unknown; expires?: unknown } | null;
      return e.kind === KIND_INVITE && e.event.author === this.#me && b?.invite === opened.invite && b.reader === true && String(b.expires) >= now;
    });
    return reader ? { id: event.id, channel, did: event.author } : undefined;
  }

  /** Knocks at our reader links, let in at once where we didn't say to ask first. What changed. */
  #answerKnocks(): number {
    const handled = new Set(this.core.selfBodies(KIND_KNOCK_HANDLED).map((b) => b.knock));
    let changed = 0;
    for (const event of this.node.replica.events((e) => e.kind === KIND_KNOCK && e.author !== this.#me)) {
      if (handled.has(event.id)) continue;
      const knock = this.readerKnock(event);
      if (!knock || this.asksFirst(knock.channel)) continue;
      this.letIn(knock.channel, knock.did, true);
      this.node.replica.write(this.node.identity, this.#kernel.sealForSelf({ kind: KIND_KNOCK_HANDLED, body: { knock: event.id } }));
      changed++;
    }
    return changed;
  }

  /** Do we ask before letting a channel's guests in (our choice, on our devices)? */
  asksFirst(channel: StoredSpace): boolean {
    const latest = this.core.selfBodies(KIND_GUEST_MODE).filter((b) => b.channel === channel.id).at(-1);
    return latest?.ask === true;
  }

  setAsksFirst(projectId: string, ask: boolean): void {
    const channel = this.channelOf(projectId);
    if (!channel) throw new Error('this project hands out no releases to guests yet');
    if (this.asksFirst(channel) !== ask) this.node.replica.write(this.node.identity, this.#kernel.sealForSelf({ kind: KIND_GUEST_MODE, body: { channel: channel.id, ask } }));
  }

  /** Let a guest in, or take them off: a note in the project, boxed to its maintainers. */
  letIn(channel: StoredSpace, did: Did, on: boolean): void {
    const projectId = this.#kernel.state(channel).releasesOf;
    const project = projectId ? this.core.spaces.get(projectId) : undefined;
    if (!project) throw new Error('not a release channel of a project here');
    const maintainers = [...this.#kernel.state(project).maintainers];
    if (!maintainers.includes(this.#me)) throw new Error(`only the maintainers of ${project.name} decide who gets its releases`);
    const name = this.node.nameOf(did);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(project), guestNote({ channel: channel.id, did, on, at: new Date(this.node.clock()).toISOString(), ...(name ? { name } : {}) }, maintainers, this.core.encryptionKeyOf)));
  }

  /** A project's guests, as its maintainers' notes say (let in or taken off), newest first. */
  guests(projectId: string): GuestInfo[] {
    const channel = this.channelOf(projectId);
    const project = this.core.spaces.get(projectId);
    if (!channel || !project) return [];
    const maintainers = this.#kernel.state(project).maintainers;
    const notes: GuestNote[] = this.#kernel
      .entries(project)
      .filter((e) => e.kind === KIND_LENS_GUEST && maintainers.has(e.event.author))
      .flatMap((e) => this.core.tryOpen((me) => openGuestNote({ ...e.event, kind: e.kind, body: e.body } as never, me)) ?? []);
    return [...guestsOf(notes, channel.id).values()].map((n) => ({ did: n.did, ...(this.node.nameOf(n.did) ?? n.name ? { name: this.node.nameOf(n.did) ?? n.name } : {}), on: n.on, at: n.at })).sort((a, b) => b.at.localeCompare(a.at));
  }
}
