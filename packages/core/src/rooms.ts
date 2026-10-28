import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';
import { isDid } from './keys.ts';
import { isRepoName } from './github.ts';
import { isNetHost, lowerHost, parseContract, type ServiceContract } from './services.ts';
import { parseWho, type ActionWho } from './serviceactions.ts';

/*
 * Rooms and shared apps. A project can declare an app (its manifest); a host
 * opens a room and shares that app from their computer, and players use it
 * through an encrypted tunnel, as if it ran on theirs.
 *
 *   weave.app    {app, name, version, services, start}   a maintainer publishes the project's app manifest;
 *                                                       start: {hint, command}: how the host starts the app; Weave
 *                                                       runs the command only on the host's say-so (see node)
 *                                                       install: {github, tag, assets, steps}: where hosts get the app,
 *                                                       see AppInstall
 *                                                       env: [{name, label, secret, optional, hint}]: settings the host
 *                                                       fills in (an API key…), see AppSetting; only names, never values
 *                                                       sealed in the project, the latest by a maintainer counts
 *   weave.room   {room, name, service, key, invite, open, show}
 *                show: a ticketed show the room belongs to: only its ticket holders get in, while it's on
 *                groups: groups (tiers, say) whose members get in; with a show too, either lets them in
 *                                                       the host announces a room (open) or ends it (open: false);
 *                                                       `key` is the room's DHT public key, so only participants find it
 *
 * Who is in a room, what they say there and the app's traffic never touch the logs.
 */
export const KIND_APP = 'weave.app';
export const KIND_ROOM = 'weave.room';

export interface AppService {
  id: string;
  /** The port on the host's computer. */
  port: number;
  protocol: 'http' | 'tcp';
  /** Which page each side opens, and the button label. */
  open?: { host?: { path: string; label: string }; joiner?: { path: string; label: string } };
}

export interface AppManifest {
  app: string;
  name: string;
  version: number;
  /** The only ports a room may ever forward. */
  services: AppService[];
  /**
   * How to start the app on the host's computer. `hint` is shown to people;
   * `command` (program and arguments, no shell) can be run by Weave in the
   * host's own copy of the app, after the host has seen and approved it.
   */
  start?: {
    hint?: string;
    command?: string[];
    /**
     * For release builds Weave installed (see install): the command per platform, like
     * {"win32-x64": ["./band-ab.exe"], "linux-x64": ["./band-ab"]}. `command` stays for source checkouts.
     */
    release?: Record<string, string[]>;
    /**
     * A container image (stage: Weave and Docker), like "ghcr.io/martldennl/gameshow", without tag or digest:
     * weave app release pins the release's image by its digest (install.image), and hosts with Docker run it
     * sealed off from their computer, with only the services' ports.
     */
    image?: string;
  };
  /** How hosts get the app onto their computer. */
  install?: AppInstall;
  /** Settings each host fills in on their own computer, handed to the app as environment variables when Weave starts it. */
  env?: AppSetting[];
  /**
   * An applet: it acts on events in the spaces it's added to, under a key of its own with exactly this contract
   * (what it reads and writes). Installed, it becomes a service; an app (a web page, in `services`) runs in a room.
   */
  service?: ServiceContract;
  /**
   * A WebAssembly service: Weave runs it itself, with nothing installed (packages/sdk/wit/service.wit). Where its
   * component is in the package (a release archive, or the image), and its website's files if it has a website.
   */
  wasm?: AppWasm;
  /**
   * A client service: a board's lens, run by every member's own node (packages/sdk/wit/service.wit, the board
   * world). Its component turns the board's events into its state and its actions into proposed events; its site
   * shows it. It has no key of its own: what it proposes, a member signs, if they may.
   */
  client?: AppClient;
  /**
   * A fetcher: a client app that fetches artifacts for its person, on their node, with what a provider grants them
   * (artifact.fetch) and their own access. It answers no requests and has no key: Weave runs it when something is
   * to be fetched, in the projects its person allows, and checks what it hands over against the artifact's digest.
   */
  fetcher?: AppFetcher;
  /** A file: something to get, not to run (a document, a dataset, a model). Its one release file is install.assets.file. */
  file?: AppFile;
}

/** A client service's parts in its package, and the kinds its actions may propose. */
export interface AppClient {
  component: string;
  site?: string;
  writes: string[];
}

/** Where a WebAssembly service's parts are in its package: paths inside it, like "service.wasm" and "site". */
export interface AppFile {
  /** What it is, as a media type (application/pdf), if known. */
  type?: string;
}

export interface AppFetcher {
  /** Hosts it may reach over HTTPS, as a service's contract names them. */
  net?: string[];
}

export interface AppWasm {
  component: string;
  site?: string;
  /** The folder of its panels' pages (panels says which page is which). */
  panel?: string;
  /**
   * Its own pages in its card, each in the section of who may see it: an overview, a form. Shown sandboxed, with no
   * network: they act only through its actions (checked as buttons are), and get what they show by asking one.
   */
  panels?: AppPanel[];
}

export interface AppPanel {
  name: string;
  title: string;
  who: ActionWho;
  /** Its page in the panel folder, like index.html. */
  page: string;
}

/** A path inside a package: relative (a leading / is dropped, as in an image), and never out of it. */
const packagePath = (value: unknown): string | undefined => {
  const p = text(value, 200).replace(/\\/g, '/').replace(/^\/+/, '');
  return p && !p.split('/').some((part) => part === '..' || part === '') ? p : undefined;
};

