import { b64u, catalogOf, KIND_CATALOG_ENTRY, checkServiceLabel, SERVICE_LABEL, parseManifest, takesRequests, type Builtin, type ServiceOrigin, isBuiltin, PROTOCOL_ARTIFACT_FETCH, boxTo, openBox, type Box, createSubKey, delegation, artifactsOf, type Artifact, randomBytes, revocation, sealFor, type AppManifest, type Did, type Json, KIND_SERVICE_PROFILE, KIND_SERVICE_REQUEST, KIND_SERVICE_RESULT, KIND_SERVICE_IN, servicesIn as servicesInSpace, SERVICE_PREFIX, parseContract, profilesOf, requestsOf, serviceName, servicePermissions, contractWords, serviceReads, type ServiceContract } from '@weave/core';
import { type ServiceGate, type ServiceInfo, type ArtifactInfo, type ServiceArtifactInfo, type ServiceProfileInfo, type ServiceOriginInfo, type CatalogEntryInfo, type ServiceRequestInfo } from './backend.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';
import { platformKey } from './appinstall.ts';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { createAndSaveAgent, saveAgent, type AgentKey } from './keystore.ts';
import { releaseApproval } from './runtime.ts';
import { imageLabels } from './registry.ts';
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

/** The services Weave ships: what each does, as its contract and in words. */
const BUILTIN: Record<Builtin, { contract: ServiceContract; description: string }> = {
  // Reads nothing and writes its websites.
  website: { contract: { reads: 'nothing', writes: [], website: true, version: '1.0' }, description: 'Websites: a way to join in with the project’s participants' },
  // Reads what's asked of it and answers: where to download a release's files.
  github: { contract: { reads: 'addressed', writes: [], offers: [PROTOCOL_ARTIFACT_FETCH], version: '1.0' }, description: 'Releases from GitHub: hands the project’s release files to its participants, with the GitHub sign-in of the node it runs on' },
};

/** A service's public profile: what it is, its contract, and where it comes from (a release, by ids only). */
const profileBody = (s: Pick<StoredService, 'name' | 'description' | 'icon' | 'builtin' | 'contract' | 'artifact'>): Json => ({
  name: s.name,
  description: s.description,
  ...(s.icon ? { icon: s.icon } : {}),
  ...(s.builtin ? { builtin: s.builtin } : {}),
  contract: s.contract as unknown as Json,
  ...(s.artifact ? { origin: { project: s.artifact.project, release: s.artifact.id, tag: s.artifact.tag, fingerprint: releaseApproval(s.artifact) } } : {}),
});

export class Services {
  readonly h: ServicesHost;
  readonly #web: () => Website;
  get web(): Website {
    return this.#web();
  }

