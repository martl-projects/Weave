import { type AppManifest, type Artifact, IMAGE_REF, type Json, KIND_APP, KIND_APP_TEXTS, KIND_SERVICE_REQUEST, SERVICE_LABEL, artifactKindOf, artifactsOf, checkServiceLabel, checkServicePackage, compareVersions, formatVersion, mayDo, parseManifest, parseVersion } from '@weave/core';
import { platformKey } from './appinstall.ts';
import { type AppReleases, type ArtifactLine, type UpdateFile, type UpdateInfo, type UpdateReady, type UpdateState } from './backend.ts';
import { saveConfig } from './config.ts';
import { publicReleases } from './github.ts';
import { machinePolicy } from './machine.ts';
import { imageDigest, imageLabels } from './registry.ts';
import { type StoredSpace } from './spacestore.ts';
import type { Entry, SpaceState } from '@weave/core';
import type { Fetchers } from './fetchers.ts';
import type { Services } from './services.ts';
import type { Updates } from './update.ts';
import type { WeaveNode } from './node.ts';
import { UPDATE_SOURCE } from './node.ts';
/*
 * A project's app and artifacts: the manifest and its texts, releases of
 * artifacts, apps and services, the release lines, and this installation's
 * own updates. It sees the node's internals only through AppsCore; the node
 * delegates the Backend methods to it.
 */