/**
 * A setting the app reads from its environment, like an API key. The manifest
 * only names it; each host types the value on their computer, where it stays
 * (never in the project, a room or the repository), and Weave hands it to this
 * app alone when it starts it.
 */
export interface AppSetting {
  /** The environment variable, like DEEPSEEK_API_KEY. */
  name: string;
  /** What hosts see, like "DeepSeek API key". */
  label: string;
  /** Hidden while typed and never shown again. */
  secret?: true;
  /** The app runs without it (Weave starts it anyway). */
  optional?: true;
  /** Where to get it, like "platform.deepseek.com → API keys". */
  hint?: string;
  /** A sign-in rather than something typed: Weave opens the provider's page, and the service gets an access token. */
  oauth?: AppOAuth;
  /** A key the service signs with (sign, in the WIT) but never reads: setting() doesn't return it. */
  signing?: true;
}

/**
 * An OAuth sign-in a setting asks for: the provider's pages and the app's client (a desktop app's: PKCE, a loopback
 * address to come back to, as RFC 8252 has it). Weave keeps the grant, refreshes it on the node that runs the service,
 * and hands the service only a current access token.
 */
export interface AppOAuth {
  /** Where people allow it, like https://accounts.google.com/o/oauth2/v2/auth. */
  authorize: string;
  /** Where the code (and later the refresh token) becomes an access token. */
  token: string;
  /** The app's client ID with the provider, registered with a loopback redirect (http://127.0.0.1). */
  client: string;
  /** A desktop client's secret, where the provider issues one: in the repository, so not secret (Google's are like that). */
  clientSecret?: string;
  scopes?: string[];
}

/** Settings as a service's profile lists them (checked as a manifest's are; anything off is left out). */
export function appSettingsOf(value: unknown): AppSetting[] {
  if (!Array.isArray(value)) return [];
  const out: AppSetting[] = [];
  for (const raw of value.slice(0, 16)) {
    const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : '';
    if (!isSettingName(name) || out.some((x) => x.name === name)) continue;
    const label = typeof e.label === 'string' && e.label.trim() ? e.label.trim().slice(0, 60) : name;
    const hint = typeof e.hint === 'string' ? e.hint.trim().slice(0, 200) : '';
    const oauth = e.oauth === undefined ? undefined : parseOAuth(e.oauth).oauth;
    out.push({ name, label, ...(e.secret === true || e.signing === true || oauth ? { secret: true as const } : {}), ...(e.optional === true ? { optional: true as const } : {}), ...(hint ? { hint } : {}), ...(oauth ? { oauth } : {}), ...(e.signing === true && !oauth ? { signing: true as const } : {}) });
  }
  return out;
}

/** A setting's name: an environment variable in capitals, digits and _, none that changes how programs start. */
export const isSettingName = (name: string): boolean => ENV_NAME.test(name) && !ENV_RESERVED.test(name);

const httpsUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 500) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
};

/** A setting's oauth, checked: the problem with it, or what it is. */
export function parseOAuth(value: unknown): { oauth?: AppOAuth; problem?: string } {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const authorize = httpsUrl(o.authorize);
  const token = httpsUrl(o.token);
  const client = typeof o.client === 'string' ? o.client.trim().slice(0, 300) : '';
  if (!authorize || !token || !client) return { problem: '"oauth" names the provider’s pages and the app’s client: {"authorize": "https://…", "token": "https://…", "client": "<client id>", "scopes": [...]}' };
  const scopes = Array.isArray(o.scopes) ? o.scopes.filter((x): x is string => typeof x === 'string' && /^[!-~]{1,200}$/.test(x)).slice(0, 30) : [];
  const clientSecret = typeof o.clientSecret === 'string' ? o.clientSecret.trim().slice(0, 300) : '';
  return { oauth: { authorize, token, client, ...(clientSecret ? { clientSecret } : {}), ...(scopes.length ? { scopes } : {}) } };
}

/** Variables an app may not ask hosts for: they change how programs start or what they load. */
const ENV_RESERVED = /^(WEAVE_|NODE_|LD_|DYLD_|PATH$|PATHEXT$|COMSPEC$|SYSTEMROOT$|WINDIR$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$|PYTHON|ELECTRON_|BUN_)/i;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;

/**
 * Getting the app: release files on GitHub, one per platform, each with the
 * SHA-256 a maintainer published here (Weave refuses a file that doesn't
 * match, whatever GitHub serves), and steps for an agent where there's no
 * file for your computer (building from source and the like).
 */
export interface AppInstall {
  /** owner/name of the repository whose release holds the files. */
  github?: string;
  /** The release's tag, like v1.4: also the version people see. */
  tag?: string;
  /** By platform, as Node names it (win32-x64, darwin-arm64, linux-x64…): the release file. */
  assets?: Record<string, AppAsset>;
  /** For an agent installing it by hand. */
  steps?: string[];
  /** The GitHub App (its slug) the release is reached through, when not Weave's default: a private repo's files only download through an app installed on it. */
  app?: string;
  /** The release's container image, pinned by its digest (weave app release reads it from the registry). */
  image?: AppImage;
  /**
   * Where its files are, for a provider that knows that source (its contract's sources): {"provider": "s3", "ref":
   * "<what that provider understands>"}. Without, a GitHub release (github) or the image is its source.
   */
  source?: ArtifactSource;
}

/** Where an artifact's files are: a kind of place (github, oci, s3…) and what a provider of it understands. */
export interface ArtifactSource {
  provider: string;
  ref: string;
}

