import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';
import { isDid } from './keys.ts';
import { isNetHost, lowerHost, parseContract, type ServiceContract } from './services.ts';
import { parseAppMarks, type AppMarks } from './marks.ts';
import { parseAppHints, type AppHints } from './hints.ts';
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
   * A mark service: what shows next to names, from an issuer someone chose (the marks world of
   * packages/sdk/wit/service.wit; docs/v2-stage19.md). Pure like a client service, run by every node that took it in.
   */
  marks?: AppMarks;
  /**
   * A hint service: numbers about your own state next to places, from a service you chose (the marks world too;
   * docs/v2-stage20.md). Pure, yours only, never a claim about anyone.
   */
  hints?: AppHints;
  /**
   * A fetcher: a client app that fetches artifacts for its person, on their node, with what a provider grants them
   * (artifact.fetch) and their own access. It answers no requests and has no key: Weave runs it when something is
   * to be fetched, in the projects its person allows, and checks what it hands over against the artifact's digest.
   */
  fetcher?: AppFetcher;
  /** A file: something to get, not to run (a document, a dataset, a model). Its one release file is install.assets.file. */
  file?: AppFile;
  /**
   * A verifier: a client app that checks people's accounts on platforms (weave.account), run by whoever looks, so
   * nobody has to trust anyone's word that an account is theirs.
   */
  verifier?: AppVerifier;
  /**
   * A service's lists, shown by Weave in its card the same way for every service, however it runs (WebAssembly, a
   * container, a program): what's in each (an action answers its items), + to add one, a trash can to remove one, and
   * each item's main button: each only for who may (as its action says, or whoever runs it for what's theirs).
   */
  lists?: AppList[];
  /**
   * A keyvault: a client app of its person's that holds their access to a platform (their GitHub App, say) and hands
   * their services only access derived from it, cut to what each declared (uses, in its contract) and to what its
   * person handed each project. Shown in Keys & devices, never in a project.
   */
  keyvault?: AppKeyvault;
}

/** What a keyvault holds access to, and where it may reach. */
export interface AppKeyvault {
  /** The platform it holds access to (github…): services name it in "uses". */
  platform: string;
  /** Hosts it may reach over HTTPS. */
  net?: string[];
  /** What it hands to projects, in words: "repositories". */
  resources?: string;
}

/** A client service's parts in its package, and the kinds its actions may propose. */
export interface AppClient {
  component: string;
  site?: string;
  writes: string[];
}

/** Where a WebAssembly service's parts are in its package: paths inside it, like "service.wasm" and "site". */
export interface AppVerifier {
  /** The platforms it checks accounts on (github, x…). */
  platforms: string[];
  /** Hosts it may reach over HTTPS, as a service's contract names them. */
  net?: string[];
  /** How to make a proof there, for people (where, and that it holds your Weave id). */
  howto?: string;
  /** An account's page there, with {handle} in it: https://github.com/{handle}. */
  page?: string;
  /** Its platform's icon, one of Weave's by name ("github"): Weave knows no platform's look. */
  icon?: string;
  /**
   * It makes the proof itself (prove in the WIT), with a sign-in with a code there, used once and forgotten: one click
   * instead of making a proof by hand.
   */
  prove?: AppOAuth;
}

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

/**
 * A list of a service's things (running websites, repositories offered, releases, files). Its items, as `list`
 * answers them: [{id, title, detail?, url?, done?, use?: false, remove?: false, more?: [{action, label}]}], where done
 * is said instead of the main button (you have it), and more are each item's other buttons.
 */
export interface AppList {
  name: string;
  title: string;
  /** What one is, in words: "website", "access offer". */
  item?: string;
  /** The action that answers its items. */
  list: string;
  /** Adding one: an action of its own, or whoever runs it handing one from their keyvault for a platform (hand). */
  add?: { action: string; label?: string } | { hand: string; label?: string };
  /** Removing one: an action, given {id}. */
  remove?: { action: string; label?: string };
  /** Each item's main button: an action given {id}, or sharing your proven account on a platform with the project (account). */
  use?: { action: string; label: string } | { account: string; label: string };
  /** Other actions its items offer (more): shown on them, not as buttons of their own. */
  covers?: string[];
}