  constructor(h: ServicesHost, web: () => Website) {
    this.h = h;
    this.#web = web;
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
      ...(stored.builtin ? { builtin: stored.builtin, ...(stored.builtin === 'website' ? { websites: Object.values(stored.hosted ?? {}).map((r) => this.web.hostedRoomInfo(r)) } : {}) } : {}),
      ...(stored.artifact ? { artifact: this.serviceArtifactInfo(stored.name, stored.artifact, true) } : {}),
      settings: Object.keys(stored.settings).sort(),
      enabled: stored.enabled,
      running: stored.builtin ? stored.enabled : this.h.runtime.running(`service:${stored.name}`),
    };
  }

  // Artifacts: a project's releases. A service runs one, pinned to it, in any space of yours.

  async artifacts(ref: string): Promise<ArtifactInfo[]> {
    const project = this.h.project(ref);
    return artifactsOf(this.h.entries(project), this.h.state(project).maintainers).map((a) => {
      const runs = this.h.runtime.runs(a.manifest);
      return {
        id: a.id,
        project: { id: project.id, kind: 'project', name: this.h.spaceName(project) },
        tag: a.tag,
        app: a.manifest.app,
        name: a.manifest.name,
        released: this.h.actor(a.author, a.signer as Did),
        time: a.time,
        website: !!this.artifactWeb(a.manifest),
        settings: a.manifest.env ?? [],
        ...(a.manifest.service ? { applet: a.manifest.service } : {}),
        ...(a.manifest.install?.image?.packaged ? { packaged: true as const } : {}),
        ...(runs ? { runs, command: this.h.runtime.command(`weave-${a.manifest.app}`, a.manifest) } : {}),
      };
    });
  }

  /** One release of a project: the one with this tag, or the latest. */
  artifact(ref: string, tag?: string): { project: StoredSpace; artifact: Artifact } {
    const project = this.h.project(ref);
    const all = artifactsOf(this.h.entries(project), this.h.state(project).maintainers);
    const artifact = tag ? all.find((a) => a.tag === tag) : all[0];
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
    const web = !!this.artifactWeb(app);
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
    if (!manifest.service && !this.artifactWeb(manifest)) throw new Error(`${manifest.name} ${found.artifact.tag} has nothing to run as a service: it can't replace ${name}`);
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

  /** Settings checked against what's allowed: an artifact's own, or any variable-like name for a command. */
  checkSettings(app: AppManifest | undefined, settings: Record<string, string | null>): void {
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
  async addService(input: { name?: string; description?: string; icon?: string; contract?: ServiceContract; spaces?: string[]; command?: string[]; node?: string; builtin?: Builtin; artifact?: { project: string; tag?: string }; from?: { catalog: string; app: string }; approve?: boolean; settings?: Record<string, string> }): Promise<ServiceInfo> {
    if (this.h.isLinkedNode) throw new Error("an always-on node can't issue keys: add the service on one of your computers, with --node for this one");
    const command = input.command?.filter((part) => typeof part === 'string' && part.length);
    const builtin = isBuiltin(input.builtin) ? input.builtin : undefined;
    if (builtin && command?.length) throw new Error(`the ${builtin} service runs in Weave: it runs no command`);
    // An applet: a release whose manifest declares its contract. Running it needs your yes, once per release.
    // Or a Weave service listed in a catalog: what it is comes from its image, not from the catalog.
    const found: { project: { id: string; name: string }; artifact: { id: string; tag: string; manifest: AppManifest } } | undefined = input.artifact ? this.artifact(input.artifact.project, input.artifact.tag) : input.from ? await this.fromCatalog(input.from) : undefined;
    if (found && (command?.length || builtin)) throw new Error('a service runs an applet, a command, or is the website service: one of them');
    const manifest = found?.artifact.manifest;
    if (manifest && !manifest.service && !this.artifactWeb(manifest)) throw new Error(`${manifest.name} has neither a contract ("service") nor a web page ("services"): nothing to run as a service`);
    if (manifest && !input.node && !this.h.runtime.command('weave', manifest)) throw new Error(this.h.runtime.whyNot(manifest));
    const approved = found ? releaseApproval(found.artifact) : undefined;
    if (found && !input.approve) throw new Error(`approve it first: Weave would run "${this.h.runtime.runText(manifest!)}" from ${manifest!.name} ${found.artifact.tag}, released in ${found.project.name}, as a service that ${contractWords(this.artifactContract(manifest!))}`);
    const settings = Object.fromEntries(Object.entries(input.settings ?? {}).map(([k, v]) => [k, String(v)]));
    this.checkSettings(manifest, settings);
    const missing = (manifest?.env ?? []).filter((e) => !e.optional && !settings[e.name]);
    if (missing.length) throw new Error(`${manifest!.name} needs ${missing.map((e) => e.label).join(', ')} (--setting ${missing[0].name}=…)`);
    const name = serviceName(input.name ?? builtin ?? manifest?.app);
    if (!name) throw new Error('a service name is lowercase letters, digits and dashes (up to 40)');
    if (this.h.agents.some((a) => a.name === name)) throw new Error(`you already have an agent or service named "${name}"`);
    // The website service reads nothing and writes its websites. A release: its manifest's contract.
    const contract = parseContract(builtin ? BUILTIN[builtin].contract : manifest ? this.artifactContract(manifest) : input.contract);
    if (!contract) throw new Error('a contract says what the service reads (addressed, space, or {kinds: [...]}), which kinds it writes, and its version (like 1.0)');
    const artifact: StoredArtifact | undefined = found && { project: found.project.id, id: found.artifact.id, tag: found.artifact.tag, manifest: found.artifact.manifest };
    const description = input.description?.trim().slice(0, 1000) ?? (builtin ? BUILTIN[builtin].description : found ? `${manifest!.name} ${found.artifact.tag}, from ${found.project.name}` : '');
    if (input.node) {
      if (this.handedOver().has(name)) throw new Error(`you already have a service named "${name}"`);
      return this.addNodeService(name, contract, { ...input, artifact, description, ...(builtin ? { builtin } : {}), ...(artifact ? { approved: [approved!] } : {}), settings }, command);
    }
    const stored: StoredService = {
      name,
      description,
      ...(input.icon?.startsWith('wblob:') ? { icon: input.icon } : {}),
      contract,
      spaces: this.serviceSpaces(input.spaces ?? []),
      ...(command?.length ? { command } : {}),
      ...(builtin ? { builtin } : {}),
      ...(artifact ? { artifact, approved: [approved!] } : {}),
      settings,
      token: b64u.encode(randomBytes(24)),
      enabled: true,
    };
    // Its own key, with exactly its contract's rights; named so that everyone knows it's a service.
    const permissions = servicePermissions(contract);
    const key = createAndSaveAgent(this.h.home, this.h.identity.author, name, permissions);
    this.h.replica.write(this.h.identity, delegation(key.did, 'agent', permissions, `${SERVICE_PREFIX}${name}`));
    this.h.agents.push(key);
    this.saveServices([...this.storedServices(), stored]);
    this.publishServiceProfile(stored);
    this.announceService(key.did, [], stored.spaces);
    // Services start once the app API runs (it gives them WEAVE_API).
    if (this.serviceApi) await this.web.startAppApi();
    this.startService(stored);
    if (builtin === 'website') this.serveRunning();
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
  async setService(input: { name: string; spaces?: string[]; command?: string[] | null; settings?: Record<string, string | null>; spaceSettings?: Record<string, Record<string, string | null>>; enabled?: boolean; description?: string; artifact?: { tag?: string }; approve?: boolean }): Promise<ServiceInfo> {
    const away = this.h.isLinkedNode ? undefined : this.handedOver().get(input.name);
    if (away && !this.storedServices().some((s) => s.name === input.name)) {
      if (input.spaceSettings) throw new Error('per-space settings work on this computer for now: always-on nodes come next');
      if (input.artifact && !away.artifact) throw new Error(`${away.service} isn't an applet: it runs no release`);
      if (away.artifact) this.checkSettings(away.artifact.manifest, input.settings ?? {});
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
    this.checkSettings((next?.artifact ?? before.artifact)?.manifest, input.settings ?? {});
    for (const [key, value] of Object.entries(input.settings ?? {})) {
      if (value === null) delete settings[key];
      else settings[key] = String(value);
    }
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
    const { command: _command, spaceSettings: _spaceSettings, ...rest } = before;
    const after: StoredService = {
      ...rest,
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
      origin: this.originInfo(p.builtin, p.origin),
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

  async askService(input: { space: string; service: string; text: string; data?: Json; as?: string }): Promise<ServiceRequestInfo> {
    const to = await this.serviceDid(input.service);
    const profile = (await this.serviceProfiles()).find((p) => p.did === to);
    if (profile && !takesRequests(profile.contract)) throw new Error(`${profile.name} takes no requests: it ${contractWords(profile.contract)}`);
    const text = input.text?.trim() ?? '';
    if (!text && input.data === undefined) throw new Error('ask with some text or data');
    const item = await this.h.publish({ kind: KIND_SERVICE_REQUEST, body: { to, ...(text ? { text } : {}), ...(input.data !== undefined ? { data: input.data } : {}) }, space: input.space, as: input.as });
    return (await this.serviceRequests({ space: item.space?.id ?? input.space })).find((r) => r.id === item.id)!;
  }

  async serviceRequests(input: { space: string; service?: string }): Promise<ServiceRequestInfo[]> {
    const space = this.h.space(input.space);
    const entries = this.h.entries(space);
    const to = input.service ? await this.serviceDid(input.service) : undefined;
    const results = entries.filter((e) => e.kind === KIND_SERVICE_RESULT);
    return requestsOf(entries, to).map((r) => ({
      id: r.id,
      to: this.h.actor(this.h.replica.authority.grant(r.to)?.author ?? r.to, r.to),
      from: this.h.actor(r.from, r.from),
      text: r.text,
      ...(r.data !== undefined ? { data: r.data as Json } : {}),
      time: r.time,
      // Only the service it was for answers it.
      results: results
        .filter((e) => (e.body as { request?: unknown } | null)?.request === r.id && e.event.signer === r.to)
        .map((e) => {
          const body = (e.body ?? {}) as Record<string, Json>;
          return { id: e.id, text: typeof body.text === 'string' ? body.text : '', ...(body.data !== undefined ? { data: body.data } : {}), ...(typeof body.error === 'string' ? { error: body.error } : {}), time: e.event.time };
        }),
    }));
  }

  /**
   * What a service sees: in the spaces it was added to, requests addressed to it, and what its contract reads.
   * Never private data, never other spaces.
   */
  serviceSees(stored: StoredService, did: Did, d: Decoded): boolean {
    if (d.private || !d.space || !stored.spaces.includes(d.space.id)) return false;
    if (d.inner.kind === KIND_SERVICE_REQUEST) return takesRequests(stored.contract) && (d.inner.body as { to?: unknown } | null)?.to === did;
    return serviceReads(stored.contract, d.inner.kind);
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
        spaces: this.serviceInfo(current()).spaces.map(({ id, kind, name: spaceName }) => ({ id, kind, name: spaceName, settings: current().spaceSettings?.[id] ?? {} })),
      }),
      events: (since) =>
        this.h.decodeAll()
          .filter((d) => (!since || d.event.time > since) && this.serviceSees(current(), key.did, d))
          .sort((a, b) => a.event.time.localeCompare(b.event.time))
          .map((d) => this.h.toItem(d)),
      watch: async (onItem, signal) => {
        const unsubscribe = this.h.replica.onAppend((event) => {
          const decoded = this.h.decode(event);
          if (decoded && this.serviceSees(current(), key.did, decoded)) onItem(this.h.toItem(decoded));
        });
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
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
        return this.h.publish({ kind: KIND_SERVICE_RESULT, body: { request: found.id, ...(text ? { text: String(text).slice(0, 4000) } : {}), ...(data !== undefined ? { data } : {}), ...(error ? { error: String(error).slice(0, 1000) } : {}) }, space: found.space.id, as: name });
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
      id: artifact.id,
      project: { id: project.id, kind: 'project', name: project.name },
      tag: artifact.tag,
      app: m.app,
      name: m.name,
      released: this.h.actor(entry.by, entry.by),
      time: entry.time,
      website: !!this.artifactWeb(m),
      settings: m.env ?? [],
      ...(m.service ? { applet: m.service } : {}),
      packaged: true,
      ...(runs ? { runs, command: this.h.runtime.command(`weave-${m.app}`, m) } : {}),
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

  /** Ask a provider in the release's project where to download its file for this computer; undefined when it has none. */
  async locateArtifact(a: StoredArtifact): Promise<Located | undefined> {
    if (!this.h.spaces.has(a.project)) return undefined;
    const provider = (await this.servicesIn(a.project)).find((p) => p.contract.offers?.includes(PROTOCOL_ARTIFACT_FETCH));
    if (!provider) return undefined;
    const by = `${provider.name} (${provider.person.name ?? 'its person'})`;
    const asked = await this.askService({ space: a.project, service: provider.did, text: `${a.manifest.name} ${a.tag} for ${platformKey()}`, data: { protocol: PROTOCOL_ARTIFACT_FETCH, artifact: a.id, platform: platformKey() } });
    const until = Date.now() + this.locateWait;
    for (;;) {
      const result = (await this.serviceRequests({ space: a.project })).find((r) => r.id === asked.id)?.results[0];
      if (result?.error) throw new Error(`${by}: ${result.error}`);
      if (result) {
        const url = (result.data as { url?: unknown } | undefined)?.url;
        if (typeof url === 'string' && url.startsWith('https://')) return { url, by };
        throw new Error(`${by} answered without a download address`);
      }
      if (Date.now() > until) throw new Error(`${by} didn't answer in time: is the node it runs on online?`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
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
        const entries = this.h.entries(space);
        const answered = new Set(entries.filter((e) => e.kind === KIND_SERVICE_RESULT && e.event.signer === did).map((e) => (e.body as { request?: unknown } | null)?.request));
        for (const r of requestsOf(entries, did)) {
          if (answered.has(r.id) || this.#answering.has(r.id)) continue;
          this.#answering.add(r.id);
          void this.answerFetch(stored, space, r).finally(() => this.#answering.delete(r.id));
        }
      }
    }
  }

  /** The GitHub service answers artifact.fetch: the release must be its space's, and the file its maintainer fingerprinted. */
  async answerFetch(stored: StoredService, space: StoredSpace, r: { id: string; data?: unknown }): Promise<void> {
    const gate = this.serviceGate(stored.token);
    if (!gate) return;
    const data = (r.data && typeof r.data === 'object' ? r.data : {}) as { protocol?: unknown; artifact?: unknown; platform?: unknown };
    try {
      if (data.protocol !== PROTOCOL_ARTIFACT_FETCH) throw new Error(`${stored.name} answers ${PROTOCOL_ARTIFACT_FETCH} only`);
      const artifact = artifactsOf(this.h.entries(space), this.h.state(space).maintainers).find((a) => a.id === data.artifact);
      if (!artifact) throw new Error(`${this.h.spaceName(space)} has no such release`);
      const asset = typeof data.platform === 'string' ? artifact.manifest.install?.assets?.[data.platform] : undefined;
      if (!asset) throw new Error(`${artifact.manifest.name} ${artifact.tag} has no file for ${String(data.platform)}`);
      const repo = artifact.manifest.install?.github;
      if (!repo) throw new Error(`${artifact.manifest.name} ${artifact.tag} isn't released on GitHub`);
      const client = this.h.github();
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
      this.h.replica.onAppend(() => {
        soon ??= setTimeout(() => {
          soon = undefined;
          this.provide();
        }, 50);
      });
      this.provide();
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
    if (!a) return stored.command?.length ? this.spawnService(stored) : undefined;
    // An applet: only the release you approved, fetched and checked against its fingerprints first.
    if (!(stored.approved ?? []).includes(releaseApproval(a))) return void this.h.releases.jobs.set(`service:${stored.name}`, { error: 'approve what it runs first' });
    this.h.releases.ensure(stored.name, a, `service:${stored.name}`, () => {
      const now = this.storedServices().find((s) => s.name === stored.name);
      if (now?.enabled && now.artifact?.id === a.id) this.spawnService(now);
    });
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
    const settings = a ? Object.fromEntries((a.manifest.env ?? []).filter((e) => stored.settings[e.name]).map((e) => [e.name, stored.settings[e.name]])) : stored.settings;
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
    this.h.runtime.stop(`service:${name}`);
  }

  stopServiceProcesses(): void {
    this.h.runtime.stopAll();
  }
}