export interface AppImage {
  /** The image without tag or digest, like ghcr.io/martldennl/gameshow. */
  ref: string;
  /** The tag it was released under, for people. */
  tag: string;
  /** What runs: sha256:… of the image's manifest (or index). A tag can move; this can't. */
  digest: string;
  /** A Weave service: the manifest came from inside the image (its SERVICE_LABEL), so the digest pins it too. */
  packaged?: true;
}

/**
 * The Weave service format: an OCI image whose config carries the manifest in this label, as JSON (app, name,
 * service, services, env; no start or install: the image is what runs). Its digest pins the code and the manifest.
 */
export const SERVICE_LABEL = 'dev.weave.service';

/** A container image reference without tag or digest: [registry[:port]/]path, lowercase. */
export const IMAGE_REF = /^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*(?::\d{1,5})?\/)?[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IMAGE_TAG = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

export interface AppAsset {
  /** The file's name in the release. */
  file: string;
  sha256: string;
  /** In bytes. */
  size?: number;
}

const PLATFORM = /^((win32|darwin|linux)-(x64|arm64|ia32|arm)|wasm|file)$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/;
const SOURCE = /^[a-z][a-z0-9-]{0,39}$/;

/** An install block from untrusted input; undefined when it says nothing usable. */
export function parseInstall(input: unknown): AppInstall | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  const steps = Array.isArray(i.steps) ? i.steps.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 500)).slice(0, 30) : [];
  const assets: Record<string, AppAsset> = {};
  if (i.assets && typeof i.assets === 'object') {
    for (const [platform, raw] of Object.entries(i.assets as Record<string, unknown>).slice(0, 12)) {
      const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const file = text(a.file, 200);
      const sha256 = text(a.sha256, 64).toLowerCase();
      if (!PLATFORM.test(platform) || !file || /[\\/]/.test(file) || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`install.assets.${platform}: needs "file" (a name in the release) and its "sha256"`);
      const size = Number(a.size);
      assets[platform] = { file, sha256, ...(Number.isInteger(size) && size > 0 ? { size } : {}) };
    }
  }
  let image: AppImage | undefined;
  if (i.image !== undefined) {
    const raw = (i.image && typeof i.image === 'object' ? i.image : {}) as Record<string, unknown>;
    const ref = text(raw.ref, 255);
    const imageTag = text(raw.tag, 128);
    const digest = text(raw.digest, 80);
    if (!IMAGE_REF.test(ref) || !IMAGE_TAG.test(imageTag) || !DIGEST.test(digest)) throw new Error('"install.image" needs the image ("ref"), its "tag" and its "digest" (sha256:…): weave app release writes it');
    image = { ref, tag: imageTag, digest, ...(raw.packaged === true ? { packaged: true as const } : {}) };
  }
  const has = Object.keys(assets).length > 0;
  const github = text(i.github, 140);
  const tag = text(i.tag, 100);
  let source: ArtifactSource | undefined;
  if (i.source !== undefined) {
    const raw = (i.source && typeof i.source === 'object' ? i.source : {}) as Record<string, unknown>;
    const provider = text(raw.provider, 40);
    const ref = text(raw.ref, 500);
    if (!SOURCE.test(provider) || !ref) throw new Error('"install.source" is {"provider": "s3", "ref": "…"}: a kind of place, and what its provider understands');
    source = { provider, ref };
  }
  // A Weave service is its image: it needs no repository to come from (provenance says more, later). Files come from a
  // GitHub release, or from another source.
  if ((has || (image && !image.packaged)) && !isRepoName(github) && !source) throw new Error('"install.github" is the repository, owner/name (or "install.source" says where its files are)');
  if ((has || image) && !TAG.test(tag)) throw new Error('"install.tag" is the tag of the release, like v1.4');
  if (!has && !image && !steps.length) return undefined;
  const app = text(i.app, 100);
  return {
    ...(has || image ? { ...(isRepoName(github) ? { github } : {}), tag } : {}),
    ...(source ? { source } : {}),
    ...(has ? { assets } : {}),
    ...(image ? { image } : {}),
    ...(steps.length ? { steps } : {}),
    ...((has || image) && /^[a-z0-9][a-z0-9-]{0,99}$/.test(app) ? { app } : {}),
  };
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const path = (value: unknown): string => {
  const p = text(value, 200);
  return p.startsWith('/') ? p : `/${p}`;
};

/** What checking a manifest found: every problem at once (it can't be used until they're fixed), things worth a look, and the manifest as Weave reads it. */
export interface ManifestCheck {
  problems: string[];
  warnings: string[];
  manifest?: AppManifest;
}

const KNOWN = new Set(['app', 'name', 'version', 'services', 'start', 'install', 'env', 'service', 'wasm', 'client', 'fetcher', 'file']);

