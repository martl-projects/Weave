import { artifactsOf, checkHintAnswer, hintKey, HINT_SLOTS, KIND_APP, KIND_HINTS_MINE, KIND_NOTICE, KIND_SEEN, markServicesOf, parseHintSubject, parseSeen, SEEN_VIEWS, type Hint, type HintSlot, type HintSubject, type Json, type MarkService } from '@weave/core';
import type { HintInfo, HintsAnswer, HintServiceInfo, Notice } from './backend.ts';
import { Folder, MARKS_TIMING, orderKey, timeout } from './marks.ts';
import type { Decoded, ServicesHost } from './node.ts';
import { SHIPPED_DIR, shippedServices, type ShippedService } from './shipped.ts';

/*
 * Hint services (docs/v2-stage20.md): numbers about your own state next to places, like unread counts, from
 * services you chose. Components of the marks world, run like mark services (see marks.ts), but yours only: each folds
 * what this node holds of the kinds it reads, what's sealed to you too, and the notices this node works out for you
 * (weave.notice); what it answers is a count, never a claim about anyone, and decides nothing. The one Weave
 * ships (packages/shipped: Unread) is everyone's own until they turn it off; its settings are its rules, sealed to
 * you like what you opened (weave.seen), so every device of yours counts alike.
 */

/** A notice for you in an event this node holds: what hint services that read weave.notice are fed. */
export interface HeldNotice {
  id: string;
  time: string;
  notice: Notice;
}

type Item = { id: string; event: { time: string }; feed: Record<string, Json> };

export class Hints {
  readonly h: ServicesHost;
  readonly #folder: Folder;
  readonly #notices: (since: string) => Promise<HeldNotice[]>;
  /** Answers per fold version and subject. */
  #asked = new Map<string, Hint | null>();
  #started = false;

  constructor(host: ServicesHost, notices: (since: string) => Promise<HeldNotice[]>) {
    this.h = host;
    this.#notices = notices;
    this.#folder = new Folder(host, 'hints', () => this.#shipped());
  }

  // ---------------------------------------------------------------- which services

