import { b64u, LINK_HOST, KIND_GITHUB_ADDED, type AppSetting, catalogOf, KIND_CATALOG_ENTRY, checkServiceLabel, SERVICE_LABEL, parseManifest, takesRequests, type Builtin, type ServiceOrigin, isBuiltin, PROTOCOL_ARTIFACT_FETCH, boxTo, openBox, type Box, createSubKey, delegation, artifactsOf, type Artifact, randomBytes, revocation, sealFor, type AppManifest, type Did, type Json, KIND_SERVICE_PROFILE, KIND_SERVICE_REQUEST, KIND_SERVICE_RESULT, KIND_SERVICE_IN, servicesIn as servicesInSpace, SERVICE_PREFIX, parseContract, profilesOf, requestsOf, serviceName, servicePermissions, contractWords, serviceReads, type ServiceContract, KIND_SERVICE_SETTING, resolveNet, appSettingsOf, KIND_SERVICE_POLICY, mayAct, parseWho, policiesOf, tightens, whoWords, type ActionWho, KIND_ARTIFACT_ACCESS, artifactAccessOf, artifactKindOf, artifactSourceOf } from '@weave/core';
import { type ServiceGate, type FeedItem, type ShippedServiceInfo, type ServiceActionInfo, type ServicePanelInfo, type ServiceInfo, type ArtifactInfo, type ServiceArtifactInfo, type ServiceProfileInfo, type ServiceOriginInfo, type CatalogEntryInfo, type ServiceRequestInfo } from './backend.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';
import { ServiceSettings } from './servicesettings.ts';
import { SHIPPED_DIR, shippedProblem, shippedServices } from './shipped.ts';
import { platformKey } from './appinstall.ts';
import { createHash, createHmac, sign as cryptoSign, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join as joinPath, resolve as resolvePath } from 'node:path';
import { createAndSaveAgent, saveAgent, type AgentKey } from './keystore.ts';
import { prepareWasm, publicHost, releaseApproval } from './runtime.ts';
import { imageDigest, imageLabels } from './registry.ts';
import { GitHubAppAuth, type GitHub } from './github.ts';
import { type ArtifactRef as StoredArtifact, type Located } from './artifacts.ts';
import { type StoredSpace } from './spacestore.ts';
import type { ServicesHost, StoredService, StoredRoom, Handover, Decoded } from './node.ts';
import type { Website } from './website.ts';

/*
 * Services: code you run under keys of their own. A service has its own key ("martl · github"), a contract that
 * says what it reads and writes (its key may sign exactly that), the spaces you add it to, and settings sealed on the
 * node that runs it. It runs here, or on an always-on node it was handed over to; it's a command, an applet (a
 * project's release), or Weave's website service (see website.ts). Its process reaches Weave through its own token on
 * the local API (serviceGate).
 */

/**
 * Sealed to yourself, by one of your computers: a service for one of your always-on nodes. Its configuration in the
 * clear for your devices; its key and settings in a box only that node opens. Later ones change or remove it.
 */
export const KIND_SERVICE_HANDOVER = 'weave.service.handover';
/** Always-on nodes' keys are named "node:<name>" among your keys. */
export const NODE_PREFIX = 'node:';

/** The services Weave ships: what each does, as its contract and in words, and the settings it takes. */
const BUILTIN: Record<Builtin, { contract: ServiceContract; description: string; settings?: AppSetting[] }> = {
  // Reads nothing and writes its websites.
  website: { contract: { reads: 'nothing', writes: [], website: true, version: '1.0' }, description: 'Websites: a way to join in with the project’s participants' },
  // Reads what's asked of it and answers where to download a release's files; with a GitHub App of the person's own,
  // it also keeps linked repositories' access in step with their spaces, and records whom it gave access.
  github: {
    contract: { reads: 'addressed', writes: [KIND_GITHUB_ADDED], offers: [PROTOCOL_ARTIFACT_FETCH], sources: ['github'], version: '1.0' },
    description: 'GitHub: hands the project’s release files to its participants, and keeps linked repositories’ access in step with their spaces',
    settings: [
      { name: 'GITHUB_APP_ID', label: 'GitHub App ID', optional: true, hint: 'Your own GitHub App, installed on the organization: it acts without anyone signing in' },
      { name: 'GITHUB_APP_KEY', label: 'GitHub App private key (.pem)', secret: true, optional: true, hint: 'The App needs Administration (read and write), Contents (read) and Metadata (read)' },
    ],
  },
};

/** What a service Weave ships accepts as settings, as a manifest would say it. */
const builtinSpec = (builtin: Builtin) => ({ name: `the ${builtin} service`, env: BUILTIN[builtin].settings ?? [] });

/** A service's public profile: what it is, its contract, and where it comes from (a release, by ids only). */
/** A signature with a key among a service's settings (it never sees the key): RS256, ES256 (r||s) or HS256. */
function signWith(key: string | undefined, name: string, algorithm: string, data: Uint8Array): Uint8Array {
  if (!key) throw new Error(`no setting ${name} to sign with`);
  const bytes = Buffer.from(data);
  try {
    if (algorithm === 'HS256') return new Uint8Array(createHmac('sha256', key).update(bytes).digest());
    if (algorithm === 'RS256') return new Uint8Array(cryptoSign('sha256', bytes, key));
    if (algorithm === 'ES256') return new Uint8Array(cryptoSign('sha256', bytes, { key, dsaEncoding: 'ieee-p1363' }));
  } catch (error) {
    throw new Error(`${name} isn't a key for ${algorithm}: ${(error as Error).message}`);
  }
  throw new Error(`it signs with RS256, ES256 or HS256, not ${algorithm}`);
}

/** The settings a service asks for: its release's, the one Weave ships's, or what its person said for their own code. */
const asksOf = (s: Pick<StoredService, 'builtin' | 'artifact' | 'asks'>): AppSetting[] | undefined => s.artifact?.manifest.env ?? (s.builtin ? BUILTIN[s.builtin].settings : s.asks);

/** The fetcher for an open artifact of a source, when no provider there names one. */
const DIRECT_FETCHERS: Record<string, string> = { github: 'github-checkout' };

/** A service that hosts its projects' websites: Weave's built-in one, or one whose contract says websites: host. */
export const hostsWebsites = (s: Pick<StoredService, 'builtin' | 'contract'>): boolean => s.builtin === 'website' || s.contract.websites === 'host';

/** The services this Weave ships (tests give their own folder). */
const shippedHere = (h: ServicesHost) => shippedServices(h.shippedDir() ?? SHIPPED_DIR);

const profileBody = (s: Pick<StoredService, 'name' | 'description' | 'icon' | 'builtin' | 'contract' | 'artifact' | 'asks' | 'shipped'>): Json => ({
  name: s.name,
  description: s.description,
  ...(s.icon ? { icon: s.icon } : {}),
  ...(s.builtin ? { builtin: s.builtin } : {}),
  contract: s.contract as unknown as Json,
  ...(s.artifact ? { origin: { project: s.artifact.project, release: s.artifact.id, tag: s.artifact.tag, fingerprint: releaseApproval(s.artifact) } } : {}),
  // What it asks for, so its spaces' maintainers can fill it in (sign-ins with their provider).
  ...(asksOf(s)?.length ? { settings: asksOf(s) as unknown as Json } : {}),
  ...(s.shipped ? { shipped: s.shipped } : {}),
});

export class Services {
  readonly h: ServicesHost;
  readonly #web: () => Website;
  get web(): Website {
    return this.#web();
  }

  /** Settings its spaces' maintainers keep for a service (servicesettings.ts). */
  readonly settings: ServiceSettings;

  constructor(h: ServicesHost, web: () => Website) {
    this.h = h;
    this.#web = web;
    this.settings = new ServiceSettings(h, () => this, () => h.oauthFetch());
  }

  localServiceByKey(did: Did): StoredService | undefined {
    return this.storedServices().find((s) => this.h.agents.find((a) => a.name === s.name)?.did === did);
  }

  get servicesFile(): string {
    return joinPath(this.h.home.dir, 'services.json');
  }

  /** The services this node runs, as kept (sealed, with their settings and tokens). */
  storedServices(): StoredService[] {
    return readSecretJson<StoredService[]>(this.h.home, this.servicesFile) ?? [];
  }

  saveServices(list: StoredService[]): void {
    writeSecretJson(this.h.home, this.servicesFile, list);
  }

  storedService(name: string): StoredService {
    const found = this.storedServices().find((s) => s.name === name);
    if (!found) throw new Error(`this node runs no service "${name}"`);
    return found;
  }

  serviceKey(name: string): AgentKey {
    const key = this.h.agents.find((a) => a.name === name);
    if (!key) throw new Error(`the key of service "${name}" is missing on this node`);
    return key;
  }

  /** The spaces a service may be added to: groups, projects and communities you're in (never direct chats). */
  serviceSpaces(refs: string[]): string[] {
    return [...new Set(refs.map((ref) => {
      const space = this.h.space(ref);
      if (space.kind === 'direct') throw new Error('services work in groups, projects and communities, not in direct chats');
      return space.id;
    }))];
  }

  /** Tell the spaces a service joined or left, so their members see it (and can ask it). */
  announceService(did: Did, before: string[], after: string[]): void {
    for (const id of after.filter((s) => !before.includes(s))) if (this.h.spaces.has(id)) this.h.replica.write(this.h.identity, sealFor(this.h.cipher(this.h.spaces.get(id)!), { kind: KIND_SERVICE_IN, body: { service: did, on: true } }));
    for (const id of before.filter((s) => !after.includes(s))) if (this.h.spaces.has(id)) this.h.replica.write(this.h.identity, sealFor(this.h.cipher(this.h.spaces.get(id)!), { kind: KIND_SERVICE_IN, body: { service: did, on: false } }));
  }

  async servicesIn(ref: string): Promise<ServiceProfileInfo[]> {
    const space = this.h.space(ref);
    const here = new Set(servicesInSpace(this.h.entries(space), (service, author) => this.isServiceKey(service, author)));
    return (await this.serviceProfiles()).filter((p) => here.has(p.did));
  }

  serviceInfo(stored: StoredService): ServiceInfo {
    return {
      name: stored.name,
      did: this.serviceKey(stored.name).did,
      description: stored.description,
      ...(stored.icon ? { icon: stored.icon } : {}),
      contract: stored.contract,
      spaces: stored.spaces.flatMap((id) => {
        const space = this.h.spaces.get(id);
        const given = Object.keys(stored.spaceSettings?.[id] ?? {}).sort();
        return space ? [{ id, kind: space.kind, name: this.h.spaceName(space), ...(given.length ? { settings: given } : {}) }] : [];
      }),
      ...(stored.command ? { command: stored.command } : {}),
      ...(stored.wasm ? { wasm: stored.wasm } : {}),
      ...(stored.site ? { site: stored.site } : {}),
      ...(stored.builtin ? { builtin: stored.builtin } : {}),
      ...(hostsWebsites(stored) ? { websites: Object.values(stored.hosted ?? {}).map((r) => this.web.hostedRoomInfo(r)) } : {}),
      ...(stored.artifact ? { artifact: this.serviceArtifactInfo(stored.name, stored.artifact, true) } : {}),
      settings: Object.keys(stored.settings).sort(),
      enabled: stored.enabled,
      running: stored.builtin ? stored.enabled : this.h.runtime.running(`service:${stored.name}`),
      // Why it doesn't run (a shipped component that isn't what Weave ships, say); a release says so in its artifact.
      ...(!stored.artifact && this.h.releases.jobs.get(`service:${stored.name}`)?.error ? { problem: this.h.releases.jobs.get(`service:${stored.name}`)!.error } : {}),
      ...(stored.shipped ? { shipped: stored.shipped.name } : {}),
    };
  }

  // Artifacts: a project's releases. A service runs one, pinned to it, in any space of yours.

  async artifacts(ref: string): Promise<ArtifactInfo[]> {
    const project = this.h.project(ref);
    const access = artifactAccessOf(this.h.entries(project), this.h.state(project).maintainers);
    return artifactsOf(this.h.entries(project), this.h.state(project).maintainers).map((a) => {
      const runs = this.h.runtime.runs(a.manifest);
      const who = access.get(a.id) ?? 'members';
      return {
        kind: a.kind,
        ...(a.source ? { source: a.source } : {}),
        ...(a.manifest.file?.type ? { type: a.manifest.file.type } : {}),
        ...(a.manifest.install?.assets?.file ? { file: { name: a.manifest.install.assets.file.file, ...(a.manifest.install.assets.file.size ? { size: a.manifest.install.assets.file.size } : {}) } } : {}),
        who,
        mine: !this.artifactRefusal(project, a.id, this.h.identity.author),
        id: a.id,
        project: { id: project.id, kind: 'project', name: this.h.spaceName(project) },
        tag: a.tag,
        app: a.manifest.app,
        name: a.manifest.name,
        released: this.h.actor(a.author, a.signer as Did),
        time: a.time,
        website: !!this.artifactWeb(a.manifest) || !!a.manifest.wasm?.site,
        settings: a.manifest.env ?? [],
        ...(a.manifest.service ? { applet: a.manifest.service } : {}),
        ...(a.manifest.install?.image?.packaged ? { packaged: true as const } : {}),
        ...(runs ? { runs, command: this.h.runtime.command(`weave-service-${a.manifest.app}`, a.manifest) } : {}),
        ...(a.manifest.install?.github ? { from: { github: a.manifest.install.github } } : a.manifest.install?.image ? { from: { image: a.manifest.install.image.ref } } : {}),
        ...(a.manifest.client ? { lens: true as const } : {}),
      };
    });
  }

  /** One release of a project: the one with this tag, or the latest. */
  artifact(ref: string, tag?: string): { project: StoredSpace; artifact: Artifact } {
    const project = this.h.project(ref);
    const all = artifactsOf(this.h.entries(project), this.h.state(project).maintainers).filter((a) => a.kind !== 'file');
    // By its id, or its tag.
    const artifact = tag ? (all.find((a) => a.id === tag) ?? all.find((a) => a.tag === tag)) : all[0];
    if (!artifact) throw new Error(tag ? `${project.name} has no release ${tag}${all.length ? ` (its releases: ${all.slice(0, 5).map((a) => a.tag).join(', ')})` : ''}` : `${project.name} has released nothing to run yet (weave app release)`);
    return { project, artifact };
  }