/** Check a manifest (weave.app.json) from untrusted input, collecting every problem rather than stopping at the first. */
export function checkManifest(input: unknown): ManifestCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { problems: ['a manifest is a JSON object, like {"app": "band-ab", "services": [...]}'], warnings };
  const m = input as Record<string, unknown>;
  for (const key of Object.keys(m)) if (!KNOWN.has(key)) warnings.push(`"${key}" isn't part of a manifest and is ignored (known: ${[...KNOWN].join(', ')})`);

  const app = text(m.app, 32);
  if (!SLUG.test(app)) problems.push('"app" is a short id: lowercase letters, digits and dashes, like "band-ab"');
  const name = text(m.name, 40) || app;
  if (!text(m.name, 40)) warnings.push('"name" is what people see; without it they see the id');

  // A service's contract, like {"reads": "addressed", "writes": ["weave.post"], "version": "1.0"}; "website": true
  // when it serves one itself (weave.serve). A web page in "services" is served without saying so.
  let service: ServiceContract | undefined;
  if (m.service !== undefined) {
    service = parseContract(m.service);
    if (!service) problems.push('"service" is a service\'s contract: what it reads ("nothing", "addressed", "space" or {"kinds": [...]}), which kinds it writes, and its "version" (like "1.0")');
    const net = (m.service as { net?: unknown }).net;
    if (net !== undefined) {
      const bad = Array.isArray(net) ? net.filter((h) => !isNetHost(lowerHost(h))) : [net];
      if (bad.length) problems.push(`"service.net" lists the hosts it reaches over HTTPS, by name: like ["api.example.com", "*.example.com"], no addresses or localhost (not ${bad.map((h) => JSON.stringify(h)).join(', ')})`);
      else if ((net as unknown[]).length > 20) warnings.push('only the first 20 hosts in "service.net" count');
    }
  }
  let services: AppService[] = [];
  if (!Array.isArray(m.services) || m.services.length === 0) {
    if (m.service === undefined && m.client === undefined && m.fetcher === undefined && m.file === undefined) problems.push('a manifest says what it does: its web page ("services", like [{"port": 3000}]), its contract ("service"), or both');
  } else {
    if (m.services.length > 8) warnings.push('only the first 8 services count');
    services = m.services.slice(0, 8).flatMap((raw, i): AppService[] => {
      const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const where = `services[${i}]`;
      let ok = true;
      const port = Number(s.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) (problems.push(`${where}: "port" is the port the app listens on, 1 to 65535`), (ok = false));
      const id = text(s.id, 32) || `service-${i + 1}`;
      if (!SLUG.test(id)) (problems.push(`${where}: "id" uses lowercase letters, digits and dashes`), (ok = false));
      if (s.protocol !== undefined && s.protocol !== 'http' && s.protocol !== 'tcp') warnings.push(`${where}: "protocol" is "http" or "tcp"; taking http`);
      const protocol = s.protocol === 'tcp' ? 'tcp' : 'http';
      const open = (s.open && typeof s.open === 'object' ? s.open : {}) as Record<string, Record<string, unknown> | undefined>;
      for (const key of Object.keys(open)) if (key !== 'host' && key !== 'joiner') warnings.push(`${where}.open: "${key}" is ignored; "host" and "joiner" are the two sides`);
      const side = (o: Record<string, unknown> | undefined, label: string, which: string) => {
        if (!o) return undefined;
        if (typeof o.path !== 'string') warnings.push(`${where}.open.${which}: "path" is the page to open, like "/play"; using "/"`);
        return { path: path(o.path), label: text(o.label, 30) || label };
      };
      const host = side(open.host, 'Open', 'host');
      const joiner = side(open.joiner, 'Play', 'joiner');
      if (protocol === 'http' && !host && !joiner) warnings.push(`${where}: no "open": everyone opens "/" (add open.host and open.joiner for different pages, or tell host and players apart with @weave/sdk)`);
      return ok ? [{ id, port, protocol, ...(host || joiner ? { open: { ...(host ? { host } : {}), ...(joiner ? { joiner } : {}) } } : {}) }] : [];
    });
  }

  const rawStart = (m.start && typeof m.start === 'object' ? m.start : {}) as Record<string, unknown>;
  const hint = text(rawStart.hint, 200);
  const commandOf = (parts: unknown, where: string): string[] | undefined => {
    if (!Array.isArray(parts) || parts.length === 0 || parts.length > 32 || !parts.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 500 && !p.includes('\0'))) {
      problems.push(`"${where}" is the program and its arguments as a list, without a shell, like ["node", "server.js"]`);
      return undefined;
    }
    return parts as string[];
  };
  const command = rawStart.command !== undefined ? commandOf(rawStart.command, 'start.command') : undefined;
  let release: Record<string, string[]> | undefined;
  if (rawStart.release !== undefined) {
    if (!rawStart.release || typeof rawStart.release !== 'object' || Array.isArray(rawStart.release)) problems.push('"start.release" maps platforms to commands, like {"win32-x64": ["./band-ab.exe"]}');
    else {
      release = {};
      for (const [platform, parts] of Object.entries(rawStart.release as Record<string, unknown>).slice(0, 12)) {
        if (!PLATFORM.test(platform)) problems.push(`"start.release" names platforms like win32-x64, darwin-arm64, darwin-x64, linux-x64 (not "${platform}")`);
        else {
          const c = commandOf(parts, `start.release.${platform}`);
          if (c) release[platform] = c;
        }
      }
    }
  }
  let image: string | undefined;
  if (rawStart.image !== undefined) {
    const ref = text(rawStart.image, 255);
    if (/[@]|:[^/]*$/.test(ref)) problems.push('"start.image" is the image without tag or digest, like "ghcr.io/you/app": weave app release pins the release\'s image by its digest');
    else if (!IMAGE_REF.test(ref)) problems.push(`"start.image" isn't an image name: lowercase, like "ghcr.io/you/app" or "you/app" on Docker Hub`);
    else image = ref;
  }
  // A WebAssembly service: where its component (and its site) are in the package. Weave starts it itself.
  let wasm: AppWasm | undefined;
  if (m.wasm !== undefined) {
    const raw = (m.wasm && typeof m.wasm === 'object' ? m.wasm : {}) as Record<string, unknown>;
    const component = packagePath(raw.component);
    const site = raw.site === undefined ? undefined : packagePath(raw.site);
    const panel = raw.panel === undefined ? undefined : packagePath(raw.panel);
    const panels: AppPanel[] = [];
    for (const [i, p] of (Array.isArray(raw.panels) ? raw.panels : []).slice(0, 8).entries()) {
      const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
      const who = parseWho(o.who);
      const page = packagePath(o.page);
      const name = text(o.name, 40);
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(name) || !who || !page) problems.push(`wasm.panels[${i}] is {"name": "launch", "title": "Launch a website", "who": "maintainers", "page": "launch.html"}`);
      else panels.push({ name, title: text(o.title, 60) || name, who, page });
    }
    if (!component || !/\.wasm$/i.test(component)) problems.push('"wasm.component" is where the component is in the package, like "service.wasm"');
    else if (raw.site !== undefined && !site) problems.push('"wasm.site" is the folder of its website\'s files in the package, like "site"');
    else if (panels.length && !panel) problems.push('"wasm.panel" is the folder of its panels\' pages in the package, like "panel"');
    else wasm = { component, ...(site ? { site } : {}), ...(panel ? { panel } : {}), ...(panels.length ? { panels } : {}) };
  }
  // A fetcher: a component (wasm) that fetches artifacts for its person, reaching only the hosts it names.
  let fetcher: AppFetcher | undefined;
  if (m.fetcher !== undefined) {
    const raw = (m.fetcher && typeof m.fetcher === 'object' && !Array.isArray(m.fetcher) ? m.fetcher : {}) as Record<string, unknown>;
    const net = Array.isArray(raw.net) ? raw.net.map(lowerHost) : [];
    const bad = net.filter((h) => !isNetHost(h));
    if (raw.net !== undefined && (!Array.isArray(raw.net) || bad.length)) problems.push('"fetcher.net" lists the hosts it reaches over HTTPS, by name: like ["api.github.com", "*.githubusercontent.com"]');
    else if (!m.wasm) problems.push('a fetcher is a WebAssembly component: say where it is ("wasm": {"component": "fetcher.wasm"})');
    else fetcher = { ...(net.length ? { net: [...new Set(net as string[])].slice(0, 20) } : {}) };
  }
  // A file: its media type, if it says.
  let file: AppFile | undefined;
  if (m.file !== undefined) {
    const raw = (m.file && typeof m.file === 'object' && !Array.isArray(m.file) ? m.file : {}) as Record<string, unknown>;
    const type = text(raw.type, 100);
    file = type && /^[a-z]+\/[a-z0-9.+-]+$/i.test(type) ? { type: type.toLowerCase() } : {};
  }
  // A client service: where its component and site are, and what its actions may write (the kinds members sign).
  let client: AppClient | undefined;
  if (m.client !== undefined) {
    const raw = (m.client && typeof m.client === 'object' ? m.client : {}) as Record<string, unknown>;
    const component = packagePath(raw.component);
    const site = raw.site === undefined ? undefined : packagePath(raw.site);
    const writes = Array.isArray(raw.writes) ? [...new Set(raw.writes.filter((k): k is string => typeof k === 'string' && /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(k)))].slice(0, 20) : [];
    if (!component || !/\.wasm$/i.test(component)) problems.push('"client.component" is where its component is in the package, like "board.wasm"');
    else if (raw.site !== undefined && !site) problems.push('"client.site" is the folder of its renderer in the package, like "site"');
    else client = { component, ...(site ? { site } : {}), writes };
  }
  if (!m.wasm && !m.client && rawStart.command === undefined && rawStart.release === undefined && rawStart.image === undefined) warnings.push('no "start": hosts have to start the app themselves (add start.command, and start.release or start.image for releases)');
  if (!m.wasm && !m.client && (rawStart.release !== undefined || rawStart.image !== undefined) && rawStart.command === undefined) warnings.push('no "start.command": a checkout of the repository (rather than a release build) can\'t be started by Weave');
  const start =
    hint || command || release || image
      ? { ...(hint ? { hint } : {}), ...(command ? { command } : {}), ...(release && Object.keys(release).length ? { release } : {}), ...(image ? { image } : {}) }
      : undefined;

  let install: AppInstall | undefined;
  try {
    install = parseInstall(m.install);
  } catch (error) {
    problems.push((error as Error).message);
  }
  if (install?.assets) warnings.push('"install.assets" are usually added by weave app release, which fingerprints each file; no need to write them');

  const env: AppSetting[] = [];
  if (m.env !== undefined) {
    if (!Array.isArray(m.env)) problems.push('"env" lists settings hosts fill in, like [{"name": "DEEPSEEK_API_KEY", "label": "DeepSeek API key", "secret": true}]');
    else {
      if (m.env.length > 16) warnings.push('only the first 16 settings in "env" count');
      for (const [i, raw] of m.env.slice(0, 16).entries()) {
        const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const where = `env[${i}]`;
        const name = text(e.name, 64);
        if (!ENV_NAME.test(name)) { problems.push(`${where}: "name" is an environment variable in capitals, digits and _, like DEEPSEEK_API_KEY`); continue; }
        if (ENV_RESERVED.test(name)) { problems.push(`${where}: ${name} can't be a setting: it changes how programs start (Weave sets WEAVE_* itself)`); continue; }
        if (env.some((x) => x.name === name)) { problems.push(`${where}: ${name} is listed twice`); continue; }
        if ('value' in e || 'default' in e) problems.push(`${where}: a manifest names a setting but never holds its value (it's in the repository): each host types it in Weave`);
        const label = text(e.label, 60) || name;
        if (!text(e.label, 60)) warnings.push(`${where}: "label" is what hosts see, like "DeepSeek API key"`);
        const hint = text(e.hint, 200);
        const oauth = e.oauth === undefined ? {} : parseOAuth(e.oauth);
        if (oauth.problem) { problems.push(`${where}: ${oauth.problem}`); continue; }
        env.push({ name, label, ...(e.secret === true || e.signing === true || oauth.oauth ? { secret: true as const } : {}), ...(e.optional === true ? { optional: true as const } : {}), ...(hint ? { hint } : {}), ...(oauth.oauth ? { oauth: oauth.oauth } : {}), ...(e.signing === true && !oauth.oauth ? { signing: true as const } : {}) });
      }
    }
  }

  if (problems.length) return { problems, warnings };
  return { problems, warnings, manifest: { app, name, version: Number.isInteger(m.version) ? (m.version as number) : 1, services, ...(start ? { start } : {}), ...(install ? { install } : {}), ...(env.length ? { env } : {}), ...(service ? { service } : {}), ...(wasm ? { wasm } : {}), ...(client ? { client } : {}), ...(fetcher ? { fetcher } : {}), ...(file ? { file } : {}) } };
}

