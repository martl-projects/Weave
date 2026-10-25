import type { WeaveNode } from './node.ts';
import { type StoredSpace } from './spacestore.ts';
import { b64u, type Badge, BADGE_LIMIT_MAX, BADGE_NOTE_MAX, badgeNoteHash, type BadgeSeries, badgesOf, boxTo, type Did, type Json, KIND_BADGE, KIND_BADGE_NOTE, KIND_BADGE_SERIES, KIND_BADGE_TRANSFER, mayAct, openBox, parseBadgeLimit, parseBlobRef, randomBytes, type Recipient, type SpaceState } from '@weave/core';
import { type BadgeInfo, type BadgeSeriesInfo } from './backend.ts';

/*
 * Badges: lasting recognition, checkable by anyone. A series by its issuer (in
 * public or a project), badges given from it, transfers by number, notes. It
 * sees the node's internals only through BadgesCore.
 */



/** What Badges needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface BadgesCore {
  project(ref: string): StoredSpace;
  maintainerState(project: StoredSpace): SpaceState;
  readonly encryptionKeyOf: (person: Did) => Did;
  tryOpen<T>(open: (me: Recipient) => T | undefined): T | undefined;
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
}

export class Badges {
  private readonly node: WeaveNode;
  private readonly core: BadgesCore;

  constructor(node: WeaveNode, core: BadgesCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- badges

  async createBadgeSeries(input: { project: string; name: string; symbol?: string; image?: string; description?: string; limit?: number }): Promise<BadgeSeriesInfo> {
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    const limit = input.limit === undefined ? undefined : parseBadgeLimit(input.limit);
    if (input.limit !== undefined && !limit) throw new Error(`a limit is a whole number from 1 to ${BADGE_LIMIT_MAX}`);
    const id = b64u.encode(randomBytes(16));
    this.publishBadgeSeries(id, { name: input.name, symbol: input.symbol ?? '', image: input.image ?? '', description: input.description ?? '' }, { project: { id: project.id, name: project.name }, ...(limit ? { limit } : {}) });
    return this.badgeSeriesInfo(this.badgeSeriesRef(id));
  }

  async setBadgeSeries(input: { series: string; name?: string; symbol?: string; image?: string; description?: string }): Promise<BadgeSeriesInfo> {
    const before = this.badgeSeriesRef(input.series);
    if (before.issuer !== this.node.identity.author) throw new Error(`only ${this.node.nameOf(before.issuer) ?? 'its issuer'} can change ${before.name}`);
    this.publishBadgeSeries(before.id, { name: input.name ?? before.name, symbol: input.symbol ?? before.symbol, image: input.image ?? before.image ?? '', description: input.description ?? before.description }, {});
    return this.badgeSeriesInfo(this.badgeSeriesRef(before.id));
  }

  async badgeSeries(project?: string): Promise<BadgeSeriesInfo[]> {
    const id = project === undefined ? undefined : this.core.project(project).id;
    return this.allBadges()
      .series.filter((s) => !id || s.project?.id === id)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((s) => this.badgeSeriesInfo(s));
  }

  async giveBadge(input: { series: string; who: string; note?: string; ref?: string; personal?: string }): Promise<BadgeInfo> {
    const series = this.badgeSeriesRef(input.series);
    if (series.issuer !== this.node.identity.author) throw new Error(`only ${this.node.nameOf(series.issuer) ?? 'its issuer'} can give ${series.name}`);
    if (series.broken) throw new Error(`${series.name} is broken: it has more badges than its limit, or a number twice`);
    if (series.limit && series.given >= series.limit) throw new Error(`all ${series.limit} of ${series.name} are given`);
    const to = this.node.resolve(input.who);
    const taken = new Set(this.allBadges().badges.filter((b) => b.series === series.id).map((b) => b.n));
    let n = 1;
    while (taken.has(n)) n++;
    const note = input.note?.trim().slice(0, 500) ?? '';
    const ref = input.ref?.trim().slice(0, 200) ?? '';
    // A personal note: boxed to them (and to us, to read it again); only its hash is public, so they can prove our words if they publish it.
    const text = input.personal?.trim() ?? '';
    if (text.length > BADGE_NOTE_MAX) throw new Error(`a personal note is at most ${BADGE_NOTE_MAX} characters`);
    const salt = b64u.encode(randomBytes(16));
    const personal = text
      ? { hash: badgeNoteHash(text, salt), boxes: [...new Set([to, this.node.identity.author])].map((did) => boxTo(this.core.encryptionKeyOf(did), { text, salt })) as unknown as Json[] }
      : undefined;
    const event = this.node.replica.write(this.node.identity, { kind: KIND_BADGE, body: { series: series.id, n, to, ...(note ? { note } : {}), ...(ref ? { ref } : {}), ...(personal ? { personal } : {}) } });
    return this.badgeInfo(this.badgeRef(event.id));
  }

  async badges(who?: string): Promise<BadgeInfo[]> {
    const holder = who ? this.node.resolve(who) : this.node.identity.author;
    return this.allBadges()
      .badges.filter((b) => b.holder === holder)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((b) => this.badgeInfo(b));
  }

  async transferBadge(input: { badge: string; to: string }): Promise<BadgeInfo> {
    const badge = this.badgeRef(input.badge);
    if (badge.holder !== this.node.identity.author) throw new Error("you don't hold that badge");
    if (badge.invalid) throw new Error("that badge isn't valid: its issuer gave more than the limit, or its number twice");
    const to = this.node.resolve(input.to);
    if (to === this.node.identity.author) throw new Error('you hold it already');
    this.node.replica.write(this.node.identity, { kind: KIND_BADGE_TRANSFER, body: { badge: badge.id, from: badge.head, to } });
    return this.badgeInfo(this.badgeRef(badge.id));
  }

  /** Make the personal note on a badge you were given public, or (on: false) take it back. */
  async publishBadgeNote(input: { badge: string; on?: boolean }): Promise<BadgeInfo> {
    const badge = this.badgeRef(input.badge);
    if (badge.to !== this.node.identity.author) throw new Error('only the one a badge was given to can publish its personal note');
    if (!badge.personal) throw new Error('that badge has no personal note');
    if (input.on === false) {
      this.node.replica.write(this.node.identity, { kind: KIND_BADGE_NOTE, body: { badge: badge.id, on: false } });
    } else {
      const opened = this.openBadgeNote(badge);
      if (!opened) throw new Error("this node can't open the personal note");
      this.node.replica.write(this.node.identity, { kind: KIND_BADGE_NOTE, body: { badge: badge.id, text: opened.text, salt: opened.salt, on: true } });
    }
    return this.badgeInfo(this.badgeRef(badge.id));
  }

  /** A badge's personal note, if one of its boxes is ours and it matches the hash its issuer signed. */
  openBadgeNote(badge: Badge): { text: string; salt: string } | undefined {
    for (const box of badge.personal?.boxes ?? []) {
      const opened = this.core.tryOpen((me) => {
        try {
          return openBox(me.keys.secretKey, me.keys.publicKey, box) as { text?: unknown; salt?: unknown };
        } catch {
          return undefined;
        }
      });
      if (typeof opened?.text === 'string' && typeof opened.salt === 'string' && badgeNoteHash(opened.text, opened.salt) === badge.personal!.hash) return { text: opened.text, salt: opened.salt };
    }
    return undefined;
  }

  publishBadgeSeries(id: string, fields: { name: string; symbol: string; image: string; description: string }, first: { project?: { id: string; name: string }; limit?: number }): void {
    const name = fields.name.trim();
    if (!name || name.length > 40) throw new Error('badge names are 1 to 40 characters');
    const symbol = fields.symbol.trim();
    if (symbol.length > 8) throw new Error('a badge symbol is short: an emoji or two');
    if (fields.image && !parseBlobRef(fields.image)) throw new Error('a badge picture is an uploaded image (wblob: reference)');
    const body: Record<string, Json> = { series: id, name, symbol, description: fields.description.trim().slice(0, 1000) };
    if (fields.image) body.image = fields.image;
    if (first.project) body.project = first.project;
    if (first.limit) body.limit = first.limit;
    this.node.replica.write(this.node.identity, { kind: KIND_BADGE_SERIES, body });
  }

  /**
   * Every badge series and badge this node holds the events of, checked against each other.
   * A series counts for a project only if its issuer maintains it: in projects this node is in,
   * one whose issuer doesn't is a false claim and left out with its badges; elsewhere the claim
   * shows as unchecked.
   */
  allBadges(): { series: BadgeSeries[]; badges: Badge[] } {
    const all = badgesOf(this.node.replica.events((e) => e.kind === KIND_BADGE_SERIES || e.kind === KIND_BADGE || e.kind === KIND_BADGE_TRANSFER || e.kind === KIND_BADGE_NOTE));
    const claimed = new Set<string>();
    const series = all.series.flatMap((s): BadgeSeries[] => {
      if (!s.project) return [s];
      const project = this.core.spaces.get(s.project.id);
      if (project?.kind !== 'project') return [{ ...s, project: { ...s.project, checked: false } }];
      if (mayAct(this.core.state(project), s.issuer, 'curate').ok) return [{ ...s, project: { id: project.id, name: project.name, checked: true } }];
      claimed.add(s.id);
      return [];
    });
    return { series, badges: claimed.size ? all.badges.filter((b) => !claimed.has(b.series)) : all.badges };
  }

  /** A series by id, or by name (yours first). */
  badgeSeriesRef(ref: string): BadgeSeries {
    const all = this.allBadges().series;
    const byId = all.find((s) => s.id === ref);
    if (byId) return byId;
    const named = all.filter((s) => s.name.toLowerCase() === ref.toLowerCase());
    const mine = named.filter((s) => s.issuer === this.node.identity.author);
    const match = mine.length ? mine : named;
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several badges are named "${ref}" — use its id` : `no badge "${ref}" is known`);
  }

  /** A badge by id or the start of it. */
  badgeRef(ref: string): Badge {
    const all = this.allBadges().badges;
    const match = all.filter((b) => b.id === ref || (ref.length >= 6 && b.id.startsWith(ref)));
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several badges start with "${ref}" — use more of its id` : `no badge "${ref}" is known`);
  }

  personalInfo(badge: Badge): NonNullable<BadgeInfo['personal']> {
    const published = badge.personal?.published;
    const text = published ?? this.openBadgeNote(badge)?.text;
    return { ...(text !== undefined ? { text } : {}), published: published !== undefined, mayPublish: badge.to === this.node.identity.author };
  }

  badgeSeriesInfo(series: BadgeSeries): BadgeSeriesInfo {
    return { ...series, issuer: { did: series.issuer, name: this.node.nameOf(series.issuer) }, mine: series.issuer === this.node.identity.author };
  }

  badgeInfo(badge: Badge): BadgeInfo {
    const series = this.badgeSeriesRef(badge.series);
    const person = (did: Did) => ({ did, name: this.node.nameOf(did) });
    return {
      id: badge.id,
      series: { id: series.id, name: series.name, symbol: series.symbol, ...(series.image ? { image: series.image } : {}), ...(series.limit ? { limit: series.limit } : {}), broken: series.broken, ...(series.project ? { project: series.project } : {}) },
      issuer: person(badge.issuer),
      n: badge.n,
      holder: person(badge.holder),
      holders: badge.holders.map(person),
      note: badge.note,
      ...(badge.ref ? { ref: badge.ref } : {}),
      ...(badge.personal ? { personal: this.personalInfo(badge) } : {}),
      time: badge.time,
      ...(badge.invalid ? { invalid: badge.invalid } : {}),
      ...(badge.contested ? { contested: true as const } : {}),
      mine: badge.holder === this.node.identity.author,
    };
  }
}