  /** Its web page, if it has one: what its website's visitors reach. */
  artifactWeb(app: AppManifest): AppManifest['services'][number] | undefined {
    return app.services.find((s) => s.protocol === 'http');
  }

  /**
   * What a release runs as: its manifest's contract, and with a web page it serves a website. A web app without a
   * contract reads nothing and writes nothing: it only serves its page.
   */
  artifactContract(app: AppManifest): ServiceContract {
    // A web page: a port it listens on, or a WebAssembly service's site (Weave serves it).
    const web = !!this.artifactWeb(app) || !!app.wasm?.site;
    if (app.service) return web && !app.service.website ? { ...app.service, website: true } : app.service;
    return { reads: 'nothing', writes: [], website: true, version: '1.0' };
  }

  /** The release an applet runs: pinned, with a newer one of its project if there is one, and (here) how fetching it went. */
  serviceArtifactInfo(service: string, a: StoredArtifact, here: boolean): ServiceArtifactInfo {
    const from = this.h.spaces.get(a.project);
    const latest = from ? artifactsOf(this.h.entries(from), this.h.state(from).maintainers)[0] : undefined;
    const job = here ? this.h.releases.jobs.get(`service:${service}`) : undefined;
    const fetched = this.h.releases.has(service, a);
    return {
      project: { id: a.project, ...(from ? { name: this.h.spaceName(from) } : {}) },
      tag: a.tag,
      app: a.manifest.app,
      name: a.manifest.name,
      ...(latest && latest.id !== a.id && latest.tag !== a.tag ? { latest: latest.tag } : {}),
      installed: here && (this.h.runtime.runs(a.manifest) === 'container' || fetched),
      ...(here && fetched && this.h.releases.from(service, a) ? { deliveredBy: this.h.releases.from(service, a) } : {}),
      ...(job?.progress ? { progress: { ...job.progress } } : {}),
      ...(job?.error ? { error: job.error } : {}),
      settings: a.manifest.env ?? [],
    };
  }

  /**
   * An applet's next release: pinned until you take it. Another release runs other code, so it needs your yes; one
   * asking for other rights gets them (its key's grant changes) and says so in its profile.
   */
  nextRelease(name: string, artifact: StoredArtifact, tag: string | undefined, approved: string[], approve?: boolean): { artifact: StoredArtifact; contract: ServiceContract; approved: string[] } | undefined {
    const found = this.artifact(artifact.project, tag);
    if (found.artifact.id === artifact.id) return undefined;
    const manifest = found.artifact.manifest;
    if (!manifest.service && !this.artifactWeb(manifest) && !manifest.wasm?.site) throw new Error(`${manifest.name} ${found.artifact.tag} has nothing to run as a service: it can't replace ${name}`);
    const contract = this.artifactContract(manifest);
    const fingerprint = releaseApproval(found.artifact);
    if (!approve && !approved.includes(fingerprint)) throw new Error(`approve it first: Weave would run "${this.h.runtime.runText(manifest)}" from ${manifest.name} ${found.artifact.tag}, released in ${found.project.name}, as a service that ${contractWords(contract)}`);
    return { artifact: { project: found.project.id, id: found.artifact.id, tag: found.artifact.tag, manifest }, contract, approved: approved.includes(fingerprint) ? approved : [...approved, fingerprint] };
  }

  /** A service's key gets the rights of a new contract (and loses the old ones), and its profile says so. */
  grantContract(did: Did, name: string, contract: ServiceContract): void {
    const permissions = servicePermissions(contract);
    this.h.replica.write(this.h.identity, delegation(did, 'agent', permissions, `${SERVICE_PREFIX}${name}`));
    const key = this.h.agents.find((a) => a.name === name);
    if (key) {
      const updated = { ...key, permissions };
      saveAgent(this.h.home, updated);
      this.h.agents = this.h.agents.map((a) => (a.name === name ? updated : a));
    }
  }