/**
 * The manifest inside a Weave service's image (its SERVICE_LABEL), checked: what it says it is, reads, writes,
 * serves and asks for. How it starts is the image's own business, so "start" and "install" don't belong there.
 */
export function checkServiceLabel(label: string | undefined): ManifestCheck {
  if (label === undefined) return { problems: [`the image has no "${SERVICE_LABEL}" label: a Weave service carries its manifest there (LABEL ${SERVICE_LABEL}='{"app": …}' in its Dockerfile)`], warnings: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(label);
  } catch {
    return { problems: [`the "${SERVICE_LABEL}" label isn't JSON`], warnings: [] };
  }
  const checked = checkManifest(parsed);
  const given = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const extra = ['start', 'install'].filter((key) => given[key] !== undefined).map((key) => `"${key}"`);
  const warnings = [...checked.warnings.filter((w) => !/no "start"/.test(w)), ...(extra.length ? [`${extra.join(' and ')} in the label are ignored: the image is what runs`] : [])];
  if (!checked.manifest) return { problems: checked.problems, warnings };
  const { start: _start, install: _install, ...manifest } = checked.manifest;
  return { problems: [], warnings, manifest };
}

/** A manifest checked and cleaned, or an error naming everything that's wrong with it. */
export function parseManifest(input: unknown): AppManifest {
  const checked = checkManifest(input);
  if (!checked.manifest) throw new Error(checked.problems.join('; '));
  return checked.manifest;
}