/** A list as a manifest names it, checked: or why not. */
function parseList(value: unknown): AppList | string {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const name = (v: unknown) => (typeof v === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(v) ? v : undefined);
  const part = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
  const label = (v: unknown) => text(v, 40) || undefined;
  const add = part(o.add);
  const remove = part(o.remove);
  const use = part(o.use);
  const list: AppList = {
    name: name(o.name) ?? '',
    title: text(o.title, 60),
    ...(text(o.item, 40) ? { item: text(o.item, 40) } : {}),
    list: name(o.list) ?? '',
    ...(add && name(add.action) ? { add: { action: name(add.action)!, ...(label(add.label) ? { label: label(add.label) } : {}) } } : add && name(add.hand) ? { add: { hand: name(add.hand)!, ...(label(add.label) ? { label: label(add.label) } : {}) } } : {}),
    ...(remove && name(remove.action) ? { remove: { action: name(remove.action)!, ...(label(remove.label) ? { label: label(remove.label) } : {}) } } : {}),
    ...(use && label(use.label) && name(use.action) ? { use: { action: name(use.action)!, label: label(use.label)! } } : use && label(use.label) && name(use.account) ? { use: { account: name(use.account)!, label: label(use.label)! } } : {}),
    ...(Array.isArray(o.covers) && o.covers.some((c) => name(c)) ? { covers: o.covers.flatMap((c) => (name(c) ? [name(c)!] : [])).slice(0, 10) } : {}),
  };
  if (!list.name || !list.title || !list.list) return '{"name": "websites", "title": "Running websites", "list": "list", "add": {"action": "open"}, "remove": {"action": "close"}, "use": {"action": "visit", "label": "Visit"}}';
  if ((o.add !== undefined && !list.add) || (o.remove !== undefined && !list.remove) || (o.use !== undefined && !list.use)) return 'add is {"action"} or {"hand": platform}, remove {"action"}, use {"action", "label"} or {"account": platform, "label"}';
  return list;
}

export interface AppPanel {
  name: string;
  title: string;
  who: ActionWho;
  /** Its page in the panel folder, like index.html. */
  page: string;
  /** The actions it stands in for: the app shows no button of their own where the panel is shown. */
  covers?: string[];
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
  /**
   * Picked from a list rather than typed: one of its actions (for maintainers) answers the choices, as
   * [{value, label?, note?}] (a repository its sign-in reaches, say). With many, several, one per line.
   */
  choose?: { action: string; many?: true };
  /**
   * Kept by whoever runs the service, once for every project it's in (a sign-in as them, say), never in a project:
   * the service acts as its person there.
   */
  yours?: true;
  /**
   * (Mind: picked from a list and yours, it's per project, but only whoever runs it picks: what its own access reaches
   * is theirs to hand to a project, not the project's maintainers'.)
   *
   * An app of its own registered with the provider, as whoever runs the service (GitHub's App manifest flow): Weave
   * hands the provider's page the app's manifest, the person creates it there, and Weave exchanges the code it gets
   * back for the app. Always yours. The service reads what `keep` names (setting(), as JSON) and signs with the
   * field `key` names (sign()); it never reads that key.
   */
  register?: AppRegister;
}

/** How an app is registered with a provider: its page, where its code becomes the app, and what's kept of it. */
export interface AppRegister {
  /** The provider's page the manifest is posted to (a form field "manifest"), with ?state=… */
  page: string;
  /** Where the code the provider sends back becomes the app ({code} in it): POSTed, JSON back. */
  exchange: string;
  /**
   * The app's manifest, as the provider takes it: Weave adds where to come back to (redirect_url). In its name,
   * {account} becomes whose it is (the account they proved on `platform`, else their name), {random} a few letters.
   */
  manifest: Record<string, Json>;
  /** The platform whose proven account names the app ({account}): github, say. */
  platform?: string;
  /** The fields of the app kept for the service, like id or slug (owner.login reaches inside). */
  keep: string[];
  /** The field that holds the app's private key: Weave signs with it for the service. */
  key: string;
  /** Opened once it's there, with kept fields in braces: installing it, say ({html_url}/installations/new). */
  then?: string;
}

