import { b64u, decodeContact, type Did, type Json, newPlanSecret, onboardLink, openPlan, parseBlobRef, parseOnboardLink, peekInvite, peekKnock, planCheck, sealPlan, type OnboardPlan, type OnboardStep } from '@weave/core';
import { StorageClient, type PlanListing } from '@weave/net';
import type { SpaceInfo } from './backend.ts';
import type { WeaveNode } from './node.ts';

/*
 * Onboarding links, the creator's side and the joiner's (idea bZFDCQNT; core's onboard.ts has the plan). A creator makes
 * a link for a project: the plan (their contact link, an invite to the project and maybe more spaces, open it, a
 * welcome) goes sealed to a storage node under a short code, with an open preview if they want one. Their own node keeps,
 * sealed to itself, which invites belong to which link, so it can follow back whoever joins with one when the plan says
 * friends, and close those invites when the link is taken back.
 *
 * Someone who has Weave already follows a link here: the storage node counts a use, then the plan's steps run (contact,
 * join), and the space to open comes back. The web runs the same steps in its own onboarding, with an account first.
 */

export const KIND_ONBOARD_LINK = 'weave.onboard.link';
/**
 * In a space someone joined with a friendly link: their contact link, boxed to the link's creator alone. The creator adds
 * them by it, as one adds a friend back: that's what lets the creator's node reach their node (a browser's storage node
 * at their meeting point), so the follow both ways arrives.
 */
export const KIND_ONBOARD_HELLO = 'weave.onboard.hello';
/**
 * A link kept as a quick start, sealed to oneself (it follows you to your devices): its code, what it opens, and whether
 * to play there. Saved when you follow a link or make one; /play/<code> and My games open it without asking anyone.
 */
export const KIND_PLAY_LINK = 'weave.onboard.play';

/** Where a link leads: to you (a chat with you), to a space, or in a space to a board, a post or a website. */
export type LinkTarget =
  | { kind: 'me' }
  | { kind: 'space'; space: string }
  | { kind: 'board'; space: string; board: string }
  | { kind: 'post'; space: string; post: string }
  | { kind: 'website'; space: string; website: string };

/** Where a followed link opens, resolved: what the app shows. */
export interface OpenTarget {
  kind: LinkTarget['kind'];
  space?: { id: string; kind: string; name: string };
  board?: string;
  post?: string;
  website?: string;
  /** A chat with this person (a link to them). */
  chat?: Did;
  /** Start the website (or the space's first one), as ▶ would. */
  play?: true;
}

/** A quick start: where a link leads, one click (or one icon on the home screen) away. */
export interface PlayLinkInfo {
  code: string;
  /** The link's page, where /play/<code> is (an app of its own on a home screen). */
  page: string;
  title: string;
  target: OpenTarget;
}

/** Where the link's page is, and the storage node it uses: Weave Web's own, unless said otherwise. */
export const WEB_PAGE = 'https://web.martl.io';
const STORAGE_OF: Record<string, string> = { [WEB_PAGE]: 'https://storage.martl.io' };
/** The storage node behind a page: the known pair, else the page's own origin (a storage node that serves its page). */
export const storageFor = (page: string): string => STORAGE_OF[new URL(page).origin] ?? new URL(page).origin;

/** How long a link and its invites last when the creator names no end. */
const DEFAULT_DAYS = 365;
const PNG = [0x89, 0x50, 0x4e, 0x47];
/** How long a newcomer's contact link may take to arrive before they're followed without it. */
const HELLO_WAIT_MS = 120_000;

/** What the creator's node keeps of a link, sealed to itself. */
interface LinkRecord {
  code: string;
  link: string;
  page: string;
  storage: string;
  title: string;
  /** The invites in the plan, by space: closed when the link is taken back; joiners followed back when `friends`. */
  invites: Array<{ space: string; invite: string }>;
  friends: boolean;
  /** Where it leads (older records: a space). */
  kind?: LinkTarget['kind'];
  created: string;
  expires?: string;
  uses?: number;
  revoked?: true;
}