/** An example weave.app.json, for people and agents writing one. */
export const MANIFEST_EXAMPLE = {
  app: 'band-ab',
  name: 'BAND AB!',
  services: [{ id: 'show', port: 3000, protocol: 'http', open: { host: { path: '/host', label: 'Open the stage' }, joiner: { path: '/play', label: 'Play' } } }],
  start: {
    hint: 'node server.js',
    command: ['node', 'server.js'],
    release: { 'win32-x64': ['./band-ab.exe'], 'darwin-arm64': ['./band-ab'], 'darwin-x64': ['./band-ab'], 'linux-x64': ['./band-ab'] },
  },
  install: { steps: ['git clone the repository', 'npm ci', 'npm start'] },
  env: [{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com → API keys' }],
};

/** What each part of a manifest means, and the rules. */
export const MANIFEST_RULES = [
  'The file is weave.app.json at the top of the repository. A host runs the app on their computer; a room shares it with the project through an encrypted tunnel.',
  'app: a short id, lowercase letters, digits and dashes (it stays the same across versions). name: what people see.',
  'services: the ports the app listens on, at most 8. A room shares exactly these ports and nothing else on the host\'s computer. Each has a port, an optional id, and protocol "http" (default) or "tcp".',
  'services[].open: for http services, the pages people open from Weave: host (for whoever hosts the room) and joiner (for everyone who joins), each a path like "/play" and a button label. Without open, everyone opens "/". Either way anyone can type any path: to tell host and players apart for real, ask Weave with @weave/sdk.',
  'start.command: how to start the app from a checkout of the repository, as a list (program, then arguments, no shell), run in the app\'s folder after whoever opens a room with it approves it.',
  'start.release: the command per platform (win32-x64, darwin-arm64, darwin-x64, linux-x64) for release builds Weave installs; with weave_release_workflow these are ["./<app>.exe"] on Windows and ["./<app>"] elsewhere.',
  'start.image: a container image without tag or digest, like "ghcr.io/you/app". Your release workflow builds and pushes it, tagged like the release (v1.2.0 or 1.2.0); weave app release pins it by its digest. Hosts with Docker run it with only the services\' ports (on 127.0.0.1), the settings in env, and nothing of their computer. Players are told apart by the X-Weave-Person header (@weave/sdk reads it), since a container sees no tunnel ports.',
  'start.hint: one line for hosts who start it by hand.',
  'env: settings each host fills in, like an API key: name (the environment variable), label, secret (hidden), optional (the app runs without it), hint (where to get it). Never put a value in the manifest: it lives in the repository. Whoever opens a room with it types it in Weave, it stays on their computer, and Weave hands it to that room\'s process alone. Read it from the environment (process.env.DEEPSEEK_API_KEY). A project’s maintainers can keep a service’s settings in the project instead (weave service setting): any of them changes them, a secret sealed for the service alone. "oauth": {"authorize": "https://…", "token": "https://…", "client": "<client id>", "scopes": [...]} makes a setting a sign-in: a maintainer signs in on the provider’s page (PKCE, back to 127.0.0.1), and the service gets a current access token, renewed by Weave. A service’s "net" may name settings as placeholders: "{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com".',
  'service: its contract, for a program that acts on events in the spaces it\'s added to, under a key of its own. It says what it reads ("nothing", "addressed": requests to it, "space": everything, or {"kinds": [...]}), which kinds it writes, "website": true if it serves one itself (POST /website, or weave.serve), and its version, like {"reads": "addressed", "writes": [], "version": "1.0"}. "net" lists the hosts a WebAssembly service may reach over HTTPS (["api.example.com", "*.example.com"]); without it, it reaches none. "actions" says what people may ask it to do, and who: [{"name": "publish", "label": "Publish a new version", "who": "maintainers", "input": [{"name": "tag", "label": "Version"}]}] (who: members, maintainers, owner or {"board": "<name>"}); Weave checks the asker before the service sees a request naming one, and a project can only make who narrower. Installed, it gets exactly those rights; a release asking for more needs a new yes. It reads and writes through WEAVE_SERVICE_API with WEAVE_SERVICE_TOKEN (GET /events, GET /watch, POST /publish, POST /answer). A release with a web page in services serves it as a website in the projects it is added to.',
  `A Weave service is an OCI image carrying this manifest in its "${SERVICE_LABEL}" label (as JSON, without start or install: the image is what runs). Release it with weave service release <image:tag>: Weave pins the tag to its digest and reads the manifest from the image. It runs in Weave's sandbox only (read-only, limited, with /data to keep things in).`,
  'wasm: a WebAssembly service (packages/sdk/wit/service.wit), which Weave runs itself with nothing installed, no Docker: {"component": "service.wasm", "site": "site"}, paths in its package. Its image is built for wasi/wasm (docker buildx --platform wasi/wasm, FROM scratch, the component and its site copied in), or its release file is for the platform "wasm" (weave app release --asset wasm=<file>). A website (the website world) has "site": Weave serves those files and holds its players\' connections.',
  'client: a client service, which shows a board its own way (the board world of packages/sdk/wit/service.wit; a starter: weave service new <folder> --lens): {"component": "board.wasm", "site": "site", "writes": ["weave.post", "kanban.move"]}. Released like wasm (an image for wasi/wasm, or a release file for "wasm"); a project\'s maintainers pin it to a board (weave board lens), and every member\'s Weave runs it with no key and no network. "writes": the kinds its actions may propose, which members sign: of Weave\'s own only posts and what members do with posts; kinds of its own name a post in the board ("target").',
  'install.steps: how to install it by hand, for agents (where there is no release build). install.github, tag and assets are added by weave app release: don\'t write them.',
  'The app should read its files relative to the folder it runs in (process.cwd()), listen on the ports in services, and serve the open paths.',
  "Who is who: players reach the app from 127.0.0.1, so it can't tell them apart by itself. When Weave starts the app it sets WEAVE_API, WEAVE_TOKEN and WEAVE_PROJECT; @weave/sdk (one file, no dependencies) turns them into weave.who(req) → {did, name, host, member, maintainer}, weave.project() and weave.access(did, {group}). Use the did as the player's id instead of asking for a name.",
];

/** The command that starts an app: a release build's own for this platform, when Weave installed one, or the one for source checkouts. */
export const startCommand = (app: AppManifest | undefined, platform: string, releaseBuild: boolean): string[] | undefined =>
  (releaseBuild ? app?.start?.release?.[platform] : undefined) ?? app?.start?.command;

/**
 * What an artifact is, which says who can use it: a service (Weave runs it, with its contract), a website (the
 * website service launches it), a board view (pinned to boards), a fetcher (a client app that fetches artifacts), an
 * app (its person runs it on their computer, in a room), or a file (something to get).
 */
export type ArtifactKind = 'service' | 'website' | 'board-view' | 'fetcher' | 'app' | 'file';

export function artifactKindOf(m: AppManifest): ArtifactKind {
  if (m.file) return 'file';
  if (m.fetcher) return 'fetcher';
  if (m.client) return 'board-view';
  const site = !!m.wasm?.site || m.services.some((s) => s.protocol === 'http');
  // A website reads nothing and writes nothing: it only shows its page (and holds its visitors' game).
  if (site && (!m.service || (m.service.reads === 'nothing' && !m.service.writes.length))) return 'website';
  if (m.service || m.install?.image?.packaged) return 'service';
  if (site) return 'website';
  return 'app';
}

/** Where an artifact's files are: its own source, a GitHub release, or its image. */
export function artifactSourceOf(m: AppManifest): ArtifactSource | undefined {
  if (m.install?.source) return m.install.source;
  if (m.install?.github && m.install.assets) return { provider: 'github', ref: m.install.github };
  if (m.install?.image) return { provider: 'oci', ref: `${m.install.image.ref}@${m.install.image.digest}` };
  if (m.install?.github) return { provider: 'github', ref: m.install.github };
  return undefined;
}

/**
 * An artifact: one release a project published (a weave.app with a tag and its files or image, by a maintainer), or
 * a file (weave.artifact). Anyone in the project can use it as its kind says, pinned to exactly this release.
 */
export interface Artifact {
  /** The event that published it. */
  id: string;
  tag: string;
  kind: ArtifactKind;
  source?: ArtifactSource;
  manifest: AppManifest;
  /** Who released it (a maintainer), and the key that signed (theirs, or their agent's). */
  author: Did;
  signer: string;
  time: string;
}

/**
 * A file a project hands out, as its manifest (a file, with its one release file): published by a maintainer, from a
 * GitHub release or another source. The project's app (weave.app) stays what it is.
 */
export const KIND_ARTIFACT = 'weave.artifact';

/** A project's artifacts, newest first: each one's tag once (its latest release), only by maintainers, only with something to get. */
export function artifactsOf(entries: Array<{ id: string; kind: string; body: Json; event: { author: Did; signer?: string; time: string } }>, maintainers: Set<Did>): Artifact[] {
  const byTag = new Map<string, Artifact>();
  for (const e of [...entries].filter((x) => x.kind === KIND_APP || x.kind === KIND_ARTIFACT).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    if (!maintainers.has(e.event.author)) continue;
    let manifest: AppManifest;
    try {
      manifest = parseManifest(e.body);
    } catch {
      continue;
    }
    const tag = manifest.install?.tag;
    if (!tag || !(manifest.install?.assets || manifest.install?.image)) continue;
    // A weave.artifact is a file, and only that: never something to run.
    if (e.kind === KIND_ARTIFACT && (!manifest.file || !manifest.install?.assets?.file)) continue;
    if (e.kind === KIND_APP && manifest.file) continue;
    const source = artifactSourceOf(manifest);
    byTag.set(`${manifest.app}\0${tag}`, { id: e.id, tag, kind: artifactKindOf(manifest), ...(source ? { source } : {}), manifest, author: e.event.author, signer: e.event.signer ?? e.event.author, time: e.event.time });
  }
  return [...byTag.values()].sort((a, b) => b.time.localeCompare(a.time));
}

export interface Room {
  id: string;
  host: Did;
  name: string;
  /** Which of the app's services is shared. */
  service: string;
  /** The room's DHT public key (hex). */
  key: string;
  /** Who may join: every participant, or these people. */
  invite: 'participants' | Did[];
  /** A ticketed show it belongs to: only ticket holders join, while the show is on. */
  show?: string;
  /** Groups (tiers, say) whose members may join; with a show, either a ticket or one of these lets someone in. */
  groups?: string[];
  /** The service that offers it (its key), when a service announced it rather than its person. */
  agent?: Did;
  /** The release it runs (an artifact of that project), when it was launched from one. */
  release?: { project: string; id: string; tag: string };
  /** Which page each side opens, and the ▶ label: whoever runs it (host), and everyone who joins. */
  pages?: RoomPages;
  open: boolean;
  time: string;
}

export interface RoomPages {
  host?: { path: string; label: string };
  joiner?: { path: string; label: string };
}

/** Pages from untrusted input: a path from the root and a short label, for either side. */
export function parsePages(value: unknown): RoomPages | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const side = (raw: unknown) => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const at = text(s.path, 200);
    return at.startsWith('/') ? { path: at, label: text(s.label, 30) || 'Open' } : undefined;
  };
  const host = side(v.host);
  const joiner = side(v.joiner);
  return host || joiner ? { ...(host ? { host } : {}), ...(joiner ? { joiner } : {}) } : undefined;
}