  /** Settings checked against what's allowed: an artifact's own (or a builtin's), or any variable-like name for a command. */
  checkSettings(app: { name: string; env?: AppSetting[] } | undefined, settings: Record<string, string | null>): void {
    for (const key of Object.keys(settings)) {
      if (app) {
        if (!(app.env ?? []).some((e) => e.name === key)) throw new Error(`${app.name} doesn't ask for ${key}${app.env?.length ? ` (it asks for ${app.env.map((e) => e.name).join(', ')})` : ''}`);
      } else if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || key.startsWith('WEAVE_') || key === 'PORT') throw new Error(`a setting is named like an environment variable (A-Z, 0-9, _), not starting with WEAVE_: ${key}`);
    }
  }

  // The website service: a service Weave ships. In each project it's added to, it makes ports of this device
  // reachable: those services serve (serveWeb, gate serve), and programs of yours (openWebsite).

  /** The profile everyone sees: signed by the service's own key, public. */
  publishServiceProfile(stored: StoredService): void {
    this.h.replica.write(this.serviceKey(stored.name), { kind: KIND_SERVICE_PROFILE, body: profileBody(stored) });
  }

  /**
   * A service: code under a key of its own, in the spaces you add it to, running a command. Or one Weave ships
   * (`builtin`: 'website' or 'github'): the node runs it itself, and it gets its contract from Weave.
   */
  async addService(input: { name?: string; description?: string; icon?: string; contract?: ServiceContract; spaces?: string[]; command?: string[]; wasm?: string; site?: string; node?: string; builtin?: Builtin; artifact?: { project: string; tag?: string }; from?: { catalog: string; app: string }; approve?: boolean; settings?: Record<string, string>; asks?: AppSetting[]; settingsIn?: string; shipped?: string }): Promise<ServiceInfo> {
    if (this.h.isLinkedNode) throw new Error("an always-on node can't issue keys: add the service on one of your computers, with --node for this one");
    const command = input.command?.filter((part) => typeof part === 'string' && part.length);
    const builtin = isBuiltin(input.builtin) ? input.builtin : undefined;
    if (builtin && command?.length) throw new Error(`the ${builtin} service runs in Weave: it runs no command`);
    // Its own code as a WebAssembly component: Weave runs it itself, sandboxed.
    const wasm = input.wasm ? this.wasmFile(input.wasm) : undefined;
    if (wasm && (command?.length || builtin || input.artifact || input.from)) throw new Error('a service runs a WebAssembly component, a command, a release, or is one Weave ships: one of them');
    if (wasm && input.node) throw new Error('a WebAssembly service of your own runs on this computer for now (its file is here): release it to run it on an always-on node');
    // Its website's files: a folder Weave serves next to its players' connections.
    const site = input.site ? this.siteFolder(input.site) : undefined;
    if (site && !wasm) throw new Error('a site folder goes with a WebAssembly service (--wasm): Weave serves it next to its players');
    // An applet: a release whose manifest declares its contract. Running it needs your yes, once per release.
    // Or a Weave service listed in a catalog: what it is comes from its image, not from the catalog.
    const found: { project: { id: string; name: string }; artifact: { id: string; tag: string; manifest: AppManifest } } | undefined = input.artifact ? this.artifact(input.artifact.project, input.artifact.tag) : input.from ? await this.fromCatalog(input.from) : undefined;
    if (found && (command?.length || builtin)) throw new Error('a service runs an applet, a command, or is the website service: one of them');
    // One Weave ships: its component, checked against its digest whenever it starts.
    const shipped = input.shipped ? shippedHere(this.h).get(input.shipped) : undefined;
    if (input.shipped && !shipped) throw new Error(`this Weave ships no service named ${input.shipped}${shippedHere(this.h).size ? ` (it ships ${[...shippedHere(this.h).keys()].join(', ')})` : ''}`);
    if (shipped && (found || command?.length || builtin || wasm)) throw new Error('a service Weave ships runs its own component: nothing else with it');
    if (shipped && input.node) throw new Error('a service Weave ships runs on this computer for now');
    if (shipped?.manifest.fetcher) throw new Error(`${shipped.manifest.name} is a fetcher: yours, not a project's (weave fetcher add ${shipped.name})`);
    const manifest = found?.artifact.manifest ?? shipped?.manifest;
    if (manifest && !manifest.service && !this.artifactWeb(manifest) && !manifest.wasm?.site) throw new Error(`${manifest.name} has neither a contract ("service") nor a web page ("services"): nothing to run as a service`);
    if (manifest && !shipped && !input.node && !this.h.runtime.command('weave', manifest)) throw new Error(this.h.runtime.whyNot(manifest));
    const approved = found ? releaseApproval(found.artifact) : undefined;
    if (found && !input.approve) throw new Error(`approve it first: Weave would run "${this.h.runtime.runText(manifest!)}" from ${manifest!.name} ${found.artifact.tag}, released in ${found.project.name}, as a service that ${contractWords(this.artifactContract(manifest!))}`);
    const given = Object.fromEntries(Object.entries(input.settings ?? {}).map(([k, v]) => [k, String(v)]));
    // What it asks for: its manifest's settings, or (your own code) what you say it asks for.
    const asks = manifest?.env ?? (builtin ? undefined : appSettingsOf(input.asks));
    this.checkSettings(manifest ?? (builtin ? builtinSpec(builtin) : asks?.length ? { name: 'it', env: asks } : undefined), given);
    if (builtin === 'github') this.githubAppOf(given);
    // Kept in a project (settingsIn): its maintainers' settings for it there, rather than yours.
    const keptIn = input.settingsIn ? this.h.space(input.settingsIn) : undefined;
    if (keptIn && !this.h.state(keptIn).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(keptIn)} keep its services' settings there`);
    if (keptIn && input.node) throw new Error('settings kept in a project go with a service on this computer for now');
    const settings = keptIn ? {} : given;
    // A sign-in comes after: its provider's page opens once the service is there.
    const missing = (asks ?? []).filter((e) => !e.optional && !e.oauth && !given[e.name]);
    if (missing.length) throw new Error(`${manifest!.name} needs ${missing.map((e) => e.label).join(', ')} (--setting ${missing[0].name}=…)`);
    const name = serviceName(input.name ?? builtin ?? shipped?.name ?? manifest?.app);
    if (!name) throw new Error('a service name is lowercase letters, digits and dashes (up to 40)');
    if (this.h.agents.some((a) => a.name === name)) throw new Error(`you already have an agent or service named "${name}"`);
    // The website service reads nothing and writes its websites. A release: its manifest's contract.
    const contract = parseContract(builtin ? BUILTIN[builtin].contract : manifest ? this.artifactContract(manifest) : input.contract);
    if (!contract) throw new Error('a contract says what the service reads (addressed, space, or {kinds: [...]}), which kinds it writes, and its version (like 1.0)');
    const artifact: StoredArtifact | undefined = found && { project: found.project.id, id: found.artifact.id, tag: found.artifact.tag, manifest: found.artifact.manifest };
    const description = input.description?.trim().slice(0, 1000) ?? (builtin ? BUILTIN[builtin].description : found ? `${manifest!.name} ${found.artifact.tag}, from ${found.project.name}` : shipped ? (shipped.about?.split(/(?<=\.)\s/)[0] ?? manifest!.name) : '');
    if (input.node) {
      if (this.handedOver().has(name)) throw new Error(`you already have a service named "${name}"`);
      return this.addNodeService(name, contract, { ...input, artifact, description, ...(builtin ? { builtin } : {}), ...(artifact ? { approved: [approved!] } : {}), settings }, command);
    }
    const stored: StoredService = {
      name,
      description,
      ...(input.icon?.startsWith('wblob:') ? { icon: input.icon } : {}),
      contract,
      // Settings kept in a project go with the service being there.
      spaces: this.serviceSpaces([...new Set([...(input.spaces ?? []), ...(keptIn ? [keptIn.id] : [])])]),
      ...(command?.length ? { command } : {}),
      ...(wasm ? { wasm } : {}),
      ...(site ? { site } : {}),
      ...(builtin ? { builtin } : {}),
      ...(artifact ? { artifact, approved: [approved!] } : {}),
      ...((!manifest || shipped) && asks?.length ? { asks } : {}),
      ...(shipped ? { shipped: { name: shipped.name, digest: shipped.digest } } : {}),
      settings,
      token: b64u.encode(randomBytes(24)),
      enabled: true,
      since: new Date(this.h.clock()).toISOString(),
    };
    // Its own key, with exactly its contract's rights; named so that everyone knows it's a service.
    const permissions = servicePermissions(contract);
    const key = createAndSaveAgent(this.h.home, this.h.identity.author, name, permissions);
    this.h.replica.write(this.h.identity, delegation(key.did, 'agent', permissions, `${SERVICE_PREFIX}${name}`));
    this.h.agents.push(key);
    this.saveServices([...this.storedServices(), stored]);
    this.publishServiceProfile(stored);
    if (keptIn) {
      for (const [name, value] of Object.entries(given)) this.settings.write(keptIn, key.did, name, value, (asks ?? []).find((e) => e.name === name)?.secret === true);
    }
    this.announceService(key.did, [], stored.spaces);
    // Services start once the app API runs (it gives them WEAVE_API).
    if (this.serviceApi) await this.web.startAppApi();
    this.startService(stored);
    if (hostsWebsites(stored)) this.serveRunning();
    if (builtin === 'github') this.provide();
    return this.serviceInfo(this.storedService(name));
  }

  async services(): Promise<ServiceInfo[]> {
    const here = this.storedServices().map((s) => this.serviceInfo(s));
    // On a computer: also those it handed to always-on nodes (the node lists them as its own).
    const away = this.h.isLinkedNode ? [] : [...this.handedOver().values()].map((h) => this.handoverInfo(h));
    return [...here, ...away];
  }

  // Services on always-on nodes: made on a computer, handed over sealed, run there.

  /** Your always-on nodes' keys, by name or key. */
  nodeKey(ref: string): { did: Did; name: string } {
    const nodes = this.h.replica.authority.grantsOf(this.h.identity.author).filter((g) => g.role === 'agent' && g.name?.startsWith(NODE_PREFIX) && g.revokedAfter === undefined);
    const found = nodes.find((g) => g.subject === ref || g.name === ref || g.name === `${NODE_PREFIX}${ref}`);
    if (!found) throw new Error(`you have no always-on node "${ref}"${nodes.length ? ` (yours: ${nodes.map((g) => g.name!.slice(NODE_PREFIX.length)).join(', ')})` : ''}`);
    return { did: found.subject, name: found.name!.slice(NODE_PREFIX.length) };
  }

  /** The latest handover of each service still on a node (removed ones left out), as your devices read them. */
  handedOver(): Map<string, Handover> {
    const latest = new Map<string, Handover>();
    for (const d of this.h.decodeAll().filter((x) => x.private && x.inner.kind === KIND_SERVICE_HANDOVER).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
      const body = d.inner.body as unknown as Handover;
      if (typeof body?.service !== 'string') continue;
      if (body.removed) latest.delete(body.service);
      else latest.set(body.service, { ...body, id: d.id });
    }
    return latest;
  }

  handoverInfo(h: Handover): ServiceInfo {
    return {
      name: h.service,
      did: h.did,
      description: h.description ?? '',
      ...(h.icon ? { icon: h.icon } : {}),
      contract: h.contract,
      spaces: h.spaces.flatMap((id) => {
        const space = this.h.spaces.get(id);
        return space ? [{ id, kind: space.kind, name: this.h.spaceName(space) }] : [];
      }),
      ...(h.command ? { command: h.command } : {}),
      ...(h.builtin ? { builtin: h.builtin, websites: Object.values(h.hosted ?? {}).map((r) => this.web.hostedRoomInfo(r, false)) } : {}),
      ...(h.artifact ? { artifact: this.serviceArtifactInfo(h.service, h.artifact, false) } : {}),
      settings: h.settingNames ?? [],
      enabled: h.enabled !== false,
      running: false,
      node: { did: h.node, name: this.nodeKey(h.node).name },
    };
  }

  async addNodeService(name: string, contract: ServiceContract, input: { description?: string; icon?: string; spaces?: string[]; node?: string; builtin?: Builtin; artifact?: StoredArtifact; approved?: string[]; settings?: Record<string, string> }, command?: string[]): Promise<ServiceInfo> {
    const node = this.nodeKey(input.node!);
    const key = createSubKey(this.h.identity.author);
    const permissions = servicePermissions(contract);
    this.h.replica.write(this.h.identity, delegation(key.did, 'agent', permissions, `${SERVICE_PREFIX}${name}`));
    const description = input.description?.trim().slice(0, 1000) ?? '';
    const icon = input.icon?.startsWith('wblob:') ? input.icon : undefined;
    // The profile, signed by the service's own key, before the key leaves this computer for good.
    this.h.replica.write(key, { kind: KIND_SERVICE_PROFILE, body: profileBody({ name, description, ...(icon ? { icon } : {}), ...(input.builtin ? { builtin: input.builtin } : {}), contract, ...(input.artifact ? { artifact: input.artifact } : {}) }) });
    const handover: Omit<Handover, 'id'> = {
      service: name,
      node: node.did,
      did: key.did,
      contract,
      description,
      ...(icon ? { icon } : {}),
      spaces: this.serviceSpaces(input.spaces ?? []),
      ...(command?.length ? { command } : {}),
      ...(input.builtin ? { builtin: input.builtin, hosted: {}, approved: [] } : {}),
      ...(input.artifact ? { artifact: input.artifact, approved: input.approved ?? [] } : {}),
      enabled: true,
      settingNames: Object.keys(input.settings ?? {}).sort(),
      // Its key and its settings (secrets too), for that node's eyes only.
      box: boxTo(node.did, { secretKey: b64u.encode(key.keys.secretKey), publicKey: b64u.encode(key.keys.publicKey), settings: input.settings ?? {} }) as unknown as Json,
    };
    this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_SERVICE_HANDOVER, body: handover as unknown as Json }));
    this.announceService(key.did, [], handover.spaces);
    return this.handoverInfo({ ...handover, id: '' });
  }

  /** A change to a service on a node: a new handover; settings travel as changes, boxed for that node only. */
  changeNodeService(before: Handover, change: { spaces?: string[]; command?: string[] | null; settings?: Record<string, string | null>; enabled?: boolean; description?: string; removed?: true; hosted?: Record<string, StoredRoom>; approved?: string[]; artifact?: StoredArtifact; contract?: ServiceContract }): void {
    const { id: _id, box: _box, command: _command, ...rest } = before;
    const command = change.command === null ? undefined : (change.command ?? before.command);
    const names = new Set(before.settingNames ?? []);
    for (const [key, value] of Object.entries(change.settings ?? {})) {
      if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || key.startsWith('WEAVE_')) throw new Error(`a setting is named like an environment variable (A-Z, 0-9, _), not starting with WEAVE_: ${key}`);
      if (value === null) names.delete(key);
      else names.add(key);
    }
    const spaces = change.spaces ? this.serviceSpaces(change.spaces) : before.spaces;
    // The website service's websites: only in projects it's in, none while it's off.
    const hosted = before.builtin ? Object.fromEntries(Object.entries(change.hosted ?? before.hosted ?? {}).filter(([, r]) => spaces.includes(r.project) && change.enabled !== false)) : undefined;
    const after: Omit<Handover, 'id'> = {
      ...rest,
      spaces,
      ...(command?.length ? { command } : {}),
      ...(change.enabled !== undefined ? { enabled: change.enabled } : {}),
      ...(change.description !== undefined ? { description: change.description.trim().slice(0, 1000) } : {}),
      settingNames: [...names].sort(),
      ...(change.settings && Object.keys(change.settings).length ? { box: boxTo(before.node, { settings: change.settings }) as unknown as Json } : {}),
      ...(change.removed ? { removed: true as const } : {}),
      ...(hosted ? { hosted } : {}),
      ...(change.approved ? { approved: change.approved } : {}),
      ...(change.artifact ? { artifact: change.artifact } : {}),
      ...(change.contract ? { contract: change.contract } : {}),
    };
    this.h.replica.write(this.h.identity, this.h.sealForSelf({ kind: KIND_SERVICE_HANDOVER, body: after as unknown as Json }));
    this.announceService(before.did, before.spaces, change.removed ? [] : after.spaces);
  }

  /** On an always-on node: take over the services handed to it, change them, or let them go. Each handover once. */
  async takeHandovers(): Promise<number> {
    if (!this.h.isLinkedNode) return 0;
    const appliedFile = joinPath(this.h.home.dir, 'handovers.json');
    const applied = new Set<string>(existsSync(appliedFile) ? (JSON.parse(readFileSync(appliedFile, 'utf8')) as string[]) : []);
    const mine = this.h.decodeAll()
      .filter((d) => d.private && d.inner.kind === KIND_SERVICE_HANDOVER && !applied.has(d.id) && (d.inner.body as { node?: unknown } | null)?.node === this.h.identity.did)
      .sort((a, b) => a.event.time.localeCompare(b.event.time));
    let changed = 0;
    for (const d of mine) {
      applied.add(d.id);
      const h = d.inner.body as unknown as Handover;
      const opened = h.box ? this.openHandoverBox(h.box) : undefined;
      const list = this.storedServices();
      const before = list.find((s) => s.name === h.service);
      if (h.removed) {
        if (!before) continue;
        // Its websites end first, signed with its key, before the key goes; and those it served.
        await this.web.closeHostedRooms(h.service);
        await this.web.unserve(h.service);
        this.stopService(h.service);
        this.h.agents = this.h.agents.filter((a) => a.name !== h.service);
        rmSync(joinPath(this.h.home.agents, `${h.service}.json`), { force: true });
        this.saveServices(list.filter((s) => s.name !== h.service));
        changed++;
        continue;
      }
      if (!before) {
        // New here: its key comes in the box.
        if (typeof opened?.secretKey !== 'string' || typeof opened.publicKey !== 'string') continue;
        const key: AgentKey = { author: this.h.identity.author, did: h.did, keys: { secretKey: b64u.decode(opened.secretKey), publicKey: b64u.decode(opened.publicKey) }, name: h.service, permissions: servicePermissions(h.contract) };
        saveAgent(this.h.home, key);
        this.h.agents = [...this.h.agents.filter((a) => a.name !== h.service), key];
      } else {
        // Another contract (a release asking for other rights): its key signs within the new one from now on.
        const key = this.h.agents.find((a) => a.name === h.service);
        const permissions = servicePermissions(h.contract);
        if (key && JSON.stringify(key.permissions) !== JSON.stringify(permissions)) {
          const updated = { ...key, permissions };
          saveAgent(this.h.home, updated);
          this.h.agents = this.h.agents.map((a) => (a.name === h.service ? updated : a));
        }
      }
      const settings = { ...(before?.settings ?? {}) };
      for (const [name, value] of Object.entries((opened?.settings ?? {}) as Record<string, string | null>)) {
        if (value === null) delete settings[name];
        else settings[name] = String(value);
      }
      const stored: StoredService = {
        name: h.service,
        description: h.description ?? '',
        ...(h.icon ? { icon: h.icon } : {}),
        contract: h.contract,
        spaces: h.spaces,
        ...(h.command?.length ? { command: h.command } : {}),
        ...(h.builtin ? { builtin: h.builtin, approved: h.approved ?? [] } : {}),
        ...(h.artifact ? { artifact: h.artifact, approved: h.approved ?? [] } : {}),
        settings,
        token: before?.token ?? b64u.encode(randomBytes(24)),
        since: before?.since ?? d.event.time,
        enabled: h.enabled !== false,
      };
      // The website service: websites gone from the handover end here; new ones are announced here.
      const rooms = h.builtin && stored.enabled ? (h.hosted ?? {}) : {};
      await this.web.closeHostedRooms(h.service, (r) => !!rooms[r.id]);
      this.saveServices([...this.storedServices().filter((s) => s.name !== h.service), { ...stored, ...(h.builtin ? { hosted: { ...(this.storedServices().find((s) => s.name === h.service)?.hosted ?? {}), ...rooms } } : {}) }]);
      // Moved to another release: its key is here now, so this node says where it comes from.
      if (before && before.artifact?.id !== stored.artifact?.id) this.publishServiceProfile(stored);
      if (h.builtin) {
        if (this.serviceApi) await this.web.startAppApi();
        for (const room of Object.values(rooms)) {
          this.web.announceRoom(h.service, room);
        }
        if (stored.enabled) this.serveRunning();
      } else {
        await this.web.unserve(h.service, (r) => stored.enabled && stored.spaces.includes(r.project));
        this.stopService(h.service);
        this.startService(this.storedService(h.service));
      }
      changed++;
    }
    if (mine.length) writeFileSync(appliedFile, JSON.stringify([...applied]));
    return changed;
  }

  openHandoverBox(box: Json): { secretKey?: unknown; publicKey?: unknown; settings?: unknown } | undefined {
    try {
      return openBox(this.h.identity.keys.secretKey, this.h.identity.keys.publicKey, box as unknown as Box) as { secretKey?: unknown; publicKey?: unknown; settings?: unknown };
    } catch {
      return undefined;
    }
  }

  /** Change a service: its spaces, settings (once, or per space: `spaceSettings`, by space), command, or whether it runs. */
  async setService(input: { name: string; spaces?: string[]; command?: string[] | null; wasm?: string; site?: string | null; settings?: Record<string, string | null>; spaceSettings?: Record<string, Record<string, string | null>>; enabled?: boolean; description?: string; artifact?: { tag?: string }; approve?: boolean }): Promise<ServiceInfo> {
    const away = this.h.isLinkedNode ? undefined : this.handedOver().get(input.name);
    if (away && !this.storedServices().some((s) => s.name === input.name)) {
      if (input.spaceSettings) throw new Error('per-space settings work on this computer for now: always-on nodes come next');
      if (input.artifact && !away.artifact) throw new Error(`${away.service} isn't an applet: it runs no release`);
      if (away.artifact) this.checkSettings(away.artifact.manifest, input.settings ?? {});
      else if (away.builtin) this.checkSettings(builtinSpec(away.builtin), input.settings ?? {});
      const next = input.artifact && away.artifact ? this.nextRelease(away.service, away.artifact, input.artifact.tag, away.approved ?? [], input.approve) : undefined;
      if (next && JSON.stringify(servicePermissions(next.contract)) !== JSON.stringify(servicePermissions(away.contract))) this.grantContract(away.did, away.service, next.contract);
      const { artifact: _wanted, approve: _approve, ...change } = input;
      this.changeNodeService(away, { ...change, ...(next ? { artifact: next.artifact, approved: next.approved, contract: next.contract } : {}) });
      return this.handoverInfo(this.handedOver().get(input.name)!);
    }
    const before = this.storedService(input.name);
    if (before.builtin && input.command) throw new Error(`${before.name} runs in Weave: its websites say what they run`);
    if (before.artifact && input.command) throw new Error(`${before.name} runs ${before.artifact.manifest.name}: its release says what it runs`);
    if (input.artifact && !before.artifact) throw new Error(`${before.name} isn't an applet: it runs no release`);
    const next = input.artifact && before.artifact ? this.nextRelease(before.name, before.artifact, input.artifact.tag, before.approved ?? [], input.approve) : undefined;
    const settings = { ...before.settings };
    this.checkSettings((next?.artifact ?? before.artifact)?.manifest ?? (before.builtin ? builtinSpec(before.builtin) : undefined), input.settings ?? {});
    for (const [key, value] of Object.entries(input.settings ?? {})) {
      if (value === null) delete settings[key];
      else settings[key] = String(value);
    }
    if (before.builtin === 'github') this.githubAppOf(settings);
    const spaces = input.spaces ? this.serviceSpaces(input.spaces) : before.spaces;
    // Per-space settings: only for spaces it's in; a space it leaves takes its settings along.
    const spaceSettings: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(before.spaceSettings ?? {}).filter(([id]) => spaces.includes(id)));
    for (const [ref, given] of Object.entries(input.spaceSettings ?? {})) {
      const id = this.h.space(ref).id;
      if (!spaces.includes(id)) throw new Error(`${before.name} isn't in ${this.h.space(ref).name}: add it there first`);
      this.checkSettings(undefined, given);
      const mine = { ...(spaceSettings[id] ?? {}) };
      for (const [key, value] of Object.entries(given)) {
        if (value === null) delete mine[key];
        else mine[key] = String(value).slice(0, 4096);
      }
      if (Object.keys(mine).length) spaceSettings[id] = mine;
      else delete spaceSettings[id];
    }
    const command = input.command === null ? undefined : input.command !== undefined ? input.command.filter((part) => typeof part === 'string' && part.length) : before.command;
    // Its own WebAssembly component (and its site): another build of it, read on its next start.
    if ((input.wasm || input.site) && !before.wasm) throw new Error(`${before.name} isn't a WebAssembly service of your own: it has no component to replace`);
    const wasm = input.wasm ? this.wasmFile(input.wasm) : before.wasm;
    const site = input.site === null ? undefined : input.site ? this.siteFolder(input.site) : before.site;
    const { command: _command, spaceSettings: _spaceSettings, wasm: _wasm, site: _site, ...rest } = before;
    const after: StoredService = {
      ...rest,
      ...(wasm ? { wasm } : {}),
      ...(site ? { site } : {}),
      ...(next ? { artifact: next.artifact, approved: next.approved, contract: next.contract } : {}),
      spaces,
      ...(command?.length ? { command } : {}),
      settings,
      ...(Object.keys(spaceSettings).length ? { spaceSettings } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.description !== undefined ? { description: input.description.trim().slice(0, 1000) } : {}),
    };
    if (next && JSON.stringify(servicePermissions(after.contract)) !== JSON.stringify(servicePermissions(before.contract))) this.grantContract(this.serviceKey(after.name).did, after.name, after.contract);
    this.saveServices(this.storedServices().map((s) => (s.name === after.name ? after : s)));
    // Another release is another origin: the profile says so.
    if (after.description !== before.description || JSON.stringify(after.contract) !== JSON.stringify(before.contract) || after.artifact?.id !== before.artifact?.id) this.publishServiceProfile(after);
    if (!this.h.isLinkedNode) this.announceService(this.serviceKey(after.name).did, before.spaces, after.spaces);
    // Turned off, its websites end; out of a project, its websites there end. The same for those it serves.
    if (before.enabled && !after.enabled) await this.web.closeHostedRooms(after.name);
    else await this.web.closeHostedRooms(after.name, (room) => after.spaces.includes(room.project));
    await this.web.unserve(after.name, (room) => after.enabled && after.spaces.includes(room.project));
    if (after.builtin) {
      if (this.serviceApi) await this.web.startAppApi();
      if (after.enabled) this.serveRunning();
      return this.serviceInfo(this.storedService(after.name));
    }
    // Settings and commands take effect on a fresh start.
    this.stopService(after.name);
    if (this.serviceApi) await this.web.startAppApi();
    this.startService(after);
    return this.serviceInfo(this.storedService(after.name));
  }

  async removeService(name: string): Promise<void> {
    const away = this.h.isLinkedNode ? undefined : this.handedOver().get(name);
    if (away && !this.storedServices().some((s) => s.name === name)) {
      // Its key was issued here: revoked here, and the node lets it go.
      this.h.replica.write(this.h.identity, revocation(away.did, this.h.replica.number(away.did)));
      this.changeNodeService(away, { removed: true });
      return;
    }
    const stored = this.storedService(name);
    await this.web.closeHostedRooms(name);
    await this.web.unserve(name);
    this.stopService(name);
    const key = this.serviceKey(name);
    this.announceService(key.did, stored.spaces, []);
    // Everything it signs from now on counts nowhere.
    this.h.replica.write(this.h.identity, revocation(key.did, this.h.replica.number(key.did)));
    this.h.agents = this.h.agents.filter((a) => a.name !== name);
    rmSync(joinPath(this.h.home.agents, `${name}.json`), { force: true });
    this.saveServices(this.storedServices().filter((s) => s.name !== stored.name));
  }

  /** Whether a key is a service of that person: an agent key they named service:… */
  isServiceKey(signer: string, author: Did): boolean {
    const grant = this.h.replica.authority.grant(signer as Did);
    return !!grant && grant.role === 'agent' && grant.author === author && !!grant.name?.startsWith(SERVICE_PREFIX) && grant.revokedAfter === undefined;
  }

  async serviceProfiles(): Promise<ServiceProfileInfo[]> {
    const events = this.h.replica.events((e) => e.kind === KIND_SERVICE_PROFILE);
    return profilesOf(events, (signer, author) => this.isServiceKey(signer, author)).map((p) => ({
      did: p.did,
      person: this.h.actor(p.person, p.person),
      name: p.name,
      description: p.description,
      ...(p.icon ? { icon: p.icon } : {}),
      ...(p.builtin ? { builtin: p.builtin } : {}),
      contract: p.contract,
      origin: p.shipped ? this.shippedOrigin(p.shipped) : this.originInfo(p.builtin, p.origin),
      ...(p.settings ? { settings: p.settings } : {}),
      time: p.time,
    }));
  }

  /**
   * Where a service comes from, as far as this node can tell. A release's origin is checked where the project is
   * known here: the release has to be there, by a maintainer, and run what the profile says (its fingerprint).
   * Elsewhere it stays unchecked: only the project's people can see its releases.
   */
  originInfo(builtin: Builtin | undefined, origin: ServiceOrigin | undefined): ServiceOriginInfo {
    if (builtin) return { kind: 'weave' };
    if (!origin) return { kind: 'unreleased' };
    const project = this.h.spaces.get(origin.project);
    const base = { kind: 'release' as const, project: { id: origin.project, ...(project ? { name: this.h.spaceName(project) } : {}) }, tag: origin.tag, release: origin.release };
    if (!project) return { ...base, checked: 'unknown' };
    const found = artifactsOf(this.h.entries(project), this.h.state(project).maintainers).find((a) => a.id === origin.release);
    if (!found || releaseApproval(found) !== origin.fingerprint) return { ...base, checked: 'unmatched' };
    return { ...base, checked: 'verified', publisher: this.h.actor(found.author, found.signer as Did), ...(found.manifest.install?.image?.packaged ? { packaged: true as const } : {}) };
  }

  /** A shipped service's panels' folder (its pages ship with this Weave), if it has one. */
  shippedPanelFolder(name: string): string | undefined {
    return shippedHere(this.h).get(name)?.panel;
  }

  /**
   * A service's panels in a space: its own pages for its card, each for whoever may see it. Only a shipped service's
   * for now, and only when it runs exactly what this Weave ships (its pages are this Weave's copy).
   */
  async servicePanels(input: { space: string; service: string }): Promise<ServicePanelInfo[]> {
    const space = this.h.space(input.space);
    const did = await this.serviceDid(input.service);
    const profile = (await this.serviceProfiles()).find((p) => p.did === did);
    if (profile?.origin.kind !== 'shipped' || profile.origin.checked !== 'verified') return [];
    const s = shippedHere(this.h).get(profile.origin.name);
    if (!s?.panel) return [];
    const state = this.h.state(space);
    return (s.manifest.wasm?.panels ?? []).map((p) => ({
      name: p.name,
      title: p.title,
      who: p.who,
      key: `shipped-${s.name}`,
      page: p.page,
      mine: mayAct(p.who, this.h.identity.author, { owner: state.founder, maintainers: state.maintainers, members: state.members }, (board) => this.h.boardReaders(space, board), (group, person) => this.inGroup(group, person)),
    }));
  }

  /** The services this Weave ships, as the app offers them. */
  shippedServices(): ShippedServiceInfo[] {
    return [...shippedHere(this.h).values()].filter((s) => !s.manifest.fetcher).map((s) => ({ name: s.name, title: s.manifest.name, ...(s.about ? { about: s.about } : {}), contract: this.artifactContract(s.manifest), settings: s.manifest.env ?? [], digest: s.digest }));
  }

  /** A shipped service's claim, checked against what this Weave ships: the same digest, or another. */
  shippedOrigin(claim: { name: string; digest: string }): ServiceOriginInfo {
    return { kind: 'shipped', name: claim.name, checked: shippedHere(this.h).get(claim.name)?.digest === claim.digest ? 'verified' : 'other' };
  }

  /** A service by its key, or by "person/name" or its name when that's unique among the profiles known here. */
  async serviceDid(ref: string): Promise<Did> {
    const profiles = await this.serviceProfiles();
    const byKey = profiles.find((p) => p.did === ref);
    if (byKey) return byKey.did;
    const [person, name] = ref.includes('/') ? ref.split('/', 2) : [undefined, ref];
    const matches = profiles.filter((p) => p.name === name && (!person || p.person.name === person || p.person.did === person));
    if (matches.length === 1) return matches[0].did;
    throw new Error(matches.length ? `several services are named "${ref}": say whose (person/name)` : `no service "${ref}" is known here`);
  }

  async askService(input: { space: string; service: string; text: string; data?: Json; action?: string; as?: string; within?: number }): Promise<ServiceRequestInfo> {
    const to = await this.serviceDid(input.service);
    const profile = (await this.serviceProfiles()).find((p) => p.did === to);
    if (profile && !takesRequests(profile.contract)) throw new Error(`${profile.name} takes no requests: it ${contractWords(profile.contract)}`);
    if (input.action && profile) {
      const why = this.refusal(profile.contract, to, this.h.space(input.space), this.h.identity.author, input.action);
      if (why) throw new Error(`${profile.name}: ${why}`);
    }
    const text = input.text?.trim() ?? '';
    if (!text && input.data === undefined) throw new Error('ask with some text or data');
    // What's asked is for the service (and me) alone: the others see that it was asked, of whom, not what.
    const asked: Json = { ...(text ? { text } : {}), ...(input.data !== undefined ? { data: input.data } : {}), ...(input.action ? { action: input.action } : {}) };
    const sealed = [boxTo(to, asked), boxTo(this.h.encryptionKeyOf(this.h.identity.author), asked)] as unknown as Json[];
    const until = input.within ? new Date(this.h.clock() + Math.min(Math.max(input.within, 10), 30 * 86400) * 1000).toISOString() : undefined;
    const item = await this.h.publish({ kind: KIND_SERVICE_REQUEST, body: { to, for: sealed, ...(until ? { until } : {}) }, space: input.space, as: input.as });
    return (await this.serviceRequests({ space: item.space?.id ?? input.space })).find((r) => r.id === item.id)!;
  }

  /**
   * A request as the one it's for (or who asked) reads it: opened with a key of this node's services or mine. Sealed
   * for others: only whom it's for, and that it's private.
   */
  openRequest(body: unknown): Record<string, Json> {
    const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, Json>;
    if (!Array.isArray(b.for)) return b;
    const boxes = b.for as unknown as Box[];
    const service = this.h.agents.find((a) => a.did === b.to);
    for (const box of boxes) {
      let opened: Json | undefined;
      try {
        if (service) opened = openBox(service.keys.secretKey, service.keys.publicKey, box);
      } catch {
        opened = undefined;
      }
      opened ??= this.#openAnswer([box]);
      if (opened && typeof opened === 'object' && !Array.isArray(opened)) return { to: b.to, ...(b.until !== undefined ? { until: b.until } : {}), ...(opened as Record<string, Json>) };
    }
    return { to: b.to, ...(b.until !== undefined ? { until: b.until } : {}), sealed: true };
  }

  /** A space's entries, its requests opened where they're for us (requestsOf reads them as anyone's). */
  #openedEntries(space: StoredSpace) {
    return this.h.entries(space).map((e) => (e.kind === KIND_SERVICE_REQUEST ? { ...e, body: this.openRequest(e.body) as Json } : e));
  }

  /** Until when a request counts: as its asker said, or as its service's contract says for its action or protocol. */
  requestDeadline(contract: ServiceContract, body: Record<string, Json>, asked: string): number | undefined {
    const until = typeof body.until === 'string' ? Date.parse(body.until) : NaN;
    const key = typeof body.action === 'string' ? body.action : (body.data as { protocol?: unknown } | undefined)?.protocol;
    const seconds = typeof key === 'string' ? contract.expires?.[key] : undefined;
    const fromContract = seconds ? Date.parse(asked) + seconds * 1000 : NaN;
    const all = [until, fromContract].filter((t) => !Number.isNaN(t));
    return all.length ? Math.min(...all) : undefined;
  }

  async serviceRequests(input: { space: string; service?: string }): Promise<ServiceRequestInfo[]> {
    const space = this.h.space(input.space);
    const entries = this.#openedEntries(space);
    const to = input.service ? await this.serviceDid(input.service) : undefined;
    const results = entries.filter((e) => e.kind === KIND_SERVICE_RESULT);
    return requestsOf(entries, to).map((r) => ({
      id: r.id,
      to: this.h.actor(this.h.replica.authority.grant(r.to)?.author ?? r.to, r.to),
      from: this.h.actor(r.from, r.from),
      text: r.text,
      ...(r.data !== undefined ? { data: r.data as Json } : {}),
      ...(r.action ? { action: r.action } : {}),
      ...((entries.find((e) => e.id === r.id)?.body as { sealed?: unknown } | undefined)?.sealed ? { private: true as const } : {}),
      time: r.time,
      // Only the service it was for answers it.
      results: results
        .filter((e) => (e.body as { request?: unknown } | null)?.request === r.id && e.event.signer === r.to)
        .map((e) => {
          const sealed = (e.body ?? {}) as Record<string, Json>;
          // An answer for who asked: opened if that's me (or my service's), else only that it came.
          const boxes = Array.isArray(sealed.for) ? (sealed.for as unknown as Box[]) : undefined;
          const body = (boxes ? this.#openAnswer(boxes) : sealed) as Record<string, Json> | undefined;
          if (!body) return { id: e.id, text: '', private: true as const, time: e.event.time };
          return { id: e.id, text: typeof body.text === 'string' ? body.text : '', ...(body.data !== undefined ? { data: body.data } : {}), ...(typeof body.error === 'string' ? { error: body.error } : {}), time: e.event.time };
        }),
    }));
  }

  /** An answer sealed for who asked: its content, if one of the boxes is mine. */
  #openAnswer(boxes: Box[]): Json | undefined {
    for (const box of boxes) {
      const opened = this.h.tryOpen((me) => {
        try {
          return openBox(me.keys.secretKey, me.keys.publicKey, box);
        } catch {
          return undefined;
        }
      });
      if (opened !== undefined) return opened;
    }
    return undefined;
  }

  /**
   * What a service sees: in the spaces it was added to, requests addressed to it, and what its contract reads.
   * Never private data, never other spaces.
   */
  serviceSees(stored: StoredService, did: Did, d: Decoded): boolean {
    if (d.private || !d.space || !stored.spaces.includes(d.space.id)) return false;
    if (d.inner.kind === KIND_SERVICE_REQUEST) {
      const body = this.openRequest(d.inner.body) as { to?: unknown; action?: unknown; sealed?: unknown };
      if (!takesRequests(stored.contract) || body?.to !== did) return false;
      // Refused once (Weave answered no): it stays that, even if who may changes later.
      if (this.#refused.has(d.id)) return false;
      // Answered already (before a restart, say): never handed to it again.
      if (this.h.entries(d.space).some((e) => e.kind === KIND_SERVICE_RESULT && e.event.signer === did && (e.body as { request?: unknown } | null)?.request === d.id)) return false;
      // Older than it counts (the service was off): Weave says so, and the service never sees it.
      const deadline = this.requestDeadline(stored.contract, body as Record<string, Json>, d.event.time);
      if (deadline !== undefined && this.h.clock() > deadline) return (this.#refuse(stored, d.id, `it expired before ${stored.name} got to it: ask again`), false);
      const fetching = (body as { data?: { protocol?: unknown; artifact?: unknown } }).data;
      if (fetching?.protocol === PROTOCOL_ARTIFACT_FETCH && typeof fetching.artifact === 'string') {
        const no = this.artifactRefusal(d.space, fetching.artifact, d.event.author);
        if (no) return (this.#refuse(stored, d.id, no), false);
      }
      if (body.action === undefined) return true;
      // An action: only from someone who may use it here. Anyone else gets Weave's no, and the service never sees it.
      const why = this.refusal(stored.contract, did, d.space, d.event.author, String(body.action));
      if (why) this.#refuse(stored, d.id, why);
      return !why;
    }
    return serviceReads(stored.contract, d.inner.kind);
  }

  /** A feed item for a service: a request to it, opened. */
  itemFor(d: Decoded): FeedItem {
    return this.h.toItem(d.inner.kind === KIND_SERVICE_REQUEST ? { ...d, inner: { ...d.inner, body: this.openRequest(d.inner.body) as Json } } : d);
  }

  /** Why someone may not use an action of a service in a space, or undefined: they may. */
  refusal(contract: ServiceContract, service: Did, space: StoredSpace, person: Did, name: string): string | undefined {
    const action = contract.actions?.find((a) => a.name === name);
    if (!action) return `it has no action ${name}`;
    const state = this.h.state(space);
    const who = policiesOf(this.h.entries(space), state.maintainers, service, contract.actions!).get(name) ?? action.who;
    return mayAct(who, person, { owner: state.founder, maintainers: state.maintainers, members: state.members }, (board) => this.h.boardReaders(space, board), (group, person) => this.inGroup(group, person)) ? undefined : `only ${whoWords(who)} can ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)} in ${this.h.spaceName(space)}`;
  }

  /** Whether someone is in a group (a tier, say) this node knows; unknown here: no. */
  inGroup(group: string, person: Did): boolean {
    const space = this.h.spaces.get(group);
    return !!space && this.h.state(space).members.has(person);
  }

  /**
   * Launch a website artifact in a project you host websites in: it runs here as a service of yours (approved, as any
   * code from others), your website service hosts what it serves, and closing that website ends it.
   */
  async launchWebsite(input: { project: string; artifact: { project: string; id: string }; approve?: boolean; name?: string }): Promise<ServiceInfo> {
    const project = this.h.project(input.project);
    const from = this.h.project(input.artifact.project);
    const a = artifactsOf(this.h.entries(from), this.h.state(from).maintainers).find((x) => x.id === input.artifact.id);
    if (!a) throw new Error(`${this.h.spaceName(from)} has no such artifact`);
    if (a.kind !== 'website') throw new Error(`${a.manifest.name} is a ${a.kind.replace('-', ' ')}, not a website to launch`);
    const no = this.artifactRefusal(from, a.id, this.h.identity.author);
    if (no) throw new Error(no);
    if (!this.storedServices().some((s) => hostsWebsites(s) && s.enabled && s.spaces.includes(project.id))) throw new Error(`you host no websites in ${this.h.spaceName(project)}: add the Websites service there first`);
    // Its own name, unlike any service of yours.
    const base = serviceName(a.manifest.app) ? a.manifest.app : 'website';
    const taken = new Set(this.storedServices().map((s) => s.name));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    const added = await this.addService({ name, artifact: { project: from.id, tag: a.id }, spaces: [project.id], ...(input.approve ? { approve: true } : {}) });
    this.saveServices(this.storedServices().map((s) => (s.name === added.name ? { ...s, launched: true as const } : s)));
    return (await this.services()).find((s) => s.name === added.name) ?? added;
  }

  /**
   * A file's SHA-256 and size at an HTTPS address, for a provider pinning a release: downloaded here, nothing of it
   * kept. Never from this computer's networks; redirects followed only to HTTPS addresses that aren't either.
   */
  async fingerprint(address: string): Promise<{ sha256: string; size: number }> {
    let url = new URL(address);
    for (let hop = 0; ; hop++) {
      if (url.protocol !== 'https:') throw new Error('only an HTTPS address');
      await publicHost(url.hostname, this.h.testHosts());
      const res = await this.h.githubFetch()(url.href, { redirect: 'manual', headers: { 'user-agent': 'weave' } });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (next && hop < 5) {
        url = new URL(next, url);
        continue;
      }
      if (!res.ok || !res.body) throw new Error(`${url.hostname} said ${res.status}`);
      const hash = createHash('sha256');
      let size = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        size += value.byteLength;
      }
      return { sha256: hash.digest('hex'), size };
    }
  }

  /** Why someone may not get a project's artifact (its maintainers narrowed who may), or undefined: they may. */
  artifactRefusal(project: StoredSpace, artifact: string, person: Did): string | undefined {
    const state = this.h.state(project);
    const who = artifactAccessOf(this.h.entries(project), state.maintainers).get(artifact) ?? 'members';
    return mayAct(who, person, { owner: state.founder, maintainers: state.maintainers, members: state.members }, (board) => this.h.boardReaders(project, board), (group, p) => this.inGroup(group, p)) ? undefined : `only ${whoWords(who)} may get that in ${this.h.spaceName(project)}`;
  }

  /** Maintainers: who may get one of a project's artifacts (null: everyone there). */
  async setArtifactAccess(input: { project: string; artifact: string; who: ActionWho | null }): Promise<ArtifactInfo[]> {
    const project = this.h.project(input.project);
    if (!this.h.state(project).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(project)} decide who may get its artifacts`);
    if (!artifactsOf(this.h.entries(project), this.h.state(project).maintainers).some((a) => a.id === input.artifact)) throw new Error(`${this.h.spaceName(project)} has no such artifact`);
    const who = input.who === null ? 'members' : parseWho(input.who);
    if (!who) throw new Error('who is members, maintainers, owner, {board: <name>} or {group: <id>}');
    this.h.replica.write(this.h.identity, sealFor(this.h.cipher(project), { kind: KIND_ARTIFACT_ACCESS, body: { artifact: input.artifact, who: who as unknown as Json } }));
    return this.artifacts(project.id);
  }

  /** Requests refused already, so each is answered once. */
  #refused = new Set<string>();

  #refuse(stored: StoredService, request: string, why: string): void {
    if (this.#refused.has(request)) return;
    this.#refused.add(request);
    const gate = this.serviceGate(stored.token);
    void gate?.answer({ request, error: why }).catch(() => this.#refused.delete(request));
  }

  /** A service's actions in a space: who may use each there, and whether you may. */
  async serviceActions(input: { space: string; service: string }): Promise<ServiceActionInfo[]> {
    const space = this.h.space(input.space);
    const did = await this.serviceDid(input.service);
    const profile = (await this.serviceProfiles()).find((p) => p.did === did);
    const actions = profile?.contract.actions ?? [];
    const state = this.h.state(space);
    const tightened = policiesOf(this.h.entries(space), state.maintainers, did, actions);
    return actions.map((a) => {
      const who = tightened.get(a.name) ?? a.who;
      return { name: a.name, label: a.label, who, declared: a.who, ...(a.input ? { input: a.input } : {}), mine: mayAct(who, this.h.identity.author, { owner: state.founder, maintainers: state.maintainers, members: state.members }, (board) => this.h.boardReaders(space, board), (group, person) => this.inGroup(group, person)) };
    });
  }

  /** Maintainers: who may use a service's action in a space, tighter than its contract (or null: as it says). */
  async setServicePolicy(input: { space: string; service: string; action: string; who: ActionWho | null }): Promise<ServiceActionInfo[]> {
    const space = this.h.space(input.space);
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} decide who may use its services`);
    const did = await this.serviceDid(input.service);
    const action = (await this.serviceProfiles()).find((p) => p.did === did)?.contract.actions?.find((a) => a.name === input.action);
    if (!action) throw new Error(`that service has no action ${input.action}`);
    const who = input.who === null ? action.who : parseWho(input.who);
    if (!who) throw new Error('who is members, maintainers, owner, or {board: <name>}');
    if (!tightens(action.who, who)) throw new Error(`${action.label} is for ${whoWords(action.who)}: a project can make that narrower, not wider`);
    this.h.replica.write(this.h.identity, sealFor(this.h.cipher(space), { kind: KIND_SERVICE_POLICY, body: { service: did, action: action.name, who: who as unknown as Json } }));
    return this.serviceActions({ space: space.id, service: did });
  }

  /** The gate a service's token opens on the local API, or undefined for any other token. */
  serviceGate(token: string): ServiceGate | undefined {
    const given = Buffer.from(token);
    const stored = this.storedServices().find((s) => {
      const expected = Buffer.from(s.token);
      return expected.length === given.length && timingSafeEqual(expected, given);
    });
    if (!stored || !stored.enabled) return undefined;
    const name = stored.name;
    const key = this.serviceKey(name);
    const current = () => this.storedService(name);
    const inSpace = (ref: string) => {
      const space = this.h.space(ref);
      if (!current().spaces.includes(space.id)) throw new Error(`service "${name}" wasn't added to ${space.name}`);
      return space;
    };
    return {
      me: () => ({
        name,
        did: key.did,
        person: this.h.identity.author,
        contract: current().contract,
        spaces: (() => {
          const kept = this.settings.valuesOf(current());
          return this.serviceInfo(current()).spaces.map(({ id, kind, name: spaceName }) => ({ id, kind, name: spaceName, settings: { ...(current().spaceSettings?.[id] ?? {}), ...(kept[id] ?? {}) } }));
        })(),
      }),
      events: (since) =>
        this.h.decodeAll()
          .filter((d) => (!since || d.event.time > since) && this.serviceSees(current(), key.did, d))
          .sort((a, b) => a.event.time.localeCompare(b.event.time))
          .map((d) => this.itemFor(d)),
      watch: async (onItem, signal) => {
        const unsubscribe = this.h.replica.onAppend((event) => {
          const decoded = this.h.decode(event);
          if (decoded && this.serviceSees(current(), key.did, decoded)) onItem(this.itemFor(decoded));
        });
        // Stopped already (before it got going): it watches nothing.
        if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
        unsubscribe();
      },
      publish: async ({ space, kind, body }) => {
        const target = inSpace(space);
        if (kind === KIND_SERVICE_REQUEST) throw new Error('a service answers requests; it doesn\'t send them');
        return this.h.publish({ kind, body: body ?? null, space: target.id, as: name });
      },
      answer: async ({ request, text, data, error }) => {
        if (!takesRequests(current().contract)) throw new Error(`service "${name}" takes no requests in its contract`);
        const found = this.h.find(request, [KIND_SERVICE_REQUEST]);
        if (!found.space || (found.inner.body as { to?: unknown } | null)?.to !== key.did) throw new Error('that request isn\'t addressed to this service');
        inSpace(found.space.id);
        // For who asked alone (and the service's person): the others in the project see that it was answered, not what.
        const said: Json = { ...(text ? { text: String(text).slice(0, 4000) } : {}), ...(data !== undefined ? { data } : {}), ...(error ? { error: String(error).slice(0, 1000) } : {}) };
        const sealed = [...new Set([found.event.author, this.h.identity.author])].map((person) => boxTo(this.h.encryptionKeyOf(person), said) as unknown as Json);
        return this.h.publish({ kind: KIND_SERVICE_RESULT, body: { request: found.id, for: sealed }, space: found.space.id, as: name });
      },
      serve: (input) => this.web.serve(name, input),
    };
  }

  // Catalogs: spaces whose maintainers list Weave services for their people to install (see core catalog.ts).

  /** What installing a catalog entry would run, read from its image (shown before you approve it). */
  async catalogArtifact(input: { catalog: string; app: string }): Promise<ArtifactInfo> {
    const space = this.h.space(input.catalog);
    const entry = catalogOf(this.h.entries(space), this.h.state(space).maintainers).find((e) => e.app === input.app)!;
    const { project, artifact } = await this.fromCatalog(input);
    const m = artifact.manifest;
    const runs = this.h.runtime.runs(m);
    return {
      // A catalog lists it for anyone in its space to install.
      kind: artifactKindOf(m),
      who: 'members',
      mine: true,
      id: artifact.id,
      project: { id: project.id, kind: 'project', name: project.name },
      tag: artifact.tag,
      app: m.app,
      name: m.name,
      released: this.h.actor(entry.by, entry.by),
      time: entry.time,
      website: !!this.artifactWeb(m) || !!m.wasm?.site,
      settings: m.env ?? [],
      ...(m.service ? { applet: m.service } : {}),
      packaged: true,
      ...(runs ? { runs, command: this.h.runtime.command(`weave-service-${m.app}`, m) } : {}),
      ...(m.install?.image ? { from: { image: m.install.image.ref } } : {}),
    };
  }

  /** A catalog's entries, and which of them run here (by their image's digest). */
  async catalog(ref: string): Promise<CatalogEntryInfo[]> {
    const space = this.h.space(ref);
    const here = this.storedServices().filter((s) => s.artifact?.manifest.install?.image);
    return catalogOf(this.h.entries(space), this.h.state(space).maintainers).map((e) => {
      const from = this.h.spaces.get(e.origin.project);
      const installed = here.find((s) => s.artifact!.manifest.install!.image!.digest === e.image.digest);
      return {
        id: e.id,
        catalog: { id: space.id, kind: space.kind, name: this.h.spaceName(space) },
        app: e.app,
        name: e.name,
        summary: e.summary,
        origin: { project: { id: e.origin.project, ...(from ? { name: this.h.spaceName(from) } : {}) }, release: e.origin.release, tag: e.origin.tag },
        image: e.image,
        by: this.h.actor(e.by, e.by),
        time: e.time,
        ...(installed ? { installed: installed.name } : {}),
      };
    });
  }

  /** List a Weave service in a catalog (its maintainers): a release of a project you're in, by its image. */
  async listInCatalog(input: { catalog: string; artifact: { project: string; tag?: string }; summary?: string; as?: string }): Promise<CatalogEntryInfo> {
    const space = this.h.space(input.catalog);
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} list things in it`);
    const { project, artifact } = this.artifact(input.artifact.project, input.artifact.tag);
    const image = artifact.manifest.install?.image;
    if (!image?.packaged) throw new Error(`${artifact.manifest.name} ${artifact.tag} isn't a Weave service: catalogs list images that carry their manifest (weave service release)`);
    const body = { app: artifact.manifest.app, name: artifact.manifest.name, ...(input.summary?.trim() ? { summary: input.summary.trim().slice(0, 500) } : {}), origin: { project: project.id, release: artifact.id, tag: artifact.tag }, image: { ref: image.ref, tag: image.tag, digest: image.digest } };
    await this.h.publish({ kind: KIND_CATALOG_ENTRY, body, space: space.id, as: input.as });
    return (await this.catalog(space.id)).find((e) => e.app === body.app)!;
  }

  /** Take an app off a catalog (its maintainers). */
  async unlistFromCatalog(input: { catalog: string; app: string; as?: string }): Promise<void> {
    const space = this.h.space(input.catalog);
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} take things off it`);
    if (!(await this.catalog(space.id)).some((e) => e.app === input.app)) throw new Error(`${this.h.spaceName(space)} lists no "${input.app}"`);
    await this.h.publish({ kind: KIND_CATALOG_ENTRY, body: { app: input.app, removed: true }, space: space.id, as: input.as });
  }

  /**
   * A catalog entry, as installing it needs it: the manifest read from its image at its digest (the catalog only
   * points at it), and where it comes from, as the entry says.
   */
  async fromCatalog(from: { catalog: string; app: string }): Promise<{ project: { id: string; name: string }; artifact: { id: string; tag: string; manifest: AppManifest } }> {
    const space = this.h.space(from.catalog);
    const entry = catalogOf(this.h.entries(space), this.h.state(space).maintainers).find((e) => e.app === from.app);
    if (!entry) throw new Error(`${this.h.spaceName(space)} lists no "${from.app}"`);
    const { ref, tag, digest } = entry.image;
    const checked = checkServiceLabel((await imageLabels(ref, digest, { fetch: this.h.registryFetch() }))[SERVICE_LABEL]);
    if (!checked.manifest) throw new Error(`${ref}@${digest} isn't a Weave service: ${checked.problems.join('; ')}`);
    if (checked.manifest.app !== entry.app) throw new Error(`${this.h.spaceName(space)} lists "${entry.app}", but its image is "${checked.manifest.app}"`);
    const manifest = parseManifest({ ...checked.manifest, start: { image: ref }, install: { tag, image: { ref, tag, digest, packaged: true } } });
    const project = this.h.spaces.get(entry.origin.project);
    return { project: { id: entry.origin.project, name: project ? this.h.spaceName(project) : `a project listed in ${this.h.spaceName(space)}` }, artifact: { id: entry.origin.release, tag: entry.origin.tag, manifest } };
  }

  // Providers: services that hand out artifacts (artifact.fetch). Weave's GitHub service is one: it runs in the
  // node and answers with GitHub's download address for a release file, so participants without access to the
  // repository get it too. Whoever fetches checks the file against what the release's maintainer signed.

  /** How long to wait for a provider's answer (it has to reach the node the provider runs on, and back). */
  locateWait = 60_000;

  /** How long publishing through a provider may take: it fingerprints every file of the release. */
  publishWait = 10 * 60_000;

  /**
   * Ask the project's provider of GitHub releases to do something (publish, releases) and wait for its answer: what
   * it answered (data), or why not. It acts with its own GitHub access.
   */
  async askProvider(project: StoredSpace, action: string, data: Json, as?: string): Promise<Json> {
    const providers = (await this.servicesIn(project.id)).filter((p) => p.contract.offers?.includes(PROTOCOL_ARTIFACT_FETCH) && (!p.contract.sources || p.contract.sources.includes('github')));
    const provider = providers.find((p) => p.contract.actions?.some((a) => a.name === action));
    if (!provider) throw new Error(`${this.h.spaceName(project)} has no GitHub releases service to ${action === 'publish' ? 'publish' : 'list'} releases: add it (Services, Add a service)`);
    const by = `${provider.name} (${provider.person.name ?? 'its person'})`;
    const wait = action === 'publish' ? this.publishWait : this.locateWait;
    const asked = await this.askService({ space: project.id, service: provider.did, text: action === 'publish' ? `publish ${String((data as { tag?: unknown }).tag ?? '')}` : action, action, data, ...(as ? { as } : {}), within: Math.ceil(wait / 1000) });
    const until = Date.now() + wait;
    for (;;) {
      const result = (await this.serviceRequests({ space: project.id })).find((r) => r.id === asked.id)?.results[0];
      if (result?.error) throw new Error(`${by}: ${result.error}`);
      if (result) return result.data ?? null;
      if (Date.now() > until) throw new Error(`${by} didn't answer in time: is the node it runs on online?`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  /** Ask a provider in the release's project where to download its file for this computer; undefined when it has none. */
  async locateArtifact(a: StoredArtifact, platform = platformKey()): Promise<Located | undefined> {
    if (!this.h.spaces.has(a.project)) return undefined;
    // One that hands out artifacts from where this one's files are (any source, if its contract names none).
    const source = artifactSourceOf(a.manifest)?.provider;
    const provider = (await this.servicesIn(a.project)).find((p) => p.contract.offers?.includes(PROTOCOL_ARTIFACT_FETCH) && (!p.contract.sources || !source || p.contract.sources.includes(source)));
    // Open code: the fetcher gets it as it is, with nobody's grant (the provider needn't be there).
    const asset = a.manifest.install?.assets?.[platform];
    if (a.manifest.install?.access === 'direct' && a.manifest.install.github && asset) {
      const fetcher = provider?.contract.fetcher ?? DIRECT_FETCHERS[source ?? ''];
      if (fetcher) return { grant: { repo: a.manifest.install.github, tag: a.tag, file: asset.file }, fetcher, by: 'GitHub, directly' };
    }
    if (!provider) return undefined;
    const by = `${provider.name} (${provider.person.name ?? 'its person'})`;
    // Only worth answering while this node waits for it.
    const asked = await this.askService({ space: a.project, service: provider.did, text: `${a.manifest.name} ${a.tag}${platform === 'file' ? '' : ` for ${platform}`}`, data: { protocol: PROTOCOL_ARTIFACT_FETCH, artifact: a.id, platform }, within: Math.ceil(this.locateWait / 1000) + 30 });
    const until = Date.now() + this.locateWait;
    for (;;) {
      const result = (await this.serviceRequests({ space: a.project })).find((r) => r.id === asked.id)?.results[0];
      if (result?.error) throw new Error(`${by}: ${result.error}`);
      if (result) {
        // Its fetcher's grant: whatever it answered, for that fetcher alone (which runs here, with my own access).
        if (provider.contract.fetcher) {
          if (result.data === undefined) throw new Error(`${by} answered without a grant`);
          return { grant: result.data, fetcher: provider.contract.fetcher, by };
        }
        const url = (result.data as { url?: unknown } | undefined)?.url;
        if (typeof url === 'string' && url.startsWith('https://')) return { url, by };
        throw new Error(`${by} answered without a download address`);
      }
      if (Date.now() > until) throw new Error(`${by} didn't answer in time: is the node it runs on online?`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  /** The GitHub App a GitHub service's settings name (both, or neither); a half-given one is refused. */
  githubAppOf(settings: Record<string, string>): GitHubAppAuth | undefined {
    const id = settings.GITHUB_APP_ID;
    const key = settings.GITHUB_APP_KEY;
    if (!id && !key) return undefined;
    if (!id || !key) throw new Error('a GitHub App takes both its ID (GITHUB_APP_ID) and its private key (GITHUB_APP_KEY)');
    const kept = this.#apps.get(`${id}:${key}`);
    if (kept) return kept;
    const app = new GitHubAppAuth(id, key.replace(/\\n/g, '\n'), this.h.githubFetch(), this.h.clock);
    this.#apps.set(`${id}:${key}`, app);
    return app;
  }

  #apps = new Map<string, GitHubAppAuth>();

  /** The GitHub service on this node that acts as its person's own GitHub App, if one does. */
  githubApp(): { service: StoredService; app: GitHubAppAuth } | undefined {
    for (const s of this.storedServices().filter((x) => x.builtin === 'github' && x.enabled)) {
      const app = this.githubAppOf(s.settings);
      if (app) return { service: s, app };
    }
    return undefined;
  }

  /** Whether a GitHub service with an App of its own runs somewhere else (an always-on node): it keeps access in step then. */
  githubAppAway(): string | undefined {
    if (this.h.isLinkedNode) return undefined;
    const away = [...this.handedOver().values()].find((h) => h.builtin === 'github' && h.enabled !== false && (h.settingNames ?? []).includes('GITHUB_APP_KEY'));
    return away ? this.nodeKey(away.node).name : undefined;
  }

  /** GitHub for a repository: as the person's own App when it's installed there, else with this node's sign-in. */
  async githubFor(repo: string): Promise<GitHub> {
    const own = this.githubApp();
    const client = own ? await own.app.clientFor(repo) : undefined;
    return client ?? this.h.github();
  }

  // Setting up the person's own GitHub App in one go (GitHub's App-manifest flow): Weave opens a page on this
  // computer that sends GitHub the App's description, the person confirms on GitHub, GitHub sends them back with a
  // one-time code, and Weave exchanges it for the App's ID and key: they go into the GitHub service's settings.

  /** The port of this computer's local pages (http://weave.localhost:…), where GitHub sends the person back. */
  linkPort?: number;
  /** Setups started here, by their secret state: valid for an hour, once. */
  #appSetups = new Map<string, { service: string; org?: string; at: number }>();

  /** Start setting up a GitHub App for a GitHub service: the address to open in the browser. */
  githubAppSetup(input: { service?: string; org?: string }): { url: string } {
    const here = this.storedServices().filter((s) => s.builtin === 'github').map((s) => s.name);
    const away = this.h.isLinkedNode ? [] : [...this.handedOver().values()].filter((h) => h.builtin === 'github').map((h) => h.service);
    const all = [...here, ...away];
    const service = input.service ?? (all.length === 1 ? all[0] : undefined);
    if (!service || !all.includes(service)) throw new Error(all.length ? `which GitHub service? (${all.join(', ')})` : 'add the GitHub service first (weave service add github --builtin github)');
    const org = input.org?.trim();
    if (org && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(org)) throw new Error('an organization is its GitHub name, like acme');
    if (!this.linkPort) throw new Error("this computer's Weave doesn't serve its local pages (another Weave has their port): set the App's ID and key by hand instead");
    const state = b64u.encode(randomBytes(18));
    for (const [key, s] of this.#appSetups) if (this.h.clock() - s.at > 3600_000) this.#appSetups.delete(key);
    this.#appSetups.set(state, { service, ...(org ? { org } : {}), at: this.h.clock() });
    return { url: `http://${LINK_HOST}:${this.linkPort}/github/new-app?state=${state}` };
  }

  /** What the start page sends GitHub: where (the organization's or the person's App settings) and the App's description. */
  githubAppManifest(state: string): { action: string; manifest: string; org?: string; service: string } {
    const setup = this.#appSetups.get(state);
    if (!setup || this.h.clock() - setup.at > 3600_000) throw new Error('this setup link has expired or was used: start again in Weave');
    const back = `http://${LINK_HOST}:${this.linkPort}`;
    const person = (this.h.actor(this.h.identity.author, this.h.identity.author).name ?? 'my').replace(/[^A-Za-z0-9 -]/g, '').slice(0, 14).trim();
    const manifest = {
      // App names are unique on GitHub: a few random letters keep it free. It can be renamed on GitHub.
      name: `Weave ${person} ${b64u.encode(randomBytes(3)).replace(/[^A-Za-z0-9]/g, 'x')}`.slice(0, 34),
      description: 'Weave: keeps repository access in step with your Weave spaces, and hands their release files to participants.',
      url: back,
      redirect_url: `${back}/github/app-created`,
      public: false,
      default_permissions: { administration: 'write', contents: 'read', metadata: 'read' },
      default_events: [],
    };
    const action = setup.org ? `https://github.com/organizations/${setup.org}/settings/apps/new?state=${state}` : `https://github.com/settings/apps/new?state=${state}`;
    return { action, manifest: JSON.stringify(manifest), ...(setup.org ? { org: setup.org } : {}), service: setup.service };
  }

  /** GitHub sent the person back with a code: the App's ID and key go into the service; next, installing it. */
  async githubAppCreated(input: { code: string; state: string }): Promise<{ name: string; install: string; service: string }> {
    const setup = this.#appSetups.get(input.state);
    this.#appSetups.delete(input.state);
    if (!setup || this.h.clock() - setup.at > 3600_000) throw new Error('this setup has expired or was used: start again in Weave');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.code)) throw new Error('GitHub sent no code back');
    const res = await this.h.githubFetch()(`https://api.github.com/app-manifests/${input.code}/conversions`, { method: 'POST', headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
    const app = (await res.json().catch(() => ({}))) as { id?: number; slug?: string; name?: string; pem?: string; message?: string };
    if (!res.ok || !app.id || !app.pem || !app.slug) throw new Error(`GitHub didn't hand over the App${app.message ? `: ${app.message}` : ''}`);
    await this.setService({ name: setup.service, settings: { GITHUB_APP_ID: String(app.id), GITHUB_APP_KEY: app.pem } });
    return { name: app.name ?? app.slug, install: `https://github.com/apps/${app.slug}/installations/new`, service: setup.service };
  }

  /** Requests the node is answering now, so each is answered once. */
  #answering = new Set<string>();

  /** Weave's services that answer in the node (the GitHub service): each request addressed to them, once. */
  provide(): void {
    for (const stored of this.storedServices().filter((s) => s.builtin === 'github' && s.enabled)) {
      const did = this.serviceKey(stored.name).did;
      for (const id of stored.spaces) {
        const space = this.h.spaces.get(id);
        if (!space) continue;
        const entries = this.#openedEntries(space);
        const answered = new Set(entries.filter((e) => e.kind === KIND_SERVICE_RESULT && e.event.signer === did).map((e) => (e.body as { request?: unknown } | null)?.request));
        for (const r of requestsOf(entries, did)) {
          if (answered.has(r.id) || this.#answering.has(r.id)) continue;
          this.#answering.add(r.id);
          const deadline = this.requestDeadline(stored.contract, entries.find((e) => e.id === r.id)!.body as Record<string, Json>, r.time);
          if (deadline !== undefined && this.h.clock() > deadline) {
            void (this.serviceGate(stored.token)?.answer({ request: r.id, error: `it expired before ${stored.name} got to it: ask again` }) ?? Promise.resolve()).catch(() => {}).finally(() => this.#answering.delete(r.id));
            continue;
          }
          void this.answerFetch(stored, space, r).finally(() => this.#answering.delete(r.id));
        }
      }
    }
  }

  /** The GitHub service answers artifact.fetch: the release must be its space's, and the file its maintainer fingerprinted. */
  async answerFetch(stored: StoredService, space: StoredSpace, r: { id: string; from: Did; data?: unknown }): Promise<void> {
    const gate = this.serviceGate(stored.token);
    if (!gate) return;
    const data = (r.data && typeof r.data === 'object' ? r.data : {}) as { protocol?: unknown; artifact?: unknown; platform?: unknown };
    try {
      if (data.protocol !== PROTOCOL_ARTIFACT_FETCH) throw new Error(`${stored.name} answers ${PROTOCOL_ARTIFACT_FETCH} only`);
      const artifact = artifactsOf(this.h.entries(space), this.h.state(space).maintainers).find((a) => a.id === data.artifact);
      if (!artifact) throw new Error(`${this.h.spaceName(space)} has no such release`);
      const no = this.artifactRefusal(space, artifact.id, r.from);
      if (no) throw new Error(no);
      const asset = typeof data.platform === 'string' ? artifact.manifest.install?.assets?.[data.platform] : undefined;
      if (!asset) throw new Error(`${artifact.manifest.name} ${artifact.tag} has no file for ${String(data.platform)}`);
      const repo = artifact.manifest.install?.github;
      if (!repo) throw new Error(`${artifact.manifest.name} ${artifact.tag} isn't released on GitHub`);
      const client = await this.githubFor(repo);
      const found = (await client.release(repo, artifact.tag)).assets.find((x) => x.name === asset.file);
      if (!found) throw new Error(`the release ${artifact.tag} on GitHub has no file ${asset.file}`);
      const url = await client.downloadUrl(repo, found.id);
      await gate.answer({ request: r.id, data: { url, file: asset.file, sha256: asset.sha256, ...(asset.size ? { size: asset.size } : {}) } });
    } catch (error) {
      await gate.answer({ request: r.id, error: (error as Error).message }).catch(() => {});
    }
  }

  #providing = false;

  serviceApi?: string;

  /**
   * Websites from before Weave 0.21, whose website service started what answered them. A release now runs as a
   * service of its own: you approved it for that website, so it keeps running, and the website keeps its address.
   * A command is yours to start now: the website stays at its port and says so. On an always-on node, which can't
   * issue keys, a release's website says how to bring it back.
   */
  async migrateWebsites(): Promise<void> {
    type Old = StoredRoom & { handler?: { artifact?: StoredArtifact; command?: string[]; folder?: string }; settings?: Record<string, string> };
    for (const site of this.storedServices().filter((s) => s.builtin === 'website')) {
      for (const old of Object.values(site.hosted ?? {}) as Old[]) {
        if (!old.handler) continue;
        const { handler, settings, ...room } = old;
        let next: StoredRoom = room;
        if (handler.command) next = { ...room, note: `Weave no longer starts "${handler.command.join(' ')}" in ${handler.folder} for this website: start it yourself (weave website env gives it its token)` };
        else if (handler.artifact && this.h.isLinkedNode) next = { ...room, note: `Weave no longer runs ${handler.artifact.manifest.name} ${handler.artifact.tag} for this website: install it as a service from one of your computers (with --node), and it serves its website again` };
        else if (handler.artifact) {
          const a = handler.artifact;
          const taken = new Set(this.h.agents.map((k) => k.name));
          const base = serviceName(a.manifest.app) ?? 'app';
          const name = [base, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${base}-${n}`)].find((n) => !taken.has(n)) ?? `${base}-${room.id.slice(0, 6).toLowerCase()}`;
          // The website first, so the service finds it when it serves its page.
          next = { ...room, servedBy: name };
          this.saveWebsite(site.name, next);
          try {
            await this.addService({ name, artifact: { project: a.project, tag: a.tag }, spaces: [room.project], settings: settings ?? {}, approve: true });
            continue;
          } catch (error) {
            next = { ...room, note: `Weave no longer runs ${a.manifest.name} ${a.tag} for this website, and couldn't install it as a service: ${(error as Error).message}` };
          }
        }
        this.saveWebsite(site.name, next);
      }
    }
  }

  /** Keep a website of a website service as it is now. */
  saveWebsite(site: string, room: StoredRoom): void {
    this.saveServices(this.storedServices().map((s) => (s.name === site ? { ...s, hosted: { ...(s.hosted ?? {}), [room.id]: room } } : s)));
  }

  /** Start the enabled services (those with a web page serve it), now that the local API is up (the daemon calls this). */
  runServices(api: { port: number }): void {
    this.serviceApi = `http://127.0.0.1:${api.port}/v1/service`;
    // Weave's own providers answer as requests arrive (in a moment, so a burst of events is looked at once).
    if (!this.#providing) {
      this.#providing = true;
      let soon: ReturnType<typeof setTimeout> | undefined;
      // A service's setting changed in one of its spaces: it starts again with it (a sign-in renewed here likewise).
      const restarting = new Set<string>();
      const restart = (name: string) => {
        if (restarting.has(name)) return;
        restarting.add(name);
        setTimeout(() => {
          restarting.delete(name);
          const now = this.storedServices().find((x) => x.name === name);
          if (!now?.enabled || !this.h.runtime.running(`service:${name}`)) return;
          this.stopService(name);
          this.startService(now);
        }, 200);
      };
      this.h.replica.onAppend((event) => {
        soon ??= setTimeout(() => {
          soon = undefined;
          this.provide();
        }, 50);
        const d = this.h.decode(event);
        if (d?.inner.kind !== KIND_SERVICE_SETTING) return;
        const of = (d.inner.body as { service?: unknown } | null)?.service;
        for (const stored of this.storedServices()) if (stored.spaces.includes(d.space?.id ?? '') && this.serviceKey(stored.name).did === of) restart(stored.name);
      });
      this.provide();
      setInterval(() => {
        const running = this.storedServices().filter((x) => x.enabled && this.h.runtime.running(`service:${x.name}`));
        // A WebAssembly service asks for its settings as it goes; a process got them when it started.
        void this.settings.renew(running).then((names) => names.forEach((name) => !this.storedService(name).wasm && !this.storedService(name).artifact?.manifest.wasm && restart(name)));
      }, 60_000).unref();
    }
    void this.web.startAppApi().then(async () => {
      await this.migrateWebsites().catch(() => {});
      for (const stored of this.storedServices()) {
        this.startService(stored);
      }
    });
  }

  startService(stored: StoredService): void {
    if (!this.serviceApi || !this.web.appApiPort || !stored.enabled || this.h.runtime.running(`service:${stored.name}`)) return;
    const a = stored.artifact;
    if (stored.shipped) return this.startShipped(stored);
    if (!a && stored.wasm) return void this.spawnWasm(stored, stored.wasm);
    if (!a) return stored.command?.length ? this.spawnService(stored) : undefined;
    // An applet: only the release you approved, fetched and checked against its fingerprints first.
    if (!(stored.approved ?? []).includes(releaseApproval(a))) return void this.h.releases.jobs.set(`service:${stored.name}`, { error: 'approve what it runs first' });
    this.h.releases.ensure(stored.name, a, `service:${stored.name}`, () => {
      const now = this.storedServices().find((s) => s.name === stored.name);
      if (now?.enabled && now.artifact?.id === a.id) this.spawnService(now);
    });
  }

  /**
   * A service Weave ships: its component as this Weave ships it, only if the file is exactly that (its digest). After
   * an update the digest it runs changes, and its profile says so.
   */
  startShipped(stored: StoredService): void {
    const key = `service:${stored.name}`;
    const s = shippedHere(this.h).get(stored.shipped!.name);
    const problem = s ? shippedProblem(s) : `this Weave doesn't ship ${stored.shipped!.name} any more`;
    if (problem || !s) return void this.h.releases.jobs.set(key, { error: problem! });
    if (s.digest !== stored.shipped!.digest) {
      const after = { ...stored, shipped: { name: s.name, digest: s.digest } };
      this.saveServices(this.storedServices().map((x) => (x.name === stored.name ? after : x)));
      this.publishServiceProfile(after);
      stored = after;
    }
    void this.spawnWasm(stored, s.file, s.site);
  }

  /** Resolves when fetching an applet's release ends (for tests and the CLI). */
  async serviceReady(name: string): Promise<ServiceInfo> {
    await this.h.releases.done(`service:${name}`);
    return this.serviceInfo(this.storedService(name));
  }

  /** Run a service's process: its command (in its own folder), or its release (in the release's folder, or its container). */
  spawnService(stored: StoredService): void {
    if (!this.serviceApi || !this.web.appApiPort || this.h.runtime.running(`service:${stored.name}`)) return;
    const dir = joinPath(this.h.home.dir, 'services', stored.name);
    const a = stored.artifact;
    // A WebAssembly release: its component (and its site) from the release's folder, run in Weave.
    if (a?.manifest.wasm && this.h.runtime.runs(a.manifest) === 'wasm') {
      const folder = this.h.releases.folder(stored.name, a);
      return void this.spawnWasm(stored, joinPath(folder, a.manifest.wasm.component), a.manifest.wasm.site ? joinPath(folder, a.manifest.wasm.site) : undefined);
    }
    const container = a && this.h.runtime.runs(a.manifest) === 'container' ? `weave-service-${stored.name}` : undefined;
    let run: string[] | undefined = stored.command;
    let cwd = dir;
    if (a) {
      run = this.h.runtime.command(container ?? 'weave', a.manifest);
      if (!run) return void this.h.releases.jobs.set(`service:${stored.name}`, { error: `${a.manifest.name} ${a.tag} has nothing to run on this computer (${platformKey()})` });
      if (!container) cwd = this.h.releases.folder(stored.name, a);
    }
    if (!run?.length) return;
    const project = stored.spaces.filter((id) => this.h.spaces.get(id)?.kind === 'project');
    // An applet gets the settings its manifest names, nothing else; in a container, the local APIs are the host's.
    const given = this.settings.effective(stored);
    const settings = a ? Object.fromEntries((a.manifest.env ?? []).filter((e) => given[e.name]).map((e) => [e.name, given[e.name]])) : given;
    const host = container && process.platform !== 'linux' ? 'host.docker.internal' : '127.0.0.1';
    const web = a && this.artifactWeb(a.manifest);
    this.h.runtime.start(
      `service:${stored.name}`,
      {
        command: run,
        cwd,
        // Its settings, Weave's app API (who is who, as apps ask it; WEAVE_TOKEN also checks X-Weave-Person) and its
        // service API. Weave's own variables last.
        env: {
          HOME: dir,
          ...settings,
          ...(web ? { PORT: String(web.port) } : {}),
          WEAVE_API: `http://${host}:${this.web.appApiPort}`,
          WEAVE_TOKEN: stored.token,
          ...(project.length === 1 ? { WEAVE_PROJECT: project[0] } : {}),
          WEAVE_SERVICE: stored.name,
          WEAVE_SERVICE_API: this.serviceApi.replace('127.0.0.1', host),
          WEAVE_SERVICE_TOKEN: stored.token,
        },
        ...(container ? { container } : {}),
        log: joinPath(dir, 'service.log'),
        name: stored.name,
      },
      () => {
        const now = this.storedServices().find((s) => s.name === stored.name);
        if (now) this.startService(now);
      },
    );
    if (a) void this.serveWeb(stored);
  }

  /**
   * A release with a web page serves it: the runtime tells the website service of each project the service is in,
   * which makes the port reachable there. Services without a manifest serve theirs themselves (gate serve).
   */
  async serveWeb(stored: StoredService): Promise<void> {
    const web = stored.artifact && this.artifactWeb(stored.artifact.manifest);
    if (!web || !stored.contract.website) return;
    const projects = stored.spaces.filter((id) => this.h.spaces.get(id)?.kind === 'project');
    const errors: string[] = [];
    for (const space of projects) {
      try {
        // Its website there keeps its name (one from before 0.21 was named by whoever opened it).
        const before = this.web.hosted().find((h) => h.room.servedBy === stored.name && h.room.project === space);
        await this.web.serve(stored.name, { space, port: web.port, name: before?.room.name ?? stored.artifact!.manifest.name, ...(web.open ? { pages: web.open } : {}) });
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    const job = this.h.releases.jobs.get(`service:${stored.name}`);
    if (errors.length) this.h.releases.jobs.set(`service:${stored.name}`, { ...job, error: errors.join('; ') });
    else if (job?.error) this.h.releases.jobs.set(`service:${stored.name}`, { ...job, error: undefined });
  }

  /** A website service came to a project: the running services with a web page there serve it now. */
  serveRunning(): void {
    for (const s of this.storedServices()) if (s.enabled && this.h.runtime.running(`service:${s.name}`)) void this.serveWeb(s);
  }

  stopService(name: string): void {
    this.#watching.get(name)?.abort();
    this.#watching.delete(name);
    this.h.runtime.stop(`service:${name}`);
  }

  // WebAssembly services: Weave runs the component itself (Runtime.startWasm), and is its whole world: it reads
  // through the service's gate, so only what its contract lets it, and acts through it, so only as its contract says.

  /** What a WebAssembly service reads, while it runs: stopped with it. */
  #watching = new Map<string, AbortController>();

  /** A website's files for a WebAssembly service: a folder that is there. */
  siteFolder(path: string): string {
    const folder = resolvePath(path);
    if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error(`${path} isn't a folder on this computer`);
    return folder;
  }

  /**
   * Who a request to a WebAssembly service's website comes from: the player the website service vouches for in
   * X-Weave-Person (signed with the service's own token, lately), or, without one, the host (only this computer
   * reaches the site directly). A header that doesn't check out is turned away.
   */
  siteVisitor(stored: StoredService, header: string | string[] | undefined): Record<string, unknown> | undefined {
    if (header === undefined) {
      const me = this.h.identity.author;
      const name = this.h.actor(me, me).name;
      return { did: me, ...(name ? { name } : {}), host: true, member: true, maintainer: true };
    }
    const [payload, sig] = String(header).split('.');
    if (!payload || !sig) return undefined;
    const expected = createHmac('sha256', stored.token).update(payload).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    try {
      const { t, ...person } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { t?: number } & Record<string, unknown>;
      if (typeof t !== 'number' || Math.abs(this.h.clock() / 1000 - t) > 300 || typeof person.did !== 'string') return undefined;
      return person;
    } catch {
      return undefined;
    }
  }

  /** The ports Weave opened for WebAssembly services' websites, by service. */
  #sitePorts = new Map<string, number>();

  /**
   * The ports a service of code from others may serve as a website: a release's, as its manifest names them (its
   * process or its container listens there); a WebAssembly site's, as Weave opened it. Your own code (a command, or
   * a component of yours): undefined, any (it runs with your rights).
   */
  servesOn(stored: StoredService): Set<number> | undefined {
    if (!stored.artifact && !stored.shipped) return stored.wasm ? new Set([this.#sitePorts.get(stored.name)].filter((p): p is number => !!p)) : undefined;
    const ports = new Set<number>();
    for (const s of stored.artifact?.manifest.services ?? []) ports.add(s.port);
    const site = this.#sitePorts.get(stored.name);
    if (site) ports.add(site);
    return ports;
  }

  /** A WebAssembly service's website listens: it serves it in each of its projects (keeping a website's name there). */
  async serveWasmSite(stored: StoredService, port: number): Promise<void> {
    this.#sitePorts.set(stored.name, port);
    const errors: string[] = [];
    for (const space of stored.spaces.filter((id) => this.h.spaces.get(id)?.kind === 'project')) {
      try {
        const before = this.web.hosted().find((h) => h.room.servedBy === stored.name && h.room.project === space);
        await this.web.serve(stored.name, { space, port, name: before?.room.name ?? stored.artifact?.manifest.name ?? (stored.description || stored.name) });
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    if (errors.length) this.h.releases.jobs.set(`service:${stored.name}`, { error: errors.join('; ') });
  }

  /** A component file given for a service: a .wasm file that is there. */
  wasmFile(path: string): string {
    const file = resolvePath(path);
    if (!/\.wasm$/i.test(file) || !existsSync(file)) throw new Error(`${path} isn't a WebAssembly component (a .wasm file) on this computer`);
    return file;
  }

  /**
   * Run a WebAssembly service: transpiled once, then in a worker of its own, answered through its gate, and handed
   * what it may read, one item at a time: first what came while it was off (from where it got to), then as it comes.
   */
  /** What each running WebAssembly service watches with, by its key. */
  #watchers = new Map<string, AbortController>();

  async spawnWasm(stored: StoredService, component: string, site = stored.site): Promise<void> {
    const name = stored.name;
    const key = `service:${name}`;
    if (this.h.runtime.running(key)) return;
    const dir = joinPath(this.h.home.dir, 'services', name);
    let entry: string;
    try {
      entry = await prepareWasm(component, joinPath(dir, 'wasm'));
      this.h.releases.jobs.delete(key);
    } catch (error) {
      this.h.releases.jobs.set(key, { error: `${component} doesn't run as a Weave service: ${(error as Error).message}` });
      return;
    }
    const gate = this.serviceGate(stored.token);
    const now = this.storedServices().find((s) => s.name === name);
    if (!gate || !now?.enabled || this.h.runtime.running(key)) return;
    const log = joinPath(dir, 'service.log');
    const data = joinPath(dir, 'data');
    // Where it got to: what it has handled (or given up on), by time. A new service starts from when it was added.
    const cursorFile = joinPath(dir, 'cursor');
    let cursor = existsSync(cursorFile) ? readFileSync(cursorFile, 'utf8').trim() : (stored.since ?? new Date(this.h.clock()).toISOString());
    if (!existsSync(cursorFile)) writeFileSync(cursorFile, cursor);
    const watching = new AbortController();
    // One watcher per service: one of a run that was stopped (not crashed) would hand the new one everything twice.
    this.#watchers.get(key)?.abort();
    this.#watchers.set(key, watching);
    this.#watching.get(name)?.abort();
    this.#watching.set(name, watching);
    const handed = new Set<string>();
    // Its ticks (tickEvery): one at a time, none piling up while it's busy; they stop with it.
    const ticking: { timer?: ReturnType<typeof setInterval>; pending: boolean } = { pending: false };
    watching.signal.addEventListener('abort', () => clearInterval(ticking.timer));
    const hand = (item: FeedItem) => {
      // A run that was replaced hands nothing on.
      if (watching.signal.aborted || handed.has(item.id)) return;
      handed.add(item.id);
      this.h.runtime.deliver(key, JSON.stringify(item));
    };
    this.h.runtime.startWasm(
      key,
      {
        dir: joinPath(dir, 'wasm'),
        entry,
        data,
        log,
        name,
        // Its hosts, with the settings they name filled in (a bucket, a region).
        ...(stored.contract.net ? { net: resolveNet(stored.contract.net, this.settings.effective(stored)) } : {}),
        host: async (call, args) => {
          const current = this.storedServices().find((s) => s.name === name);
          if (!current?.enabled) throw new Error(`${name} is stopped`);
          if (call === 'me') return JSON.stringify(gate.me());
          if (call === 'setting') {
            // A key it signs with is never handed to it (sign uses it).
            if (asksOf(current)?.find((a) => a.name === String(args[0]))?.signing) return undefined;
            // A sign-in about to run out is renewed first: it always gets a current token.
            await this.settings.renew([current]);
            return this.settings.effective(current)[String(args[0])] ?? undefined;
          }
          if (call === 'websites' || call === 'closeWebsite') {
            // Only one that hosts websites, only in its projects, only the websites it hosts.
            if (!hostsWebsites(current)) throw new Error(`${name} doesn't host websites in its contract`);
            if (call === 'websites') {
              const space = this.h.spaces.get(String(args[0]));
              if (!space || !current.spaces.includes(space.id)) throw new Error(`${name} isn't in that project`);
              const hosted = new Set(Object.keys(current.hosted ?? {}));
              return JSON.stringify(
                (await this.web.websites(space.id))
                  .filter((w) => hosted.has(w.id))
                  .map((w) => {
                    const room = current.hosted![w.id];
                    return { id: w.id, name: w.name, host: w.host.name ?? w.host.did, ...(room.servedBy ? { by: room.servedBy } : {}), visitors: w.show ? 'ticket holders' : w.groups?.length ? 'members of tiers' : room.access?.invite ? 'invited people' : 'everyone here', open: w.open, time: w.time };
                  }),
              );
            }
            const id = String(args[0]);
            if (!current.hosted?.[id]) throw new Error(`${name} doesn't host that website`);
            return void (await this.web.closeWebsite(id));
          }
          if (call === 'release') {
            // Only a provider of releases' files, only its spaces' releases, only those its maintainers published.
            if (!current.contract.offers?.includes(PROTOCOL_ARTIFACT_FETCH)) throw new Error(`${name} doesn't offer ${PROTOCOL_ARTIFACT_FETCH}: it reads no releases`);
            const space = this.h.spaces.get(String(args[0]));
            if (!space || !current.spaces.includes(space.id)) return undefined;
            const found = artifactsOf(this.h.entries(space), this.h.state(space).maintainers).find((a) => a.id === String(args[1]));
            return found ? JSON.stringify({ id: found.id, tag: found.tag, name: found.manifest.name, manifest: found.manifest }) : undefined;
          }
          if (call === 'fingerprint' || call === 'pinImage') {
            // For a provider publishing what it hands out: only what it needs to pin a release, never more.
            if (!current.contract.offers?.includes(PROTOCOL_ARTIFACT_FETCH)) throw new Error(`${name} doesn't offer ${PROTOCOL_ARTIFACT_FETCH}: it publishes no releases`);
            if (call === 'pinImage') {
              const tags = (Array.isArray(args[1]) ? args[1] : []).map(String).slice(0, 5);
              return JSON.stringify(await imageDigest(String(args[0]), tags, { fetch: this.h.registryFetch() }));
            }
            return JSON.stringify(await this.fingerprint(String(args[0])));
          }
          if (call === 'sign') return signWith(this.settings.effective(current)[String(args[0])], String(args[0]), String(args[1]), args[2] as Uint8Array);
          if (call === 'tickEvery') {
            clearInterval(ticking.timer);
            const ms = Math.floor(Number(args[0]) || 0);
            if (ms > 0)
              ticking.timer = setInterval(() => {
                if (ticking.pending) return;
                ticking.pending = true;
                this.h.runtime.deliver(key, JSON.stringify({ kind: 'weave.tick', time: new Date(this.h.clock()).toISOString() }));
              }, Math.max(1000, ms)).unref();
            return;
          }
          if (call === 'publish') {
            const [space, kind, body] = args as [string, string, string];
            return JSON.stringify(await gate.publish({ space, kind, body: JSON.parse(body) as Json }));
          }
          if (call === 'answer') {
            const [request, text, data, error] = args as [string, string | undefined, string | undefined, string | undefined];
            return JSON.stringify(await gate.answer({ request, ...(text ? { text } : {}), ...(data !== undefined && data !== null ? { data: JSON.parse(data) as Json } : {}), ...(error ? { error } : {}) }));
          }
          if (call === 'load' || call === 'save') {
            // A file of its own /data folder, by a plain name: nothing outside it.
            const file = String(args[0]);
            if (!/^[a-z0-9._-]{1,100}$/.test(file) || file.startsWith('.')) throw new Error('a name is a-z, 0-9, ., _ and - (up to 100), not starting with a dot');
            const path = joinPath(data, file);
            if (call === 'load') return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
            const value = String(args[1]);
            if (value.length > 4 * 1024 * 1024) throw new Error('at most 4 MB under one name');
            return void writeFileSync(path, value);
          }
          if (call === 'log') return void appendFileSync(log, `${String(args[0]).slice(0, 2000)}\n`);
          throw new Error(`no host function ${call}`);
        },
        ready: () => {
          // Taken out while it was starting: nothing to hand it.
          if (!this.storedServices().some((s) => s.name === name)) return;
          // What it missed first, then as it comes.
          void gate.watch(hand, watching.signal);
          for (const item of gate.events(cursor)) hand(item);
        },
        ...(stored.contract.website
          ? {
              site: {
                ...(site ? { folder: site } : {}),
                who: (req) => this.siteVisitor(this.storedServices().find((s) => s.name === name) ?? stored, req.headers['x-weave-person']),
                listening: (port) => void this.serveWasmSite(stored, port),
              },
            }
          : {}),
        handled: (text) => {
          // A tick moves nothing on: the next one may come.
          if ((JSON.parse(text) as { kind?: string }).kind === 'weave.tick') return void (ticking.pending = false);
          const time = (JSON.parse(text) as FeedItem).time;
          if (time > cursor) {
            cursor = time;
            // Taken out meanwhile (its folder with it): nothing left to keep.
            if (existsSync(dirname(cursorFile))) writeFileSync(cursorFile, cursor);
          }
        },
      },
      () => {
        watching.abort();
        const again = this.storedServices().find((s) => s.name === name);
        if (again) this.startService(again);
      },
    );
  }

  stopServiceProcesses(): void {
    this.h.runtime.stopAll();
  }
}