/** A promise that gives up after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref())]);
}

/** What Apps needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface AppsCore {
  agentMay(name: string, kind: string): void;
  announce(project: string, announce: { kind: 'website' | 'release'; id: string }, text: string): Promise<void>;
  entries(space: StoredSpace): Entry[];
  readonly fetchers: Fetchers;
  maintainerState(project: StoredSpace): SpaceState;
  project(ref: string): StoredSpace;
  readonly services: Services;
  spaceName(space: StoredSpace): string;
  readonly spaces: Map<string, StoredSpace>;
  state(space: StoredSpace): SpaceState;
  readonly updates: Updates;
}

export class Apps {
  private readonly node: WeaveNode;
  private readonly core: AppsCore;

  constructor(node: WeaveNode, core: AppsCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- rooms and shared apps

  /** Before artifact lines: a project's one app. Its latest artifact's description now (any number of them). */
  async projectApp(ref: string): Promise<AppManifest | null> {
    return [...this.#lines(this.core.project(ref)).values()].at(-1) ?? null;
  }

  /**
   * A project's artifact lines: each artifact it describes and releases (by its id), however many, each from its own
   * source, with its latest description. Nothing ties a project to one.
   */
  async artifactLines(ref: string): Promise<ArtifactLine[]> {
    const project = this.core.project(ref);
    const released = artifactsOf(this.core.entries(project), this.core.state(project).maintainers);
    return [...this.#lines(project).values()].map((m) => {
      const latest = released.find((a) => a.manifest.app === m.app);
      const image = m.install?.image?.ref ?? m.start?.image;
      return { id: m.app, name: m.name, kind: artifactKindOf(m), ...(m.install?.source ? { source: m.install.source } : {}), ...(!m.install?.source && image ? { image } : {}), ...(latest ? { tag: latest.tag } : {}) };
    });
  }

  /** Describe one of a project's artifacts (its weave.app.json): another line, or the next description of one. */
  async publishArtifact(input: { project: string; manifest: unknown; as?: string }): Promise<AppManifest> {
    return this.publishApp(input);
  }

  async publishApp(input: { project: string; manifest: unknown; texts?: unknown; as?: string }): Promise<AppManifest> {
    if (input.as) this.core.agentMay(input.as, KIND_APP);
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    let manifest = parseManifest(input.manifest);
    // A description usually doesn't list the release files (releasing adds them): keep those of this artifact's line.
    const before = this.#lines(project).get(manifest.app)?.install;
    if (before?.assets && !manifest.install?.assets) manifest = { ...manifest, install: { ...before, ...(manifest.install?.steps ? { steps: manifest.install.steps } : {}) } };
    // Its texts, checked before anything is published: a broken package publishes nothing.
    const texts = this.#checkedTexts(manifest, input.texts, input.as);
    const item = await this.node.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    await this.#publishTexts(project, item.id, texts, input.as);
    return manifest;
  }

  /**
   * A release's packages (weave.texts.<lang>.json next to its manifest, docs/localization.md): each checked against the
   * manifest, then published as one event by the maintainer, pointing at the release. Nothing is added to the manifest.
   */
  #checkedTexts(manifest: AppManifest, texts: unknown, as?: string): unknown[] | undefined {
    if (texts === undefined) return undefined;
    if (!Array.isArray(texts)) throw new Error('texts: the packages next to the manifest, as a list');
    for (const pkg of texts) {
      const problems = checkServicePackage(pkg, manifest);
      const lang = (pkg as { lang?: unknown } | null)?.lang;
      if (problems.length) throw new Error(`weave.texts.${typeof lang === 'string' ? lang : '?'}.json: ${problems.map((p) => (p.name ? `${p.name}: ${p.problem}` : p.problem)).join('; ')}`);
    }
    if (texts.length && as) this.core.agentMay(as, KIND_APP_TEXTS);
    return texts;
  }

  async #publishTexts(project: StoredSpace, release: string, texts: unknown[] | undefined, as?: string): Promise<void> {
    if (texts?.length) await this.node.publish({ kind: KIND_APP_TEXTS, body: { release, packages: texts as Json }, space: project.id, as });
  }

  // ---------------------------------------------------------------- releases

  // ---------------------------------------------------------------- updates

  async updateCheck(input: { current: string }): Promise<UpdateInfo> {
    const current = parseVersion(String(input?.current ?? ''));
    if (!current) throw new Error(`"${input?.current}" isn't a version like 0.3.0`);
    // A company's IT rolls out versions itself (managed settings): no prompts.
    if (machinePolicy().updates === false) return { current: input.current } as UpdateInfo;
    const source = this.#updateSource();
    const found: NonNullable<UpdateInfo['latest']>[] = [];

    // Release posts in the Weave project, signed by its maintainers: every member has them, no sign-in needed.
    const project = this.core.spaces.get(source.project);
    if (project?.kind === 'project') {
      const maintainers = this.core.state(project).maintainers;
      for (const post of await this.node.posts({ space: project.id, board: 'releases' })) {
        const version = /^weave\b/i.test(post.title) ? parseVersion(post.title) : undefined;
        if (!version || !maintainers.has(post.by.did)) continue;
        found.push({ version: formatVersion(version), ...(post.link ? { url: post.link } : {}), post: `weave:post:${post.id}`, notes: post.text.slice(0, 4000), published: post.time, source: 'weave' });
      }
      // The desktop app released as the project's artifact (weave app release), with its file for this computer and
      // its SHA-256 in the maintainer's signed entry: what the app may install by itself.
      for (const [version, { release, install }] of this.#updateReleases(project, source.artifact)) {
        const same = found.find((f) => f.version === version && f.source === 'weave');
        if (same) same.install = install;
        else found.push({ version, url: `https://github.com/${source.repo}/releases/tag/${encodeURIComponent(release.tag)}`, published: release.time, source: 'weave', install });
      }
    }
    // The repository's releases, as anyone sees them (a private repository's: its release posts are enough).
    try {
      const releases = await withTimeout(publicReleases(source.repo, this.node.githubSetup.fetch), 8000);
      for (const r of releases) {
        const version = parseVersion(r.tag);
        if (version) found.push({ version: formatVersion(version), url: `https://github.com/${source.repo}/releases/tag/${encodeURIComponent(r.tag)}`, ...(r.published ? { published: r.published } : {}), source: 'github' });
      }
    } catch {
      // unreachable or private without access: the release posts are enough
    }

    // The newest version; for the same version, the release post (it has the notes) wins.
    const latest = found.sort((a, b) => compareVersions(b.version, a.version) || (a.source === 'weave' ? -1 : 1))[0];
    // A download of this version or an older one is of no use anymore.
    this.core.updates.prune(formatVersion(current));
    const ready = this.core.updates.ready();
    return { current: formatVersion(current), ...(latest ? { latest } : {}), newer: !!latest && compareVersions(latest.version, current) > 0, auto: this.node.config.updates?.auto !== false, ...(ready ? { ready } : {}) };
  }

  /** Where Weave's own updates come from: the Weave project, its repository and its desktop artifact, unless the config says otherwise. */
  #updateSource(): { project: string; repo: string; artifact: string } {
    const source = { ...UPDATE_SOURCE, ...(this.node.config.updates ?? {}) };
    // Its fetcher gets Weave's updates without being added by hand: Weave's own code, as shipped.
    this.core.fetchers.builtInFor.add(source.project);
    return source;
  }

  /** The desktop app's releases in the project, by version: each with its file for this computer, as a maintainer signed it. */
  #updateReleases(project: StoredSpace, artifact: string): Map<string, { release: Artifact; install: UpdateFile }> {
    const found = new Map<string, { release: Artifact; install: UpdateFile }>();
    for (const release of artifactsOf(this.core.entries(project), this.core.state(project).maintainers)) {
      if (release.manifest.app !== artifact || release.kind !== 'file') continue;
      const version = parseVersion(release.tag);
      const asset = release.manifest.install?.assets?.[platformKey()];
      if (!version || !asset) continue;
      found.set(formatVersion(version), { release, install: { artifact: release.id, tag: release.tag, file: asset.file, sha256: asset.sha256, ...(asset.size ? { size: asset.size } : {}) } });
    }
    return found;
  }

  async updateFetch(input: { version: string }): Promise<UpdateState> {
    if (machinePolicy().updates === false) throw new Error('this computer gets new versions from its IT (managed settings): nothing to download');
    const version = parseVersion(String(input?.version ?? ''));
    if (!version) throw new Error(`"${input?.version}" isn't a version like 0.3.0`);
    const source = this.#updateSource();
    const project = this.core.spaces.get(source.project);
    const release = project?.kind === 'project' ? this.#updateReleases(project, source.artifact).get(formatVersion(version)) : undefined;
    if (!release) throw new Error(`no release of Weave ${formatVersion(version)} for this computer that the app can install itself: its maintainers haven't released it in the Weave project`);
    this.core.updates.reset();
    return this.core.updates.fetch(formatVersion(version), { project: project!.id, id: release.release.id, tag: release.release.tag, manifest: release.release.manifest }, release.install);
  }

  async updateState(): Promise<UpdateState> {
    return this.core.updates.state();
  }

  async updateReady(input: { version: string }): Promise<UpdateReady | null> {
    return this.core.updates.readyFor(String(input?.version ?? '')) ?? null;
  }

  async updateSettings(input: { auto: boolean }): Promise<{ auto: boolean }> {
    const { auto: _auto, ...rest } = this.node.config.updates ?? {};
    this.node.config = { ...this.node.config, updates: { ...rest, ...(input.auto === false ? { auto: false } : {}) } };
    saveConfig(this.node.home, this.node.config);
    return { auto: input.auto !== false };
  }
  /**
   * Which of a project's artifact lines a release is of, and where it comes from: the artifact named, the line released
   * from the source given (a new line, if none is), or its only line. Its source's provider, when that's known.
   */
  releaseLine(project: StoredSpace, input: { artifact?: string; source?: string }): { ref: string; provider?: string; previous?: AppManifest } {
    const lines = [...this.#lines(project).values()];
    const given = input.source?.trim();
    const named = input.artifact ? lines.find((m) => m.app === input.artifact) : undefined;
    if (input.artifact && !named) throw new Error(`${this.core.spaceName(project)} has no artifact ${input.artifact}${lines.length ? ` (its artifacts: ${lines.map((m) => m.app).join(', ')})` : ''}`);
    const fromSource = given ? lines.find((m) => m.install?.source?.ref.toLowerCase() === given.toLowerCase()) : undefined;
    const sourced = lines.filter((m) => m.install?.source);
    const previous = named ?? fromSource ?? (!given && sourced.length === 1 ? sourced[0] : undefined);
    if (!given && !previous && sourced.length > 1) throw new Error(`which of ${this.core.spaceName(project)}'s artifacts? (${sourced.map((m) => `${m.app}, from ${m.install!.source!.ref}`).join('; ')}), or a new source`);
    const ref = given || previous?.install?.source?.ref || '';
    if (!ref) throw new Error("where does the release come from? (what its provider understands: a repository's owner/name, say)");
    const known = previous?.install?.source;
    return { ref, ...(known && known.ref.toLowerCase() === ref.toLowerCase() ? { provider: known.provider } : {}), ...(previous ? { previous } : {}) };
  }

  /** The releases one of a project's artifacts could publish (or a new source), as its provider sees them, in its words. */
  async artifactReleases(input: { project: string; artifact?: string; source?: string }): Promise<AppReleases> {
    const project = this.core.project(input.project);
    const from = this.releaseLine(project, input);
    return (await this.core.services.askProvider(project, 'releases', { source: from.ref }, undefined, from.provider)) as unknown as AppReleases;
  }

  /** Before artifact lines: the releases of a project's one app. */
  async appReleases(ref: string): Promise<AppReleases> {
    return this.artifactReleases({ project: ref });
  }

  // ---------------------------------------------------------------- app API

  // ---------------------------------------------------------------- fetching a release

  /**
   * Publish a GitHub release as the project's artifact (maintainers): asked of the project's provider (github-releases),
   * which reads it, fingerprints its files and publishes it with its own access. Nobody's GitHub sign-in is needed.
   */
  async releaseArtifact(input: { project: string; tag: string; artifact?: string; source?: string; assets?: Record<string, string>; texts?: unknown; announce?: boolean; as?: string }): Promise<AppManifest> {
    if (input.as) this.core.agentMay(input.as, KIND_SERVICE_REQUEST);
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    const from = this.releaseLine(project, input);
    // Its texts are checked against the manifest once the provider has read it; that an agent may publish them, now.
    if (Array.isArray(input.texts) && input.texts.length && input.as) this.core.agentMay(input.as, KIND_APP_TEXTS);
    const data = (await this.core.services.askProvider(project, 'publish', { source: from.ref, tag: input.tag.trim(), ...(input.assets && Object.keys(input.assets).length ? { assets: input.assets } : {}), ...(from.previous ? { previous: from.previous as unknown as Json } : {}) }, input.as, from.provider)) as { id?: string; manifest?: unknown };
    const manifest = parseManifest(data.manifest);
    if (data.id) await this.#publishTexts(project, data.id, this.#checkedTexts(manifest, input.texts, input.as), input.as);
    // Offered: said in the project's chat, as a card to get it from (unless announce is false).
    if (input.announce !== false && data.id) await this.core.announce(project.id, { kind: 'release', id: data.id }, `${manifest.name} ${manifest.install?.tag ?? input.tag} is available`);
    return manifest;
  }

  /** Before artifact lines: releasing a project's app (repo: where from). */
  async releaseApp(input: { project: string; tag: string; repo?: string; artifact?: string; assets?: Record<string, string>; as?: string }): Promise<AppManifest> {
    const { repo, ...rest } = input;
    return this.releaseArtifact({ ...rest, ...(repo ? { source: repo } : {}) });
  }

  async releaseService(input: { project: string; image: string; as?: string }): Promise<AppManifest> {
    if (input.as) this.core.agentMay(input.as, KIND_APP);
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    const given = input.image.trim();
    const colon = given.lastIndexOf(':');
    const [ref, tag] = colon > given.lastIndexOf('/') ? [given.slice(0, colon), given.slice(colon + 1)] : [given, ''];
    if (!tag || !IMAGE_REF.test(ref)) throw new Error('which image? its name and tag, like ghcr.io/you/service:1.0 (Weave pins the tag to its digest)');
    // A public image: Weave signs in nowhere, and those who install it pull it the same way.
    const options = { fetch: this.node.containerSetup.fetch };
    const { digest } = await imageDigest(ref, [tag], options);
    const checked = checkServiceLabel((await imageLabels(ref, digest, options))[SERVICE_LABEL]);
    if (!checked.manifest) throw new Error(`${ref}:${tag} isn't a Weave service: ${checked.problems.join('; ')}`);
    const manifest = parseManifest({ ...checked.manifest, start: { image: ref }, install: { tag, image: { ref, tag, digest, packaged: true } } });
    const item = await this.node.publish({ kind: KIND_APP, body: manifest as unknown as Json, space: project.id, as: input.as });
    await this.core.announce(project.id, { kind: 'release', id: item.id }, `${manifest.name} ${tag} is available`);
    return manifest;
  }

  /** A project's artifact lines: the latest description a maintainer published of each artifact (by its id), oldest line first. */
  #lines(project: StoredSpace): Map<string, AppManifest> {
    const state = this.core.state(project);
    const lines = new Map<string, AppManifest>();
    for (const e of this.core.entries(project)) {
      if (e.kind !== KIND_APP || !mayDo(state, e.event.author, 'curate').ok) continue;
      try {
        const m = parseManifest(e.body);
        lines.set(m.app, m);
      } catch {
        // a malformed description is ignored; the one before stays
      }
    }
    return lines;
  }

  /** Tell watchers something changed that isn't an event; with a notice, it may also show as a notification. */
}