/** An app registration as a manifest names it, checked. */
export function parseRegister(value: unknown): { register?: AppRegister; problem?: string } {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const page = httpsUrl(o.page);
  const exchange = httpsUrl(o.exchange);
  const manifest = o.manifest && typeof o.manifest === 'object' && !Array.isArray(o.manifest) ? (o.manifest as Record<string, Json>) : undefined;
  const field = (x: unknown) => typeof x === 'string' && /^[a-z_][a-z0-9_]{0,40}(\.[a-z_][a-z0-9_]{0,40})?$/i.test(x);
  const keep = Array.isArray(o.keep) ? o.keep.filter(field).slice(0, 10) as string[] : [];
  const key = field(o.key) ? (o.key as string) : '';
  const then = typeof o.then === 'string' && /^https:\/\/|^\{[a-z_]+\}\//i.test(o.then) ? o.then.slice(0, 300) : undefined;
  const platform = typeof o.platform === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(o.platform) ? o.platform : undefined;
  if (!page || !exchange?.includes('{code}') || !manifest || JSON.stringify(manifest).length > 8000 || !keep.length || !key)
    return { problem: '"register" names the provider\'s page, where its code becomes the app, the app\'s manifest, what\'s kept and its key: {"page": "https://…", "exchange": "https://…/{code}/…", "manifest": {...}, "keep": ["id", "slug"], "key": "pem", "then": "{html_url}/installations/new"}' };
  return { register: { page, exchange, manifest, keep, key, ...(then ? { then } : {}), ...(platform ? { platform } : {}) } };
}

/** A setting's choices, checked: the action that lists them, and whether several are picked. */
export function parseChoose(value: unknown): { action: string; many?: true } | undefined {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const action = typeof o.action === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(o.action) ? o.action : undefined;
  return action ? { action, ...(o.many === true ? { many: true as const } : {}) } : undefined;
}

/**
 * An OAuth sign-in a setting asks for: the provider's pages and the app's client (a desktop app's: PKCE, a loopback
 * address to come back to, as RFC 8252 has it). Weave keeps the grant, refreshes it on the node that runs the service,
 * and hands the service only a current access token.
 */
export interface AppOAuth {
  /** Where people allow it, like https://accounts.google.com/o/oauth2/v2/auth (a sign-in through the browser). */
  authorize?: string;
  /**
   * Or a sign-in with a code (RFC 8628's device flow): where the code is asked for, like
   * https://github.com/login/device/code. People enter the code on the provider's page; no secret, no redirect.
   */
  device?: string;
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
    const register = e.register === undefined || oauth ? undefined : parseRegister(e.register).register;
    const choose = oauth || register || e.secret === true || e.signing === true ? undefined : parseChoose(e.choose);
    // An app registered is always yours, and signs.
    if (register) { out.push({ name, label, secret: true, ...(e.optional === true ? { optional: true as const } : {}), ...(hint ? { hint } : {}), register, yours: true }); continue; }
    out.push({ name, label, ...(e.secret === true || e.signing === true || oauth ? { secret: true as const } : {}), ...(e.optional === true ? { optional: true as const } : {}), ...(hint ? { hint } : {}), ...(oauth ? { oauth } : {}), ...(e.signing === true && !oauth ? { signing: true as const } : {}), ...(choose ? { choose } : {}), ...(e.yours === true ? { yours: true as const } : {}) });
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
  const device = httpsUrl(o.device);
  const token = httpsUrl(o.token);
  const client = typeof o.client === 'string' ? o.client.trim().slice(0, 300) : '';
  if ((!authorize && !device) || !token || !client) return { problem: '"oauth" names the provider’s pages and the app’s client: {"authorize": "https://…" (or "device": "https://…", for a sign-in with a code), "token": "https://…", "client": "<client id>", "scopes": [...]}' };
  const scopes = Array.isArray(o.scopes) ? o.scopes.filter((x): x is string => typeof x === 'string' && /^[!-~]{1,200}$/.test(x)).slice(0, 30) : [];
  const clientSecret = typeof o.clientSecret === 'string' ? o.clientSecret.trim().slice(0, 300) : '';
  return { oauth: { ...(authorize ? { authorize } : {}), ...(device ? { device } : {}), token, client, ...(clientSecret ? { clientSecret } : {}), ...(scopes.length ? { scopes } : {}) } };
}

/** Variables an app may not ask hosts for: they change how programs start or what they load. */
const ENV_RESERVED = /^(WEAVE_|NODE_|LD_|DYLD_|PATH$|PATHEXT$|COMSPEC$|SYSTEMROOT$|WINDIR$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$|PYTHON|ELECTRON_|BUN_)/i;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;

