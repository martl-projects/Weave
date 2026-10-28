import { join as joinPath } from 'node:path';
import { artifactsOf, checkMarkAnswer, KIND_APP, KIND_MARKS_MINE, KIND_MARKS_PIN, KIND_OFFICIAL, MARK_LIMITS, MARK_SLOTS, markServicesOf, parseSubject, subjectKey, type Json, type Mark, type MarkService, type MarkSlot, type MarkSubject } from '@weave/core';
import type { FeedItem, MarkInfo, MarkIssuerInfo, MarksAnswer, MarkServiceInfo } from './backend.ts';
import { releaseFolder } from './lenses.ts';
import type { Decoded, ServicesHost } from './node.ts';
import { prepareWasm } from './runtime.ts';
import { SHIPPED_DIR, shippedProblem, shippedServices, type ShippedService } from './shipped.ts';

/*
 * Mark services (docs/v2-stage19.md): what shows next to names, from issuers you or a space chose. Each is a pure
 * component (the marks world) this node runs over what it holds, with no key and no network. Its domain decides what
 * it's fed and where it shows: yours (taken in by you, sealed for yourself) everywhere you look; a space's (pinned by
 * its maintainers) only in that space. The node checks every answer against the vocabulary and adds who says so: a
 * service can't claim to be another. The ones Weave ships (packages/shipped: Badges, From Weave) are everyone's own until
 * they turn one off; only these count as Weave's own, checked by their component's digest.
 */

/** How long an ask may take before the service shows nothing this time, and how long the app waits for a fold. */
export const MARKS_TIMING = { askMs: 200, foldWaitMs: 1500 };

type Domain = { kind: 'user' } | { kind: 'project' | 'community'; id: string };
const domainKey = (d: Domain) => (d.kind === 'user' ? 'user' : d.id);
/** A service's state per release, domain and settings: changed settings fold again from the start. */
const foldKey = (s: MarkService, d: Domain) => `${s.origin.release}|${domainKey(d)}|${JSON.stringify(s.settings ?? {})}`;

interface Folded {
  /** The ids folded so far, and the latest one's order key. */
  ids: Set<string>;
  last: string;
  state: string;
  /** Bumped on each fold: asks are cached per version. */
  version: number;
}

const orderKey = (d: Decoded) => `${d.event.time}\u0000${d.id}`;

export class Marks {
  readonly h: ServicesHost;
  /** Components being made ready, by release. */
  #ready = new Map<string, Promise<string>>();
  #folded = new Map<string, Folded>();
  #folding = new Map<string, Promise<Folded>>();
  /** Answers per fold version, slot and subject. */
  #asked = new Map<string, Mark[]>();
  /** Why a service shows nothing, by release and domain. */
  #problems = new Map<string, string>();

  constructor(host: ServicesHost) {
    this.h = host;
  }

  // ---------------------------------------------------------------- which services, where