/** Rooms from announcements, the latest per room by its host counting. */
export function roomsOf(entries: Array<{ event: { author: Did; signer?: string; time: string }; kind: string; body: Json }>): Room[] {
  const rooms = new Map<string, Room>();
  for (const e of [...entries].filter((x) => x.kind === KIND_ROOM).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    const b = (e.body && typeof e.body === 'object' ? e.body : {}) as Record<string, unknown>;
    const id = text(b.room, 64);
    if (!id) continue;
    const before = rooms.get(id);
    // Only the host changes a room; a service's room, only that service. A service names itself as `agent`, and
    // that counts only when its own key signed (a person's devices sign their rooms too, and offer none).
    const agent = isDid(b.agent) && e.event.signer === b.agent ? b.agent : undefined;
    if (before && (before.host !== e.event.author || before.agent !== agent)) continue;
    if (b.open === false) {
      if (before) before.open = false;
      continue;
    }
    const key = text(b.key, 64);
    if (!/^[0-9a-f]{64}$/.test(key)) continue;
    const invite = Array.isArray(b.invite) ? b.invite.filter(isDid) : 'participants';
    const show = text(b.show, 100);
    const groups = Array.isArray(b.groups) ? b.groups.filter((g): g is string => typeof g === 'string' && g.length <= 100).slice(0, 10) : [];
    const pages = parsePages(b.pages);
    const r = (b.release && typeof b.release === 'object' && !Array.isArray(b.release) ? b.release : {}) as Record<string, unknown>;
    const release = typeof r.project === 'string' && typeof r.id === 'string' && typeof r.tag === 'string' && r.project.length <= 100 && r.id.length <= 100 && r.tag.length <= 100 ? { project: r.project, id: r.id, tag: r.tag } : undefined;
    rooms.set(id, { id, host: e.event.author, name: text(b.name, 60) || 'Room', service: text(b.service, 32), key, invite, ...(show ? { show } : {}), ...(groups.length ? { groups } : {}), ...(agent ? { agent } : {}), ...(pages ? { pages } : {}), ...(release ? { release } : {}), open: true, time: e.event.time });
  }
  return [...rooms.values()];
}