/**
 * Getting the app: release files where its source says (a provider of that source hands them out), one per platform,
 * each with the SHA-256 a maintainer published here (Weave refuses a file that doesn't match, whoever delivers it),
 * and steps for an agent where there's no file for your computer (building from source and the like).
 */
export interface AppInstall {
  /** The release's tag, like v1.4: also the version people see. */
  tag?: string;
  /** By platform, as Node names it (win32-x64, darwin-arm64, linux-x64…): the release file. */
  assets?: Record<string, AppAsset>;
  /** For an agent installing it by hand. */
  steps?: string[];
  /** The release's container image, pinned by its digest (weave app release reads it from the registry). */
  image?: AppImage;
  /**
   * Where its files are, for a provider that knows that source (its contract's sources): {"provider": "github", "ref":
   * "owner/name"}, {"provider": "s3", "ref": "…"}: what that provider understands, nothing Weave reads. An image is
   * its own source.
   */
  source?: ArtifactSource;
  /** The fetcher that gets its files directly (access: direct), when its provider isn't asked: as a contract names one. */
  fetcher?: string;
  /**
   * How one gets at its files: only through a grant of its provider (closed code: the provider holds the only
   * access, and must be there when someone fetches), or directly, by the fetcher alone (public, or open to the
   * project's members through their own access). Without, through a grant.
   */
  access?: 'grant' | 'direct';
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
  const tag = text(i.tag, 100);
  let source: ArtifactSource | undefined;
  // From before sources: a GitHub repository.
  const legacy = text(i.github, 140);
  if (i.source === undefined && legacy) source = { provider: 'github', ref: legacy };
  if (i.source !== undefined) {
    const raw = (i.source && typeof i.source === 'object' ? i.source : {}) as Record<string, unknown>;
    const provider = text(raw.provider, 40);
    const ref = text(raw.ref, 500);
    if (!SOURCE.test(provider) || !ref) throw new Error('"install.source" is {"provider": "s3", "ref": "…"}: a kind of place, and what its provider understands');
    source = { provider, ref };
  }
  // A Weave service is its image: it needs no source to come from (provenance says more, later). Files do.
  if ((has || (image && !image.packaged)) && !source) throw new Error('"install.source" says where its files are: {"provider": "github", "ref": "owner/name"}, or another provider\'s');
  const fetcher = typeof i.fetcher === 'string' && /^([a-z][a-z0-9-]{0,39}|sha256:[0-9a-f]{64})$/.test(i.fetcher) ? i.fetcher : undefined;
  if ((has || image) && !TAG.test(tag)) throw new Error('"install.tag" is the tag of the release, like v1.4');
  if (!has && !image && !steps.length) return undefined;
  return {
    ...(has || image ? { tag } : {}),
    ...(source ? { source } : {}),
    ...(has && fetcher ? { fetcher } : {}),
    ...(has && (i.access === 'grant' || i.access === 'direct') ? { access: i.access } : {}),
    ...(has ? { assets } : {}),
    ...(image ? { image } : {}),
    ...(steps.length ? { steps } : {}),
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

const KNOWN = new Set(['app', 'name', 'version', 'services', 'start', 'install', 'env', 'service', 'wasm', 'client', 'fetcher', 'file', 'verifier', 'keyvault', 'marks', 'hints', 'lists']);

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
    if (m.service === undefined && m.client === undefined && m.fetcher === undefined && m.file === undefined && m.verifier === undefined && m.keyvault === undefined && m.marks === undefined && m.hints === undefined) problems.push('a manifest says what it does: its web page ("services", like [{"port": 3000}]), its contract ("service"), or both');
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
      // The actions it stands in for, by name.
      const covers = (Array.isArray(o.covers) ? o.covers : []).filter((c): c is string => typeof c === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(c)).slice(0, 20);
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(name) || !who || !page) problems.push(`wasm.panels[${i}] is {"name": "launch", "title": "Launch a website", "who": "maintainers", "page": "launch.html"}`);
      else panels.push({ name, title: text(o.title, 60) || name, who, page, ...(covers.length ? { covers } : {}) });
    }
    if (!component || !/\.wasm$/i.test(component)) problems.push('"wasm.component" is where the component is in the package, like "service.wasm"');
    else if (raw.site !== undefined && !site) problems.push('"wasm.site" is the folder of its website\'s files in the package, like "site"');
    else if (panels.length && !panel) problems.push('"wasm.panel" is the folder of its panels\' pages in the package, like "panel"');
    else wasm = { component, ...(site ? { site } : {}), ...(panel ? { panel } : {}), ...(panels.length ? { panels } : {}) };
  }
  // Its lists: however it runs, the same in every card.
  const lists: AppList[] = [];
  for (const [i, l] of (Array.isArray(m.lists) ? m.lists : []).slice(0, 6).entries()) {
    const got = parseList(l);
    if (typeof got === 'string') problems.push(`lists[${i}] is ${got}`);
    else lists.push(got);
  }
  if (lists.length && !m.service) problems.push('"lists" are a service\'s: its actions answer them, so it needs a contract ("service")');
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
  // A verifier: the platforms it checks, where it may reach, and how people make a proof.
  let verifier: AppVerifier | undefined;
  if (m.verifier !== undefined) {
    const raw = (m.verifier && typeof m.verifier === 'object' && !Array.isArray(m.verifier) ? m.verifier : {}) as Record<string, unknown>;
    const platforms = Array.isArray(raw.platforms) ? raw.platforms.filter((p): p is string => typeof p === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(p)).slice(0, 10) : [];
    const net = Array.isArray(raw.net) ? raw.net.map(lowerHost).filter(isNetHost) : [];
    const page = text(raw.page, 200);
    const prove = raw.prove === undefined ? undefined : parseOAuth(raw.prove);
    if (prove?.problem) problems.push(`"verifier.prove" is a sign-in with a code: ${prove.problem}`);
    if (!platforms.length) problems.push('"verifier.platforms" names the platforms it checks accounts on, like ["github"]');
    else if (!m.wasm) problems.push('a verifier is a WebAssembly component: say where it is ("wasm": {"component": "verifier.wasm"})');
    else verifier = { platforms, ...(net.length ? { net: [...new Set(net as string[])].slice(0, 20) } : {}), ...(text(raw.howto, 400) ? { howto: text(raw.howto, 400) } : {}), ...(/^https:\/\/[^\s]*\{handle\}/.test(page) ? { page } : {}), ...(prove?.oauth?.device ? { prove: prove.oauth } : {}), ...(typeof raw.icon === 'string' && /^[a-z][a-zA-Z0-9]{0,30}$/.test(raw.icon) ? { icon: raw.icon } : {}) };
  }
  // A keyvault: the platform it holds access to, and where it may reach.
  let keyvault: AppKeyvault | undefined;
  if (m.keyvault !== undefined) {
    const raw = (m.keyvault && typeof m.keyvault === 'object' && !Array.isArray(m.keyvault) ? m.keyvault : {}) as Record<string, unknown>;
    const platform = typeof raw.platform === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(raw.platform) ? raw.platform : '';
    const net = Array.isArray(raw.net) ? raw.net.map(lowerHost).filter(isNetHost) : [];
    if (!platform) problems.push('"keyvault.platform" names the platform it holds access to, like "github"');
    else if (!m.wasm) problems.push('a keyvault is a WebAssembly component: say where it is ("wasm": {"component": "keyvault.wasm"})');
    else keyvault = { platform, ...(net.length ? { net: [...new Set(net as string[])].slice(0, 20) } : {}), ...(text(raw.resources, 40) ? { resources: text(raw.resources, 40) } : {}) };
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
  // A mark service: where its component is, what it reads, and where it answers.
  let marks: AppMarks | undefined;
  if (m.marks !== undefined) {
    const raw = (m.marks && typeof m.marks === 'object' ? m.marks : {}) as Record<string, unknown>;
    const parsed = parseAppMarks(raw, packagePath(raw.component));
    if (parsed.problem) problems.push(parsed.problem);
    else marks = parsed.marks;
  }
  // A hint service: the same, answering with counts.
  let hints: AppHints | undefined;
  if (m.hints !== undefined) {
    const raw = (m.hints && typeof m.hints === 'object' ? m.hints : {}) as Record<string, unknown>;
    const parsed = parseAppHints(raw, packagePath(raw.component));
    if (parsed.problem) problems.push(parsed.problem);
    else if (marks) problems.push('a manifest is a mark service or a hint service, not both: claims and counts never look alike');
    else hints = parsed.hints;
  }
  if (!m.wasm && !m.client && !m.marks && !m.hints && rawStart.command === undefined && rawStart.release === undefined && rawStart.image === undefined) warnings.push('no "start": hosts have to start the app themselves (add start.command, and start.release or start.image for releases)');
  if (!m.wasm && !m.client && !m.marks && !m.hints && (rawStart.release !== undefined || rawStart.image !== undefined) && rawStart.command === undefined) warnings.push('no "start.command": a checkout of the repository (rather than a release build) can\'t be started by Weave');
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
        const choose = e.choose === undefined ? undefined : parseChoose(e.choose);
        if (e.choose !== undefined && !choose) { problems.push(`${where}: "choose" names the action that lists its choices, like {"action": "repos", "many": true}`); continue; }
        if (choose && (oauth.oauth || e.secret === true || e.signing === true)) { problems.push(`${where}: a setting picked from a list is neither a secret nor a sign-in`); continue; }
        if (e.register !== undefined) {
          const register = parseRegister(e.register);
          if (register.problem) { problems.push(`${where}: ${register.problem}`); continue; }
          if (oauth.oauth || choose || e.secret === true || e.signing === true) { problems.push(`${where}: an app registered is neither a sign-in, a pick, nor a secret typed in`); continue; }
          env.push({ name, label, secret: true, ...(e.optional === true ? { optional: true as const } : {}), ...(hint ? { hint } : {}), register: register.register!, yours: true });
          continue;
        }
        env.push({ name, label, ...(e.secret === true || e.signing === true || oauth.oauth ? { secret: true as const } : {}), ...(e.optional === true ? { optional: true as const } : {}), ...(hint ? { hint } : {}), ...(oauth.oauth ? { oauth: oauth.oauth } : {}), ...(e.signing === true && !oauth.oauth ? { signing: true as const } : {}), ...(choose ? { choose } : {}), ...(e.yours === true ? { yours: true as const } : {}) });
      }
    }
  }

  for (const l of lists) {
    const named = [l.list, ...(l.add && 'action' in l.add ? [l.add.action] : []), ...(l.remove ? [l.remove.action] : []), ...(l.use && 'action' in l.use ? [l.use.action] : []), ...(l.covers ?? [])];
    for (const a of named) if (!service?.actions?.some((x) => x.name === a)) problems.push(`lists: ${l.name} names the action ${a}, but its service has no such action`);
  }
  for (const e of env) if (e.choose && !service?.actions?.some((x) => x.name === e.choose!.action)) problems.push(`env: ${e.name} is picked from what its action ${e.choose.action} lists, but its service has no such action`);

  if (problems.length) return { problems, warnings };
  return { problems, warnings, manifest: { app, name, version: Number.isInteger(m.version) ? (m.version as number) : 1, services, ...(start ? { start } : {}), ...(install ? { install } : {}), ...(env.length ? { env } : {}), ...(service ? { service } : {}), ...(wasm ? { wasm } : {}), ...(client ? { client } : {}), ...(fetcher ? { fetcher } : {}), ...(file ? { file } : {}), ...(verifier ? { verifier } : {}), ...(keyvault ? { keyvault } : {}), ...(marks ? { marks } : {}), ...(hints ? { hints } : {}), ...(lists.length && service ? { lists } : {}) } };
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
  'env: settings each host fills in, like an API key: name (the environment variable), label, secret (hidden), optional (the app runs without it), hint (where to get it). Never put a value in the manifest: it lives in the repository. Whoever opens a room with it types it in Weave, it stays on their computer, and Weave hands it to that room\'s process alone. Read it from the environment (process.env.DEEPSEEK_API_KEY). A project’s maintainers can keep a service’s settings in the project instead (weave service setting): any of them changes them, a secret sealed for the service alone. "oauth": {"authorize": "https://…", "token": "https://…", "client": "<client id>", "scopes": [...]} makes a setting a sign-in: a maintainer signs in on the provider’s page (PKCE, back to 127.0.0.1), and the service gets a current access token, renewed by Weave. "yours": true keeps a setting with whoever runs the service instead, once for every project it’s in (a sign-in as them): never in a project. A setting picked from a list and yours is per project, but only whoever runs it picks (the repositories its access reaches, say: theirs to hand out). "register": {"page", "exchange", "manifest", "keep", "key", "then"} makes a setting an app of its own that whoever runs the service creates on the provider’s page (GitHub’s App manifest flow): yours, the service reads what "keep" names and signs with its key (sign), never reading the key. A service needing access to a platform declares it in its contract ("uses": {"github": {"contents": "read"}}) and gets it only from its person’s keyvault (token(), in the WIT), cut to those rights and to what they handed each project: it asks for no access of its own. A service’s "net" may name settings as placeholders: "{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com".',
  'service: its contract, for a program that acts on events in the spaces it\'s added to, under a key of its own. It says what it reads ("nothing", "addressed": requests to it, "space": everything, or {"kinds": [...]}), which kinds it writes, "website": true if it serves one itself (POST /website, or weave.serve), and its version, like {"reads": "addressed", "writes": [], "version": "1.0"}. "net" lists the hosts a WebAssembly service may reach over HTTPS (["api.example.com", "*.example.com"]); without it, it reaches none. "actions" says what people may ask it to do, and who: [{"name": "publish", "label": "Publish a new version", "who": "maintainers", "input": [{"name": "tag", "label": "Version"}]}] (who: members, maintainers, owner or {"board": "<name>"}); Weave checks the asker before the service sees a request naming one, and a project can only make who narrower. "expires" says how long a request counts, in seconds, by action or protocol ({"artifact.fetch": 300}): one older when the service gets to it (it was off) is answered by Weave as expired. Without, requests wait for it. What is asked and answered is sealed for the service and the asker. Installed, it gets exactly those rights; a release asking for more needs a new yes. It reads and writes through WEAVE_SERVICE_API with WEAVE_SERVICE_TOKEN (GET /events, GET /watch, POST /publish, POST /answer). A release with a web page in services serves it as a website in the projects it is added to.',
  `A Weave service is an OCI image carrying this manifest in its "${SERVICE_LABEL}" label (as JSON, without start or install: the image is what runs). Release it with weave service release <image:tag>: Weave pins the tag to its digest and reads the manifest from the image. It runs in Weave's sandbox only (read-only, limited, with /data to keep things in).`,
  'wasm: a WebAssembly service (packages/sdk/wit/service.wit), which Weave runs itself with nothing installed, no Docker: {"component": "service.wasm", "site": "site"}, paths in its package. Its image is built for wasi/wasm (docker buildx --platform wasi/wasm, FROM scratch, the component and its site copied in), or its release file is for the platform "wasm" (weave app release --asset wasm=<file>). A website (the website world) has "site": Weave serves those files and holds its players\' connections.',
  'keyvault and fetcher: client apps a person adds for themselves (Keys & devices), from Weave or from any project\'s release, approved once and pinned to what was released; WebAssembly components, run sandboxed. A keyvault ({"platform": "acme", "net": ["api.acme.example"], "resources": "buckets"}, world keyvault) holds its person\'s access to a platform and mints services only what their contracts declare ("uses") for what its person handed each project; a fetcher ({"net": [...]}, world fetcher) fetches release files a provider grants.',
  'lists: what a service hands out, shown by Weave the same way in every card, however it runs (WebAssembly, a container, a program), whoever made it (search, pages, each button only for who may): its lists come first, before any page of its own. Each names the action that answers its items, + (add: an action, or {"hand": "github"}: whoever runs it hands one from their keyvault), the trash can (remove: an action, given {id}) and each item’s main button (use: an action and a label, or {"account": "github", "label": "Get access"}), and "covers" for other actions its items offer: [{"name": "repos", "title": "Repositories", "item": "access offer", "list": "offers", "add": {"hand": "github"}, "remove": {"action": "decline"}, "use": {"account": "github", "label": "Get access"}}]. Its list action answers [{id, icon?, title, badge?, detail?, url?, done? (said instead of the main button: "✓ You have access"), use?: false, remove?: false, more?: [{action, label, icon?, confirm?}]}], or, for a long list it pages itself, {items, next}, asked again with {query, cursor}. A page of its own (wasm.panels) only for what isn’t a list: a form of several steps, a live view.',
  'client: a client service, which shows a board its own way (the board world of packages/sdk/wit/service.wit; a starter: weave service new <folder> --lens): {"component": "board.wasm", "site": "site", "writes": ["weave.post", "kanban.move"]}. Released like wasm (an image for wasi/wasm, or a release file for "wasm"); a project\'s maintainers pin it to a board (weave board lens), and every member\'s Weave runs it with no key and no network. "writes": the kinds its actions may propose, which members sign: of Weave\'s own only posts and what members do with posts; kinds of its own name a post in the board ("target").',
  'marks: a mark service, which shows marks next to names (the marks world of packages/sdk/wit/service.wit; a starter: weave service new <folder> --marks): {"component": "marks.wasm", "reads": ["weave.badge"], "slots": ["author", "member", "chat", "profile"], "subjects": ["did"]}. Released like wasm. You take it into your own domain (weave marks add), shown everywhere you look; or a space\'s maintainers pin it (weave marks add --space), shown in that space only. Every node that took it in runs it with no key and no network. "reads": the kinds it folds. It answers with check, label, count, symbol or image, and Weave shows who says so.',
  'hints: a hint service, which shows numbers about its person\'s own state next to places, like unread counts (the marks world too): {"component": "hints.wasm", "reads": ["weave.notice", "weave.seen"], "slots": ["place"], "subjects": ["space", "board", "channel"]}. Released like wasm; its person takes it in (weave hints add) and its counts show in their Places. It folds what their node holds of the kinds it reads, what\'s sealed to them too, and the notices their node works out (weave.notice), with no key and no network. It answers with a count, never a claim about anyone.',
  'install.steps: how to install it by hand, for agents (where there is no release build). install.source, tag and assets are added when a release is published (weave app release, through the project\'s provider): don\'t write them.',
  'The app should read its files relative to the folder it runs in (process.cwd()), listen on the ports in services, and serve the open paths.',
  "Who is who: players reach the app from 127.0.0.1, so it can't tell them apart by itself. When Weave starts the app it sets WEAVE_API, WEAVE_TOKEN and WEAVE_PROJECT; @weave/sdk (one file, no dependencies) turns them into weave.who(req) → {did, name, host, member, maintainer}, weave.project() and weave.access(did, {group}). Use the did as the player's id instead of asking for a name.",
];