  /** Your own: sealed for yourself, the latest per service. */
  #mine(): MarkService[] {
    const me = this.h.identity.author;
    const own = this.h
      .decodeAll()
      .filter((d) => d.private && d.inner.kind === KIND_MARKS_MINE)
      .map((d) => ({ kind: d.inner.kind, body: d.inner.body, event: { author: me, time: d.event.time, seq: d.event.seq } }));
    // Weave's own unless turned off; and no project's service takes one's name.
    const shipped = this.#shipped();
    const off = new Set<string>();
    for (const e of [...own].sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq)) {
      const { service, on } = (e.body ?? {}) as { service?: unknown; on?: unknown };
      if (typeof service === 'string') on === false ? off.add(service) : off.delete(service);
    }
    const weaves = [...shipped.values()].filter((s) => !off.has(s.manifest.app)).map((s) => this.#fromShipped(s));
    const released = markServicesOf(own, KIND_MARKS_MINE).filter((s) => !shipped.has(s.service));
    return [...weaves, ...released.map((s) => (s.follow ? this.#newest(s) ?? s : s))];
  }

  /** The mark services this Weave ships, by their app id (read again only when the folder changes). */
  #shipped(): Map<string, ShippedService> {
    const dir = this.h.shippedDir() ?? SHIPPED_DIR;
    if (!this.#shippedFrom || this.#shippedFrom.dir !== dir) this.#shippedFrom = { dir, services: new Map([...shippedServices(dir).values()].filter((s) => s.manifest.marks).map((s) => [s.manifest.app, s])) };
    return this.#shippedFrom.services;
  }

  #shippedFrom?: { dir: string | undefined; services: Map<string, ShippedService> };

  #fromShipped(s: ShippedService): MarkService {
    return { service: s.manifest.app, name: s.manifest.name, tag: 'Weave', origin: { project: '', release: s.digest }, manifest: s.manifest, settings: {}, shipped: true, by: this.h.identity.author, time: '' };
  }

  /** A space's, as its maintainers pinned them. */
  #pinned(space: ReturnType<ServicesHost['space']>): MarkService[] {
    if (space.kind !== 'project' && space.kind !== 'community') return [];
    const shipped = this.#shipped();
    return markServicesOf(this.h.entries(space), KIND_MARKS_PIN, this.h.state(space).maintainers).filter((s) => !shipped.has(s.service));
  }

  /** The releases of mark services in a project held here: the newest first. */
  #releases(projectId: string, app?: string) {
    const project = this.h.spaces.get(projectId);
    if (!project || project.kind !== 'project') return [];
    return artifactsOf(this.h.entries(project), this.h.state(project).maintainers).filter((a) => a.manifest.marks && (!app || a.manifest.app === app));
  }

  /** A service that follows its project, at the project's newest release of it (if that's newer). */
  #newest(s: MarkService): MarkService | undefined {
    const newest = this.#releases(s.origin.project, s.service)[0];
    if (!newest || newest.id === s.origin.release || newest.time <= s.time) return undefined;
    return { ...s, tag: newest.tag, name: newest.manifest.name, manifest: newest.manifest, origin: { project: s.origin.project, release: newest.id } };
  }

  /** The services that may answer at a slot: yours everywhere (Weave's own first); a space's only in that space. */
  #services(slot: { kind: MarkSlot; space?: string }): Array<{ service: MarkService; domain: Domain }> {
    const out: Array<{ service: MarkService; domain: Domain }> = this.#mine().map((service) => ({ service, domain: { kind: 'user' } }));
    const space = slot.space ? this.h.spaces.get(slot.space) : undefined;
    if (space && (space.kind === 'project' || space.kind === 'community')) {
      for (const service of this.#pinned(space).filter((s) => !s.gate)) out.push({ service, domain: { kind: space.kind, id: space.id } });
    }
    return out.filter(({ service }) => service.manifest.marks!.slots.includes(slot.kind));
  }

  /**
   * Whether an event of this kind may change what's shown: one some service here reads (yours, or one a space
   * pinned), or a change of the services themselves. Anything else leaves the marks as they are.
   */
  reads(kind: string): boolean {
    // A new release, too: a service that follows its project runs it.
    if (kind === KIND_MARKS_PIN || kind === KIND_MARKS_MINE || kind === KIND_APP) {
      this.#reads = undefined;
      return true;
    }
    if (!this.#reads) {
      const all = new Set<string>();
      const add = (s: MarkService) => s.manifest.marks!.reads.forEach((k) => all.add(k));
      this.#mine().forEach(add);
      for (const space of this.h.spaces.values()) this.#pinned(space).forEach(add);
      this.#reads = all;
    }
    return this.#reads.has(kind);
  }

  /** The kinds the services here read: worked out again only when the services change, not on every event. */
  #reads?: Set<string>;

  /** The services changed here (taken in, removed): what they read, and what they say. */
  #servicesChanged(): void {
    this.#reads = undefined;
    this.h.marksChanged();
  }

  // ---------------------------------------------------------------- running

  /** Fetch a service's release (once), or take the component Weave ships (exactly that file), and start it. */
  #prepare(s: MarkService): Promise<string> {
    const key = `marks:${s.origin.release}`;
    const before = this.#ready.get(s.origin.release);
    if (before && this.h.runtime.running(key)) return before;
    const ready = (async () => {
      const dir = joinPath(this.h.home.dir, 'marks', s.shipped ? `${s.service}-${s.origin.release.slice(7, 23)}` : s.origin.release.slice(0, 40));
      let component: string;
      if (s.shipped) {
        const shipped = this.#shipped().get(s.service);
        const problem = !shipped ? `this Weave doesn't ship ${s.name} any more` : shippedProblem(shipped);
        if (problem) throw new Error(problem);
        component = shipped!.file;
      } else component = joinPath(await releaseFolder(this.h, dir, s), s.manifest.marks!.component);
      const entry = await prepareWasm(component, joinPath(dir, 'wasm'));
      this.h.runtime.startWasm(
        key,
        {
          dir: joinPath(dir, 'wasm'),
          entry,
          data: joinPath(dir, 'data'),
          log: joinPath(dir, 'marks.log'),
          name: s.name,
          host: () => {
            throw new Error('a mark service calls nothing: it only folds and answers');
          },
        },
        () => {},
      );
      return key;
    })();
    this.#ready.set(s.origin.release, ready);
    ready.catch(() => this.#ready.delete(s.origin.release));
    return ready;
  }

  /**
   * What a service is fed in a domain: the kinds it reads, from public events and the domain (yours: everything this
   * node holds; a space's: that space), oldest first. "home": in the project it comes from, by one of its maintainers.
   */
  #items(s: MarkService, domain: Domain): Decoded[] {
    const reads = new Set(s.manifest.marks!.reads);
    return this.h.memo(`marks:items:${domainKey(domain)}:${[...reads].join(',')}`, () =>
      this.h
        .decodeAll()
        .filter((d) => !d.private && reads.has(d.inner.kind) && (!d.space || domain.kind === 'user' || d.space.id === domain.id))
        .sort((a, b) => orderKey(a).localeCompare(orderKey(b))),
    );
  }

  #item(s: MarkService, d: Decoded): Record<string, Json> {
    const name = this.h.actor(d.event.author, d.event.author).name;
    // Weave's own count what the Weave project's maintainers say; a project's, what its own maintainers say.
    const home = d.space?.id === (s.shipped ? this.h.weaveProject() : s.origin.project) && this.h.state(d.space).maintainers.has(d.event.author);
    return { id: d.id, kind: d.inner.kind, body: d.inner.body, author: d.event.author, signer: d.event.signer, seq: d.event.seq, ...(name ? { authorName: name } : {}), time: d.event.time, ...(d.space ? { space: d.space.id } : {}), ...(home ? { home: true } : {}) };
  }

  /** Fold what's new into the service's state in a domain: only the new items, or all again when one came in older. */
  #fold(s: MarkService, domain: Domain): Promise<Folded> {
    const key = foldKey(s, domain);
    const running = this.#folding.get(key);
    if (running) return running;
    const folding = (async () => {
      const ready = await this.#prepare(s);
      const items = this.#items(s, domain);
      let before = this.#folded.get(key);
      const fresh = items.filter((d) => !before?.ids.has(d.id));
      if (before && !fresh.length) return before;
      if (before && fresh.some((d) => orderKey(d) < before!.last)) before = undefined;
      const feed = before ? fresh : items;
      const domainJson = JSON.stringify(domain.kind === 'user' ? { kind: 'user', id: this.h.identity.author } : domain);
      const state = String(await this.h.runtime.callWasm(ready, 'fold', [domainJson, JSON.stringify(s.settings ?? {}), before?.state ?? null, JSON.stringify(feed.map((d) => this.#item(s, d)))]));
      if (state.length > MARK_LIMITS.state) throw new Error(`its state grew larger than ${MARK_LIMITS.state / 1_000_000} MB`);
      const folded: Folded = { ids: new Set([...(before?.ids ?? []), ...feed.map((d) => d.id)]), last: items.length ? orderKey(items[items.length - 1]) : '', state, version: (before?.version ?? 0) + 1 };
      this.#folded.set(key, folded);
      this.#problems.delete(key);
      return folded;
    })();
    this.#folding.set(key, folding);
    folding.then(
      () => this.#folding.delete(key),
      (error: Error) => {
        this.#folding.delete(key);
        this.#problems.set(key, error.message);
      },
    );
    return folding;
  }

  // ---------------------------------------------------------------- asking

  /**
   * Marks for these subjects at a slot (in a space, or anywhere): from every service whose domain fits, each asked
   * once for all of them, checked against the vocabulary, with who says so. A service that's slow (or still folding
   * for the first time) shows nothing this time; the app is told when it's ready.
   */
  async marks(input: { slot: string; space?: string; subjects: unknown[] }): Promise<MarksAnswer[]> {
    const kind = input.slot as MarkSlot;
    if (!(MARK_SLOTS as readonly string[]).includes(kind) || kind === 'gate') throw new Error(`a slot is one of ${MARK_SLOTS.filter((s) => s !== 'gate').join(', ')}`);
    const subjects = (Array.isArray(input.subjects) ? input.subjects : []).map(parseSubject).filter((s): s is MarkSubject => !!s).slice(0, MARK_LIMITS.subjects);
    const unique = [...new Map(subjects.map((s) => [subjectKey(s), s])).values()];
    const out = new Map(unique.map((s) => [subjectKey(s), [] as MarkInfo[]]));
    let space: string | undefined;
    try {
      space = input.space ? this.h.space(input.space).id : undefined;
    } catch {
      // a space this node doesn't hold: only your own services answer
    }
    const slot = { kind, ...(space ? { space } : {}) };
    const viewer = JSON.stringify({ did: this.h.identity.author });
    const answers = this.#services(slot).map(async ({ service, domain }) => {
      const asked = unique.filter((s) => service.manifest.marks!.subjects.includes(Object.keys(s)[0] as never));
      if (!asked.length) return;
      const key = foldKey(service, domain);
      const folding = this.#fold(service, domain);
      folding.catch(() => {});
      const folded = await Promise.race([folding, timeout(MARKS_TIMING.foldWaitMs)]).catch(() => undefined);
      if (!folded) {
        // Ready later: the app asks again.
        folding.then(() => this.h.marksChanged(), () => {});
        return;
      }
      const cacheKey = (s: MarkSubject) => `${key}|${folded.version}|${slot.kind}|${slot.space ?? ''}|${subjectKey(s)}`;
      const missing = asked.filter((s) => !this.#asked.has(cacheKey(s)));
      if (missing.length) {
        const ready = await this.#prepare(service);
        const raw = await Promise.race([this.h.runtime.callWasm(ready, 'ask', [JSON.stringify(slot), JSON.stringify(missing), folded.state, viewer]), timeout(MARKS_TIMING.askMs)]).catch(() => undefined);
        if (raw === undefined) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(raw));
        } catch {
          return;
        }
        const checked = checkMarkAnswer(parsed, missing);
        if (this.#asked.size > 20_000) this.#asked.clear();
        for (const s of missing) this.#asked.set(cacheKey(s), checked.get(subjectKey(s)) ?? []);
      }
      const issuer = this.#issuer(service, domain);
      for (const s of asked) out.get(subjectKey(s))!.push(...this.#asked.get(cacheKey(s))!.map((m) => ({ ...m, issuer })));
    });
    // In the order of the services (Weave's own first), whenever each answers.
    const order = new Map(this.#services(slot).map(({ service, domain }, i) => [`${service.origin.release}|${domainKey(domain)}`, i]));
    await Promise.all(answers);
    return unique.map((subject) => ({
      subject,
      marks: out.get(subjectKey(subject))!.sort((a, b) => (order.get(`${a.issuer.release}|${a.issuer.domain.kind === 'user' ? 'user' : a.issuer.domain.id}`) ?? 0) - (order.get(`${b.issuer.release}|${b.issuer.domain.kind === 'user' ? 'user' : b.issuer.domain.id}`) ?? 0)),
    }));
  }

  #issuer(s: MarkService, domain: Domain): MarkIssuerInfo {
    const install = s.manifest.install;
    const space = domain.kind === 'user' ? undefined : this.h.spaces.get(domain.id);
    return {
      service: s.service,
      name: s.name,
      tag: s.tag,
      release: s.origin.release,
      digest: s.shipped ? s.origin.release : (install?.image?.digest ?? `sha256:${install?.assets?.wasm?.sha256 ?? ''}`),
      domain: domain.kind === 'user' ? { kind: 'user' } : { kind: domain.kind, id: domain.id, name: space ? this.h.spaceName(space) : domain.id },
      ...(s.shipped ? { weave: true as const } : {}),
    };
  }

  // ---------------------------------------------------------------- taking them in

  /** Your own services, or a space's. `off`: also the ones Weave ships that you turned off. */
  async markServices(input: { space?: string; off?: boolean } = {}): Promise<MarkServiceInfo[]> {
    if (!input.space) {
      const mine = this.#mine().map((s) => this.#info(s, { kind: 'user' }));
      if (!input.off) return mine;
      const turnedOff = [...this.#shipped().values()].filter((s) => !mine.some((m) => m.service === s.manifest.app));
      return [...mine, ...turnedOff.map((s) => ({ ...this.#info(this.#fromShipped(s), { kind: 'user' }), off: true as const }))];
    }
    const space = this.h.space(input.space);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error(`${this.h.spaceName(space)} has no mark services: only projects and communities pin them`);
    return this.#pinned(space).map((s) => this.#info(s, { kind: space.kind as 'project' | 'community', id: space.id }));
  }

  #info(s: MarkService, domain: Domain): MarkServiceInfo {
    const issuer = this.#issuer(s, domain);
    const project = s.shipped ? undefined : this.h.spaces.get(s.origin.project);
    const newest = s.follow || s.shipped ? undefined : this.#releases(s.origin.project, s.service)[0];
    const problem = this.#problems.get(foldKey(s, domain));
    return {
      service: s.service,
      name: s.name,
      tag: s.tag,
      release: s.origin.release,
      digest: issuer.digest,
      ...(s.shipped ? {} : { project: { id: s.origin.project, ...(project ? { name: this.h.spaceName(project) } : {}) } }),
      domain: issuer.domain,
      settings: s.settings,
      reads: s.manifest.marks!.reads,
      slots: s.manifest.marks!.slots,
      ...(s.follow ? { follow: true as const } : {}),
      ...(s.shipped ? { shipped: true as const } : {}),
      ...(s.gate ? { gate: true as const } : {}),
      ...(newest && newest.id !== s.origin.release && newest.time > s.time ? { newer: newest.tag } : {}),
      ...(problem ? { problem } : {}),
      by: this.h.actor(s.by, s.by),
      time: s.time,
    };
  }

  /**
   * Take a mark service in: a release of a project you're in (its newest, or a tag), into your own domain, or (as one
   * of its maintainers) pinned to a space. Yours may follow its project's newest release; a space's stays as pinned,
   * so every member's node runs the same. One Weave ships (shipped: its name) comes back after you turned it off.
   */
  async addMarks(input: { project?: string; shipped?: string; app?: string; tag?: string; space?: string; settings?: Json; follow?: boolean; gate?: boolean; as?: string }): Promise<MarkServiceInfo> {
    if (input.shipped) {
      const wanted = input.shipped.toLowerCase();
      const shipped = this.#shipped().get(input.shipped) ?? [...this.#shipped().values()].find((s) => s.name === input.shipped || s.manifest.name.toLowerCase() === wanted);
      if (!shipped) throw new Error(`this Weave ships no mark service "${input.shipped}"${this.#shipped().size ? ` (it ships ${[...this.#shipped().keys()].join(', ')})` : ''}`);
      if (input.space) throw new Error(`${shipped.manifest.name} is everyone's own already: spaces pin a project's mark services`);
      this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_MARKS_MINE, body: { service: shipped.manifest.app, shipped: true, on: true } }));
      this.#servicesChanged();
      return (await this.markServices()).find((s) => s.service === shipped.manifest.app)!;
    }
    if (!input.project) throw new Error('which mark service? a project that released one, or one Weave ships (shipped)');
    const project = this.h.project(input.project);
    const releases = this.#releases(project.id, input.app);
    const release = input.tag ? releases.find((a) => a.tag === input.tag) : releases[0];
    if (!release) throw new Error(`${this.h.spaceName(project)} has released no mark service${input.app ? ` "${input.app}"` : ''}${input.tag ? ` ${input.tag}` : ''} (a release whose manifest has "marks")`);
    if (this.#shipped().has(release.manifest.app)) throw new Error(`${release.manifest.app} is the name of a mark service Weave ships: a project's can't take it`);
    if (!release.manifest.install?.image && !release.manifest.install?.assets?.wasm) throw new Error(`${release.manifest.name} ${release.tag} has nothing a node can fetch: release it as an image for wasi/wasm, or a release file for wasm`);
    const settings = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : {};
    const body: Record<string, Json> = { service: release.manifest.app, origin: { project: project.id, release: release.id }, manifest: release.manifest as unknown as Json, settings, on: true };
    if (input.space) {
      const space = this.h.space(input.space);
      if (space.kind !== 'project' && space.kind !== 'community') throw new Error(`only projects and communities pin mark services, not ${this.h.spaceName(space)}`);
      if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} choose its mark services`);
      if (input.gate) body.gate = true;
      await this.h.publish({ kind: KIND_MARKS_PIN, body, space: space.id, as: input.as });
      this.#servicesChanged();
      return (await this.markServices({ space: space.id })).find((s) => s.service === release.manifest.app)!;
    }
    if (input.follow) body.follow = true;
    this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_MARKS_MINE, body }));
    this.#servicesChanged();
    return (await this.markServices()).find((s) => s.service === release.manifest.app)!;
  }

  /** Take a service out of your own domain, or (as a maintainer) unpin it from a space. */
  async removeMarks(input: { service: string; space?: string; as?: string }): Promise<void> {
    const listed = await this.markServices({ space: input.space });
    const found = listed.find((s) => s.service === input.service || s.name.toLowerCase() === input.service.toLowerCase());
    if (!found) throw new Error(`no mark service "${input.service}" ${input.space ? 'is pinned there' : 'is yours'} (${listed.map((s) => s.name).join(', ') || 'none'})`);
    const body = { service: found.service, on: false };
    if (input.space) {
      const space = this.h.space(input.space);
      if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} choose its mark services`);
      await this.h.publish({ kind: KIND_MARKS_PIN, body, space: space.id, as: input.as });
    } else this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_MARKS_MINE, body }));
    this.#servicesChanged();
  }

  /**
   * Say (as a maintainer of the Weave project) that something really comes from Weave, or (on: false) that it no
   * longer does: a person, a project or community, or a post. From Weave folds these.
   */
  async setOfficial(input: { subject: unknown; note?: string; on?: boolean; as?: string }): Promise<FeedItem> {
    const id = this.h.weaveProject();
    const project = this.h.spaces.get(id);
    if (!project || project.kind !== 'project') throw new Error(`you're not in the Weave project (${id})`);
    if (!this.h.state(project).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(project)} say what comes from it`);
    const subject = parseSubject(input.subject);
    if (!subject) throw new Error('what comes from Weave? a person ({did}), a space ({space}) or a post ({post})');
    const note = input.note?.trim().slice(0, 200) ?? '';
    return this.h.publish({ kind: KIND_OFFICIAL, body: { subject: subject as unknown as Json, on: input.on !== false, ...(note ? { note } : {}) }, space: project.id, as: input.as });
  }

  /** Forget what was folded (a service's state can't be trusted any more, or tests start over). */
  reset(): void {
    this.#folded.clear();
    this.#asked.clear();
  }
}

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref());