  /** Your own events of a kind, sealed for yourself, oldest first. */
  #own(kind: string) {
    const me = this.h.identity.author;
    return this.h
      .decodeAll()
      .filter((d) => d.private && d.inner.kind === kind)
      .map((d) => ({ kind: d.inner.kind, body: d.inner.body, event: { author: me, time: d.event.time, seq: d.event.seq } }))
      .sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);
  }

  /** Yours: Weave's own unless turned off (with their settings), and the releases you said yes to. */
  #mine(): MarkService[] {
    const own = this.#own(KIND_HINTS_MINE);
    const shipped = this.#shipped();
    const off = new Set<string>();
    const settings = new Map<string, Json>();
    for (const e of own) {
      const body = (e.body ?? {}) as { service?: unknown; on?: unknown; shipped?: unknown; settings?: Json };
      if (typeof body.service !== 'string') continue;
      if (body.on === false) off.add(body.service);
      else off.delete(body.service);
      if (body.shipped === true && body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) settings.set(body.service, body.settings);
    }
    const weaves = [...shipped.values()].filter((s) => !off.has(s.manifest.app)).map((s) => this.#fromShipped(s, settings.get(s.manifest.app)));
    const released = markServicesOf(own, KIND_HINTS_MINE, undefined, 'hints').filter((s) => !this.#reserved(s.service));
    return [...weaves, ...released];
  }

  /** The hint services this Weave ships, by their app id (read again only when the folder changes). */
  #shipped(): Map<string, ShippedService> {
    const dir = this.h.shippedDir() ?? SHIPPED_DIR;
    if (!this.#shippedFrom || this.#shippedFrom.dir !== dir) this.#shippedFrom = { dir, services: new Map([...shippedServices(dir).values()].filter((s) => s.manifest.hints).map((s) => [s.manifest.app, s])) };
    return this.#shippedFrom.services;
  }

  #shippedFrom?: { dir: string | undefined; services: Map<string, ShippedService> };

  /** Whether a name is one of what Weave ships: never a project's. */
  #reserved(app: string): boolean {
    const all = shippedServices(this.h.shippedDir() ?? SHIPPED_DIR);
    return all.has(app) || [...all.values()].some((s) => s.manifest.app === app);
  }

  #fromShipped(s: ShippedService, settings: Json = {}): MarkService {
    return { service: s.manifest.app, name: s.manifest.name, tag: 'Weave', origin: { project: '', release: s.digest }, manifest: s.manifest, settings, shipped: true, by: this.h.identity.author, time: '' };
  }

  /** The releases of hint services in a project held here: the newest first. */
  #releases(projectId: string, app?: string) {
    const project = this.h.spaces.get(projectId);
    if (!project || project.kind !== 'project') return [];
    return artifactsOf(this.h.entries(project), this.h.state(project).maintainers).filter((a) => a.manifest.hints && (!app || a.manifest.app === app));
  }

  /** Whether an event of this kind may change what's shown (a notice says so itself: see the node's watch). */
  reads(kind: string): boolean {
    if (kind === KIND_HINTS_MINE || kind === KIND_SEEN || kind === KIND_APP) {
      this.#reads = undefined;
      return true;
    }
    this.#reads ??= new Set(this.#mine().flatMap((s) => s.manifest.hints!.reads));
    return this.#reads.has(kind);
  }

  #reads?: Set<string>;

  #changed(): void {
    this.#reads = undefined;
    this.h.hintsChanged();
  }

  /**
   * The first time: everything before now counts as seen, so nothing old counts. Written once, sealed to you; your
   * other devices hold it too.
   */
  #start(): void {
    if (this.#started) return;
    this.#started = true;
    if (!this.#own(KIND_SEEN).length) this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_SEEN, body: { all: true, time: new Date().toISOString() } }));
  }

  // ---------------------------------------------------------------- running

  /** What a service is fed: the kinds it reads from what this node holds (sealed to you too), and your notices, oldest first. */
  async #items(s: MarkService): Promise<Item[]> {
    const reads = new Set(s.manifest.hints!.reads);
    const held: Item[] = this.h
      .decodeAll()
      .filter((d) => reads.has(d.inner.kind) && d.inner.kind !== KIND_NOTICE)
      .map((d) => ({ id: d.id, event: { time: d.event.time }, feed: this.#item(d) }));
    if (reads.has(KIND_NOTICE)) {
      // Notices only since everything was last seen: nothing older can count.
      const since = this.#own(KIND_SEEN).reduce((at, e) => (e.body && typeof e.body === 'object' && (e.body as { all?: unknown }).all === true && e.event.time > at ? e.event.time : at), '');
      for (const n of await this.#notices(since)) {
        const body = { type: n.notice.type, category: n.notice.category, ...(n.notice.from ? { from: n.notice.from } : {}), ...(n.notice.open.space ? { space: n.notice.open.space.id } : {}), ...(n.notice.board ? { board: n.notice.board } : {}), ...(n.notice.open.channel ? { channel: n.notice.open.channel } : {}), ...(n.notice.open.post ? { post: n.notice.open.post } : {}) };
        held.push({ id: `notice:${n.id}`, event: { time: n.time }, feed: { id: `notice:${n.id}`, kind: KIND_NOTICE, body, time: n.time } });
      }
    }
    return held.sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
  }

  #item(d: Decoded): Record<string, Json> {
    const body = d.inner.kind === KIND_SEEN ? ((parseSeen(d.inner.body, d.event.time) ?? null) as Json) : d.inner.body;
    return { id: d.id, kind: d.inner.kind, body, author: d.event.author, time: d.event.time, ...(d.space ? { space: d.space.id } : {}), ...(d.private ? { private: true } : {}) };
  }

  #key(s: MarkService): string {
    return `${s.origin.release}|${JSON.stringify(s.settings ?? {})}`;
  }

  // ---------------------------------------------------------------- asking

  /**
   * Hints for these places: from every service of yours that answers there, each asked once for all of them,
   * checked against the vocabulary, with which service says so. One still folding shows nothing this time; the app
   * is told when it's ready.
   */
  async hints(input: { slot: string; subjects: unknown[] }): Promise<HintsAnswer[]> {
    const slot = input.slot as HintSlot;
    if (!(HINT_SLOTS as readonly string[]).includes(slot)) throw new Error(`a slot is one of ${HINT_SLOTS.join(', ')}`);
    this.#start();
    const subjects = (Array.isArray(input.subjects) ? input.subjects : []).map(parseHintSubject).filter((s): s is HintSubject => !!s).slice(0, 500);
    const unique = [...new Map(subjects.map((s) => [hintKey(s), s])).values()];
    const out = new Map(unique.map((s) => [hintKey(s), [] as HintInfo[]]));
    const services = this.#mine().filter((s) => s.manifest.hints!.slots.includes(slot));
    await Promise.all(
      services.map(async (service) => {
        const asked = unique.filter((s) => service.manifest.hints!.subjects.includes(Object.keys(s)[0] as never));
        if (!asked.length) return;
        const key = this.#key(service);
        const folding = this.#folder.fold(service, key, JSON.stringify({ kind: 'user', id: this.h.identity.author }), () => this.#items(service), (d) => d.feed);
        folding.catch(() => {});
        const folded = await Promise.race([folding, timeout(MARKS_TIMING.foldWaitMs)]).catch(() => undefined);
        if (!folded) {
          folding.then(() => this.h.hintsChanged(), () => {});
          return;
        }
        const cacheKey = (s: HintSubject) => `${key}|${folded.version}|${slot}|${hintKey(s)}`;
        const missing = asked.filter((s) => !this.#asked.has(cacheKey(s)));
        if (missing.length) {
          const raw = await this.#folder.ask(service, [JSON.stringify({ kind: slot }), JSON.stringify(missing), folded.state, JSON.stringify({ did: this.h.identity.author })], MARKS_TIMING.askMs);
          if (raw === undefined) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(String(raw));
          } catch {
            return;
          }
          const checked = checkHintAnswer(parsed, missing);
          if (this.#asked.size > 20_000) this.#asked.clear();
          for (const s of missing) this.#asked.set(cacheKey(s), checked.get(hintKey(s)) ?? null);
        }
        const issuer = { service: service.service, name: service.name, ...(service.shipped ? { weave: true as const } : {}) };
        for (const s of asked) {
          const hint = this.#asked.get(cacheKey(s));
          if (hint) out.get(hintKey(s))!.push({ ...hint, issuer });
        }
      }),
    );
    return unique.map((subject) => ({ subject, hints: out.get(hintKey(subject))! }));
  }

  // ---------------------------------------------------------------- yours

  async hintServices(input: { off?: boolean } = {}): Promise<HintServiceInfo[]> {
    this.#start();
    const mine = this.#mine().map((s) => this.#info(s));
    if (!input.off) return mine;
    const turnedOff = [...this.#shipped().values()].filter((s) => !mine.some((m) => m.service === s.manifest.app));
    return [...mine, ...turnedOff.map((s) => ({ ...this.#info(this.#fromShipped(s)), off: true as const }))];
  }

  #info(s: MarkService): HintServiceInfo {
    const install = s.manifest.install;
    const project = s.shipped ? undefined : this.h.spaces.get(s.origin.project);
    const newest = s.shipped ? undefined : this.#releases(s.origin.project, s.service)[0];
    const problem = this.#folder.problem(this.#key(s));
    return {
      service: s.service,
      name: s.name,
      tag: s.tag,
      release: s.origin.release,
      digest: s.shipped ? s.origin.release : (install?.image?.digest ?? `sha256:${install?.assets?.wasm?.sha256 ?? ''}`),
      ...(s.shipped ? {} : { project: { id: s.origin.project, ...(project ? { name: this.h.spaceName(project) } : {}) } }),
      settings: s.settings,
      reads: s.manifest.hints!.reads,
      ...(s.shipped ? { shipped: true as const } : {}),
      ...(newest && newest.id !== s.origin.release && newest.time > s.time ? { newer: newest.tag } : {}),
      ...(problem ? { problem } : {}),
      by: this.h.actor(s.by, s.by),
      time: s.time,
    };
  }

  #write(body: Record<string, Json>): void {
    this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_HINTS_MINE, body }));
    this.#changed();
  }

  /**
   * Take a hint service in: a release of a project you're in (its newest, or a tag), with your yes to exactly that
   * release (approve), as for a keyvault or fetcher; a newer one only with another yes. One Weave ships (shipped:
   * its name) comes back after you turned it off.
   */
  async addHints(input: { project?: string; shipped?: string; app?: string; tag?: string; settings?: Json; approve?: boolean }): Promise<HintServiceInfo> {
    const settings = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : undefined;
    if (input.shipped) {
      const wanted = input.shipped.toLowerCase();
      const shipped = [...this.#shipped().values()].find((s) => s.name === input.shipped || s.manifest.app === input.shipped || s.manifest.name.toLowerCase() === wanted);
      if (!shipped) throw new Error(`this Weave ships no hint service "${input.shipped}"${this.#shipped().size ? ` (it ships ${[...this.#shipped().values()].map((s) => s.manifest.app).join(', ')})` : ''}`);
      const before = this.#mine().find((s) => s.service === shipped.manifest.app);
      this.#write({ service: shipped.manifest.app, shipped: true, on: true, ...(settings ?? before?.settings ? { settings: (settings ?? before!.settings) as Json } : {}) });
      return (await this.hintServices()).find((s) => s.service === shipped.manifest.app)!;
    }
    if (!input.project) throw new Error('which hint service? a project that released one, or one Weave ships (shipped)');
    const project = this.h.project(input.project);
    const releases = this.#releases(project.id, input.app);
    const release = input.tag ? releases.find((a) => a.tag === input.tag) : releases[0];
    if (!release) throw new Error(`${this.h.spaceName(project)} has released no hint service${input.app ? ` "${input.app}"` : ''}${input.tag ? ` ${input.tag}` : ''} (a release whose manifest has "hints")`);
    if (this.#reserved(release.manifest.app)) throw new Error(`${release.manifest.app} is the name of one Weave ships: a project's release can't stand in for it`);
    if (!release.manifest.install?.image && !release.manifest.install?.assets?.wasm) throw new Error(`${release.manifest.name} ${release.tag} has nothing a node can fetch: release it as an image for wasi/wasm, or a release file for wasm`);
    if (!input.approve) throw new Error(`approve it first: Weave would run ${release.manifest.name} ${release.tag}, released in ${this.h.spaceName(project)}, over ${release.manifest.hints!.reads.join(', ') || 'nothing'} that your Weave holds, what's sealed to you too (no key, no network), and show its counts in your Places`);
    this.#write({ service: release.manifest.app, origin: { project: project.id, release: release.id }, manifest: release.manifest as unknown as Json, settings: settings ?? {}, on: true });
    return (await this.hintServices()).find((s) => s.service === release.manifest.app)!;
  }

  /** Change a service's settings (Unread's rules), keeping the release you said yes to. */
  async setHints(input: { service: string; settings: Json }): Promise<HintServiceInfo> {
    if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) throw new Error('settings are an object, like {"rules": [...]}');
    const found = this.#mine().find((s) => s.service === input.service || s.name.toLowerCase() === input.service.toLowerCase());
    if (!found) throw new Error(`no hint service "${input.service}" is yours (${this.#mine().map((s) => s.name).join(', ') || 'none'})`);
    if (found.shipped) this.#write({ service: found.service, shipped: true, on: true, settings: input.settings });
    else this.#write({ service: found.service, origin: found.origin as unknown as Json, manifest: found.manifest as unknown as Json, settings: input.settings, on: true });
    return (await this.hintServices()).find((s) => s.service === found.service)!;
  }

  async removeHints(input: { service: string }): Promise<void> {
    const found = this.#mine().find((s) => s.service === input.service || s.name.toLowerCase() === input.service.toLowerCase());
    if (!found) throw new Error(`no hint service "${input.service}" is yours (${this.#mine().map((s) => s.name).join(', ') || 'none'})`);
    this.#write({ service: found.service, on: false });
  }

  /** You opened a place: sealed to you, so what waited there counts no more on any of your devices. */
  async seen(input: { space: string; view?: string; name?: string }): Promise<void> {
    const space = this.h.space(input.space);
    const view = input.view ?? 'all';
    if (!(SEEN_VIEWS as readonly string[]).includes(view)) throw new Error(`a view is one of ${SEEN_VIEWS.join(', ')}`);
    if (view !== 'all' && !input.name) throw new Error(`which ${view}? its name`);
    const body = { space: space.id, view, ...(view !== 'all' ? { name: input.name! } : {}), time: new Date().toISOString() };
    if (!parseSeen(body, body.time)) throw new Error(`"${input.name}" isn't a ${view} name`);
    this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_SEEN, body }));
    this.h.hintsChanged();
  }

  reset(): void {
    this.#folder.reset();
    this.#asked.clear();
  }
}