/** The command that starts an app: a release build's own for this platform, when Weave installed one, or the one for source checkouts. */
export const startCommand = (app: AppManifest | undefined, platform: string, releaseBuild: boolean): string[] | undefined =>
  (releaseBuild ? app?.start?.release?.[platform] : undefined) ?? app?.start?.command;

/**
 * What an artifact is, which says who can use it: a service (Weave runs it, with its contract), a website (the
 * website service launches it), a board view (pinned to boards), a fetcher (a client app that fetches artifacts), a
 * mark service (what shows next to names: yours, or pinned to a space), an app (its person runs it on their
 * computer, in a room), or a file (something to get).
 */
export type ArtifactKind = 'service' | 'website' | 'board-view' | 'fetcher' | 'keyvault' | 'marks' | 'hints' | 'app' | 'file';

export function artifactKindOf(m: AppManifest): ArtifactKind {
  if (m.file) return 'file';
  if (m.marks) return 'marks';
  if (m.hints) return 'hints';
  if (m.fetcher) return 'fetcher';
  if (m.keyvault) return 'keyvault';
  if (m.client) return 'board-view';
  const site = !!m.wasm?.site || m.services.some((s) => s.protocol === 'http');
  // A website reads nothing and writes nothing: it only shows its page (and holds its visitors' game).
  if (site && (!m.service || (m.service.reads === 'nothing' && !m.service.writes.length))) return 'website';
  if (m.service || m.install?.image?.packaged) return 'service';
  if (site) return 'website';
  return 'app';
}

/** Where an artifact's files are: its source, or its image (pulled by Weave itself). */
export function artifactSourceOf(m: AppManifest): ArtifactSource | undefined {
  if (m.install?.source && m.install.assets) return m.install.source;
  if (m.install?.image) return { provider: 'oci', ref: `${m.install.image.ref}@${m.install.image.digest}` };
  return m.install?.source;
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
/**
 * A release withdrawn by a maintainer ({artifact: its id}): no longer listed, launched or handed out from then on.
 * Signed events stay (who got it keeps what they have); a new release of the same tag counts again.
 */
export const KIND_ARTIFACT_WITHDRAWN = 'weave.artifact.withdrawn';

/** A project's artifacts, newest first: each one's tag once (its latest release), only by maintainers, only with something to get, never one withdrawn. */
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
  const withdrawn = new Set(entries.filter((e) => e.kind === KIND_ARTIFACT_WITHDRAWN && maintainers.has(e.event.author)).map((e) => (e.body as { artifact?: unknown } | null)?.artifact));
  return [...byTag.values()].filter((a) => !withdrawn.has(a.id)).sort((a, b) => b.time.localeCompare(a.time));
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