export interface OnboardLinkInfo {
  code: string;
  link: string;
  title: string;
  friends: boolean;
  created: string;
  expires?: string;
  uses?: number;
  /** As the storage node counts them; missing when it couldn't be asked. */
  used?: number;
  revoked?: true;
  /** The spaces it lets people into. */
  spaces: string[];
  /** Where it leads. */
  kind: LinkTarget['kind'];
}

export interface OnboardLinkInput {
  /** Where it leads: to you, a space, or a board, post or website in one. */
  target?: LinkTarget;
  /** Older callers: the space it invites to (its name or id), as `target: { kind: 'space' }`. */
  project?: string;
  /** More spaces to join with it, like a group of yours. */
  also?: string[];
  /** You follow back whoever comes in with it, so you're friends at once. Default: yes. */
  friends?: boolean;
  /** Start the website when they arrive (a website target: yes unless false; a project: its first website). */
  play?: boolean;
  welcome?: string;
  /** How many people may use it; none: no limit. */
  uses?: number;
  /** How many days it works; default a year. */
  days?: number;
  /** Ask first: each newcomer asks you (a knock link) instead of coming in at once. */
  ask?: boolean;
  /** The open preview link cards show: off with `false`. Its picture: the project's icon or banner (PNG only). */
  preview?: false | { title?: string; text?: string; image?: 'icon' | 'banner' | 'none' };
  /** The link's page; the storage node behind it is storageFor(page) unless given. */
  page?: string;
  storage?: string;
}

/** What someone sees of a link before following it. */
export interface OnboardLook {
  link: string;
  by: { did: Did; name?: string };
  title: string;
  steps: OnboardStep[];
  /** Spaces it lets you into, and whether you're there already. */
  spaces: Array<{ id: string; kind: string; name: string; member: boolean }>;
  welcome?: string;
  /** It's your own link. */
  mine: boolean;
}

/** A storage node over a WebSocket, as the page would reach it (its origin, which the node checks). */
export async function connectStorage(storage: string, page: string): Promise<StorageClient> {
  const url = new URL('/storage', storage.replace(/^http/, 'ws'));
  // A browser says its page's origin by itself, and takes no headers; a program says the page's, as the page would.
  const program = typeof navigator === 'undefined' || navigator.userAgent.startsWith('Node.js');
  const ws = program ? new WebSocket(url, { headers: { origin: new URL(page).origin } } as unknown as string[]) : new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error(`the storage node at ${new URL(storage).host} can't be reached`)));
  });
  return StorageClient.connect({
    send: (text) => ws.send(text),
    close: () => ws.close(),
    onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
    onClose: (handle) => ws.addEventListener('close', () => handle()),
  });
}

async function withStorage<T>(storage: string, page: string, run: (client: StorageClient) => Promise<T>): Promise<T> {
  const client = await connectStorage(storage, page);
  try {
    return await run(client);
  } finally {
    client.close();
  }
}

/** The ports of the node this needs beyond its public calls: its own sealed records. */
export interface OnboardCore {
  sealForSelf(kind: string, body: Json): void;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  /** Write a sealed event into a space this node is in. */
  writeIn(space: string, kind: string, body: Json): void;
  /** The bodies of a kind in a space, with their authors. */
  bodiesIn(space: string, kind: string): Array<{ author: Did; body: Record<string, unknown> }>;
  /** A box only the holder of this encryption key opens. */
  boxFor(key: Did, value: Json): Json;
  /** Our own encryption key, for boxes to us. */
  encryptionKey(): Did;
  /** A box opened, if it's ours. */
  openBox(box: unknown): Json | undefined;
}

export class Onboarding {
  readonly #node: WeaveNode;
  readonly #core: OnboardCore;
  #following = false;
  /** Now, for tests. */
  #clock: () => number = () => Date.now();

  constructor(node: WeaveNode, core: OnboardCore) {
    this.#node = node;
    this.#core = core;
  }

  /** This node's links, the latest word on each. */
  #records(): LinkRecord[] {
    const byCode = new Map<string, LinkRecord>();
    for (const b of this.#core.selfBodies(KIND_ONBOARD_LINK)) {
      if (typeof b.code !== 'string') continue;
      if (b.revoked === true) {
        const before = byCode.get(b.code);
        if (before) byCode.set(b.code, { ...before, revoked: true });
      } else if (typeof b.link === 'string' && Array.isArray(b.invites)) byCode.set(b.code, b as unknown as LinkRecord);
    }
    return [...byCode.values()];
  }

  /** The spaces whose newcomers may be followed back. */
  watched(): Set<string> {
    return new Set(this.#records().filter((r) => r.friends && !r.revoked).flatMap((r) => r.invites.map((i) => i.space)));
  }

  async create(input: OnboardLinkInput): Promise<OnboardLinkInfo> {
    const node = this.#node;
    const page = new URL(input.page ?? WEB_PAGE).origin;
    const storage = new URL(input.storage ?? storageFor(page)).origin;
    for (const at of [page, storage]) if (!at.startsWith('https:') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(at)) throw new Error('an onboarding link lives on an https page');
    const target: LinkTarget | undefined = input.target ?? (input.project ? { kind: 'space', space: input.project } : undefined);
    if (!target) throw new Error('a link leads somewhere: to you, or to a space');
    const days = input.days ?? DEFAULT_DAYS;
    if (!(days > 0 && days <= 3650)) throw new Error('a link works from one day to ten years');
    if (input.uses !== undefined && !(Number.isInteger(input.uses) && input.uses >= 1)) throw new Error('uses are a whole number, at least 1');
    // A link to you is for becoming friends.
    const friends = target.kind === 'me' || input.friends !== false;
    const expires = new Date(Date.now() + days * 86_400_000).toISOString();
    const me = node.identity.author;
    const name = node.nameOf(me);

    // What it leads to, checked here, and what it's called.
    let space: SpaceInfo | undefined;
    let project: Awaited<ReturnType<WeaveNode['project']>> | undefined;
    let title: string;
    let open: Extract<OnboardStep, { do: 'open' }>;
    if (target.kind === 'me') {
      title = name ?? 'Weave';
      open = { do: 'open', chat: me };
    } else {
      space = (await node.spaces()).find((s) => s.id === target.space || s.name === target.space);
      if (!space) throw new Error(`you're not in ${target.space}`);
      project = space.kind === 'project' ? await node.project(space.id) : undefined;
      const where = (project?.page.title || space.name).slice(0, 200);
      title = where;
      open = { do: 'open', space: space.id };
      if (target.kind === 'board') {
        const board = (await node.boards(space.id)).find((b) => b.name === target.board || b.title === target.board);
        if (!board) throw new Error(`${where} has no board ${target.board}`);
        title = `${board.title} · ${where}`;
        open.board = board.name;
      } else if (target.kind === 'post') {
        const post = await node.post(target.post);
        if (post.space?.id !== space.id) throw new Error(`that post isn't in ${where}`);
        title = post.title || where;
        open.post = post.id;
      } else if (target.kind === 'website') {
        const website = (await node.websites(space.id)).find((w) => w.id === target.website || w.name === target.website);
        if (!website) throw new Error(`nothing called ${target.website} is live in ${where}`);
        title = website.name;
        open.website = website.id;
        if (input.play !== false) open.play = true;
      } else if (input.play && space.kind === 'project') open.play = true;
    }
    title = title.slice(0, 200);

    // The steps: their contact link, the invites, open it, a welcome.
    const steps: OnboardStep[] = [{ do: 'account' }, { do: 'contact', link: await node.contactLink(), ...(friends ? { friends: true as const, enc: this.#core.encryptionKey() } : {}) }];
    const invites: LinkRecord['invites'] = [];
    for (const ref of [...(space ? [space.id] : []), ...(input.also ?? [])]) {
      const link = await node.invite(ref, days * 24, { accept: input.ask === true });
      const parsed = input.ask ? peekKnock(link) : peekInvite(link);
      steps.push({ do: 'join', link, space: { id: parsed.space.id, kind: parsed.space.kind, name: parsed.space.name } });
      invites.push({ space: parsed.space.id, invite: parsed.invite });
    }
    steps.push(open);
    const welcome = input.welcome?.trim().slice(0, 1000);
    if (welcome) steps.push({ do: 'welcome', text: welcome });
    const plan: OnboardPlan = { v: 1, by: { did: me, ...(name ? { name } : {}) }, title, steps };

    // The open preview: the creator's words, or a line saying who invites to what; the project's picture if it's a PNG.
    let preview: { title: string; text?: string } | undefined;
    let image: string | undefined;
    let icon: string | undefined;
    if (input.preview !== false) {
      const p = input.preview ?? {};
      const line = target.kind === 'me' ? `${name ?? 'Someone'} wants to connect with you on Weave` : `${name ?? 'Someone'} invites you to ${title} on Weave`;
      preview = { title: (p.title?.trim() || title).slice(0, 100), text: (p.text?.trim() || line).slice(0, 300) };
      // Pictures come from a project's page; other places have none to show.
      const which = p.image ?? 'banner';
      const ref = !project || which === 'none' ? undefined : which === 'icon' ? (project.page.icon ?? project.page.banner) : (project.page.banner ?? project.page.icon);
      if (ref && parseBlobRef(ref)) {
        const blob = await node.blob(ref).catch(() => undefined);
        const bytes = blob && Buffer.from(blob.data, 'base64');
        if (bytes && blob.type === 'image/png' && PNG.every((b, i) => bytes[i] === b) && bytes.length <= 300 * 1024) image = blob.data;
      }
      // The game's own app (/play/<code>) takes the project's icon: square, where a banner isn't.
      if (project?.page.icon && parseBlobRef(project.page.icon)) {
        const blob = await node.blob(project.page.icon).catch(() => undefined);
        const bytes = blob && Buffer.from(blob.data, 'base64');
        if (bytes && blob.type === 'image/png' && PNG.every((b, i) => bytes[i] === b) && bytes.length <= 300 * 1024) icon = blob.data;
      }
    }

    const secret = newPlanSecret();
    const code = await withStorage(storage, page, (client) =>
      client.putPlan(node.identity, { sealed: sealPlan(plan, secret), check: planCheck(secret), ...(preview ? { preview } : {}), ...(image ? { image } : {}), ...(icon ? { icon } : {}), ...(input.uses ? { uses: input.uses } : {}), expires }),
    ).catch((error: Error) => {
      // Nothing was made: the invites go again.
      for (const i of invites) void node.closeInvite(i.space, i.invite).catch(() => {});
      throw /operator decides/.test(error.message) ? new Error(`the storage node at ${new URL(storage).host} makes no links for this computer yet: its operator lets it with weave-storage planner ${node.identity.did}`) : error;
    });
    const record: LinkRecord = { code, link: onboardLink(page, code, secret), page, storage, title, invites, friends, kind: target.kind, created: new Date().toISOString(), expires, ...(input.uses ? { uses: input.uses } : {}) };
    this.#core.sealForSelf(KIND_ONBOARD_LINK, record as unknown as Json);
    // Your own quick start to it (a link to you leads you nowhere new).
    if (space) this.#savePlay(page, code, title, this.#target(open, space));
    return this.#info(record);
  }

  #info(r: LinkRecord, used?: number): OnboardLinkInfo {
    return { code: r.code, link: r.link, title: r.title, friends: r.friends, kind: r.kind ?? 'space', created: r.created, ...(r.expires ? { expires: r.expires } : {}), ...(r.uses ? { uses: r.uses } : {}), ...(used !== undefined ? { used } : {}), ...(r.revoked ? { revoked: true as const } : {}), spaces: r.invites.map((i) => i.space) };
  }

  /** Your links, newest first, with their uses as each storage node counts them (where it can be reached). */
  async list(): Promise<OnboardLinkInfo[]> {
    const records = this.#records().sort((a, b) => b.created.localeCompare(a.created));
    const counts = new Map<string, PlanListing>();
    for (const [storage, page] of new Map(records.map((r) => [r.storage, r.page]))) {
      const listed = await withStorage(storage, page, (client) => client.listPlans(this.#node.identity)).catch(() => [] as PlanListing[]);
      for (const l of listed) counts.set(`${storage} ${l.code}`, l);
    }
    return records.map((r) => {
      const at = counts.get(`${r.storage} ${r.code}`);
      return this.#info(at?.revoked ? { ...r, revoked: true } : r, at?.used);
    });
  }

  /** Take a link back: its code stops at the storage node, and its invites close, so a forwarded plan stops too. */
  async revoke(code: string): Promise<void> {
    const record = this.#records().find((r) => r.code === code);
    if (!record) throw new Error('no such link of yours');
    await withStorage(record.storage, record.page, (client) => client.revokePlan(this.#node.identity, code)).catch((error: Error) => {
      if (!/no such link/.test(error.message)) throw error;
    });
    for (const i of record.invites) await this.#node.closeInvite(i.space, i.invite).catch(() => {});
    this.#core.sealForSelf(KIND_ONBOARD_LINK, { code, revoked: true });
  }

  /** A link's plan, opened, for someone deciding whether to follow it. Counts no use. */
  async look(text: string, storage?: string): Promise<OnboardLook> {
    const { link, plan } = await this.#open(text, storage);
    const spaces = await this.#node.spaces();
    return {
      link,
      by: plan.by,
      title: plan.title,
      steps: plan.steps,
      spaces: plan.steps.flatMap((s) => (s.do === 'join' ? [{ ...s.space, member: spaces.some((x) => x.id === s.space.id) }] : [])),
      ...(plan.steps.find((s) => s.do === 'welcome') ? { welcome: (plan.steps.find((s) => s.do === 'welcome') as { text: string }).text } : {}),
      mine: plan.by.did === this.#node.identity.author,
    };
  }

  async #open(text: string, storage?: string): Promise<{ link: string; plan: OnboardPlan; parts: NonNullable<ReturnType<typeof parseOnboardLink>>; storage: string }> {
    const parts = parseOnboardLink(text);
    if (!parts) throw new Error('not an onboarding link: it looks like https://…/j/<code>#<secret>');
    const at = new URL(storage ?? storageFor(parts.page)).origin;
    const { sealed } = await withStorage(at, parts.page, (client) => client.getPlan(parts.code));
    return { link: `${parts.page}/j/${parts.code}#${b64u.encode(parts.secret)}`, plan: openPlan(sealed, parts.secret), parts, storage: at };
  }

  /**
   * Follow a link with the Weave you have: one use is counted, then its steps run in order (the creator as a contact,
   * the spaces joined). Returns the space to open and the welcome. Steps already done (a space you're in) are skipped.
   */
  async follow(text: string, storage?: string, options: { counted?: boolean } = {}): Promise<{ open?: SpaceInfo; target?: OpenTarget; joined: SpaceInfo[]; welcome?: string; play?: true }> {
    const { plan, parts, storage: at } = await this.#open(text, storage);
    const own = plan.by.did === this.#node.identity.author;
    const mySpaces = await this.#node.spaces();
    // In all its spaces already (or it's yours): it's a quick start now, no use of it is taken.
    const inAll = own || plan.steps.every((s) => s.do !== 'join' || mySpaces.some((x) => x.id === s.space.id));
    // Weave Web took its use already, with the account it made (counted).
    if (!options.counted && !inAll) await withStorage(at, parts.page, (client) => client.takePlan(parts.code, planCheck(parts.secret), false));
    if (own) {
      const openStep = plan.steps.find((s): s is Extract<OnboardStep, { do: 'open' }> => s.do === 'open');
      const open = openStep && mySpaces.find((s) => s.id === openStep.space);
      if (!openStep || !open) return { joined: [] };
      const target = this.#target(openStep, open);
      this.#savePlay(parts.page, parts.code, plan.title, target);
      return { open, target, joined: [], ...(openStep.play ? { play: true as const } : {}) };
    }
    const joined: SpaceInfo[] = [];
    let openStep: Extract<OnboardStep, { do: 'open' }> | undefined;
    let welcome: string | undefined;
    const contactStep = plan.steps.find((s): s is Extract<OnboardStep, { do: 'contact' }> => s.do === 'contact' && !!s.friends);
    const friends = !!contactStep;
    for (const step of plan.steps) {
      if (step.do === 'contact') await this.#node.addContact(step.link).catch(() => {});
      else if (step.do === 'join') {
        const mine = (await this.#node.spaces()).find((s) => s.id === step.space.id);
        const space = mine ?? (await this.#node.joinSpace(step.link));
        joined.push(space);
        // Friends: our contact link, for the creator alone, where they'll look for it.
        if (friends && !mine && step.link.startsWith('weave:invite:')) {
          const contact = await this.#node.contactLink();
          this.#core.writeIn(space.id, KIND_ONBOARD_HELLO, { to: plan.by.did, box: this.#core.boxFor(contactStep.enc ?? plan.by.did, { contact }) });
        }
      } else if (step.do === 'open') openStep = step;
      else if (step.do === 'welcome') welcome = step.text;
    }
    // A link to a person shares no space to leave our contact link in: it waits for them at the storage node.
    if (friends && !plan.steps.some((s) => s.do === 'join') && contactStep) {
      const contact = await this.#node.contactLink();
      const box = JSON.stringify(this.#core.boxFor(contactStep.enc ?? plan.by.did, { contact }));
      await withStorage(at, parts.page, (client) => client.helloPlan(parts.code, planCheck(parts.secret), box)).catch(() => {});
    }
    const open = openStep?.space ? (joined.find((s) => s.id === openStep.space) ?? (await this.#node.spaces()).find((s) => s.id === openStep.space)) : undefined;
    const target = openStep && (openStep.chat ? ({ kind: 'me', chat: openStep.chat } as OpenTarget) : open ? this.#target(openStep, open) : undefined);
    if (target && open) this.#savePlay(parts.page, parts.code, plan.title, target);
    return { ...(open ? { open } : {}), ...(target ? { target } : {}), joined, ...(welcome ? { welcome } : {}), ...(openStep?.play ? { play: true as const } : {}) };
  }

  /** What an open step leads to, in a space this node is in. */
  #target(step: Extract<OnboardStep, { do: 'open' }>, space: SpaceInfo): OpenTarget {
    const kind: OpenTarget['kind'] = step.website ? 'website' : step.post ? 'post' : step.board ? 'board' : 'space';
    return { kind, space: { id: space.id, kind: space.kind, name: space.name }, ...(step.board ? { board: step.board } : {}), ...(step.post ? { post: step.post } : {}), ...(step.website ? { website: step.website } : {}), ...(step.play ? { play: true as const } : {}) };
  }

  #savePlay(page: string, code: string, title: string, target: OpenTarget): void {
    if (this.playLinks().some((p) => p.code === code)) return;
    this.#core.sealForSelf(KIND_PLAY_LINK, { code, page, title, target: target as unknown as Json });
  }

  /** Your quick starts, the newest first: links you followed or made, each to its project and game. */
  playLinks(): PlayLinkInfo[] {
    const byCode = new Map<string, PlayLinkInfo | null>();
    for (const b of this.#core.selfBodies(KIND_PLAY_LINK)) {
      if (typeof b.code !== 'string') continue;
      // Older records name the space and whether to play; newer ones their target.
      const space = b.space as OpenTarget['space'] | undefined;
      const target = (b.target as OpenTarget | undefined) ?? (space && typeof space.id === 'string' ? ({ kind: b.play === true ? 'website' : 'space', space, ...(b.play === true ? { play: true } : {}) } as OpenTarget) : undefined);
      if (b.removed === true) byCode.set(b.code, null);
      else if (typeof b.page === 'string' && typeof b.title === 'string' && target && typeof target.kind === 'string') byCode.set(b.code, { code: b.code, page: b.page, title: b.title, target });
    }
    return [...byCode.values()].filter((p): p is PlayLinkInfo => !!p).reverse();
  }

  /** No longer a quick start (the link and your memberships stay). */
  removePlayLink(code: string): void {
    this.#core.sealForSelf(KIND_PLAY_LINK, { code, removed: true });
  }

  #helloAt = 0;
  /**
   * Add back whoever followed one of your links to you: their contact links wait, boxed to you, at the storage node.
   * At most once a minute (it asks the storage node), unless `now`.
   */
  async collectHellos(now = false): Promise<number> {
    if (!now && this.#clock() - this.#helloAt < 60_000) return 0;
    this.#helloAt = this.#clock();
    let n = 0;
    for (const record of this.#records().filter((r) => r.friends && !r.revoked && !r.invites.length)) {
      const boxes = await withStorage(record.storage, record.page, (client) => client.planHellos(this.#node.identity, record.code)).catch(() => [] as string[]);
      for (const text of boxes) {
        let contact: string | undefined;
        try {
          const opened = this.#core.openBox(JSON.parse(text)) as { contact?: unknown } | undefined;
          contact = typeof opened?.contact === 'string' ? opened.contact : undefined;
        } catch {
          continue;
        }
        if (!contact) continue;
        const did = (() => {
          try {
            return decodeContact(contact).did;
          } catch {
            return undefined;
          }
        })();
        if (!did || did === this.#node.identity.author || (await this.#node.profile(did)).contact) continue;
        await this.#node.addContact(contact).catch(() => {});
        n++;
      }
    }
    return n;
  }

  /** Follow back whoever came into a watched space with one of your friendly links (once, as you'd do by hand). */
  async followBack(): Promise<number> {
    if (this.#following) return 0;
    this.#following = true;
    let n = 0;
    try {
      const me = this.#node.identity.author;
      for (const record of this.#records().filter((r) => r.friends && !r.revoked)) {
        for (const { space, invite } of record.invites) {
          const members = await this.#node.members(space).catch(() => []);
          // Only who came in with this link's invite: the members' list names the invite each came in with.
          const hellos = this.#core.bodiesIn(space, KIND_ONBOARD_HELLO).filter((h) => h.body.to === me);
          for (const m of members.filter((x) => x.did !== me && x.invite === invite)) {
            const profile = await this.#node.profile(m.did);
            // Added back by their contact link, as a friend adds a friend: then our node reaches theirs.
            const opened = hellos.filter((h) => h.author === m.did).map((h) => this.#core.openBox(h.body.box) as { contact?: unknown } | undefined).find((o) => typeof o?.contact === 'string');
            if (opened && typeof opened.contact === 'string') {
              if (profile.contact) continue;
              await this.#node.addContact(opened.contact).catch(() => this.#node.setEdge({ edge: 'follow', who: m.did, on: true, private: true }));
              n++;
              continue;
            }
            // No contact link (yet): it may still be on its way; from an older Weave there is none, and a follow alone does.
            if (profile.following || this.#clock() - Date.parse(m.since) < HELLO_WAIT_MS) continue;
            await this.#node.setEdge({ edge: 'follow', who: m.did, on: true, private: true });
            n++;
          }
        }
      }
    } finally {
      this.#following = false;
    }
    return n;
  }
}
