import { b64u, type Did, type Json, newPlanSecret, onboardLink, openPlan, parseBlobRef, parseOnboardLink, peekInvite, peekKnock, planCheck, sealPlan, type OnboardPlan, type OnboardStep } from '@weave/core';
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

/** Where the link's page is, and the storage node it uses: Weave Web's own, unless said otherwise. */
export const WEB_PAGE = 'https://web.martl.io';
const STORAGE_OF: Record<string, string> = { [WEB_PAGE]: 'https://storage.martl.io' };
/** The storage node behind a page: the known pair, else the page's own origin (a storage node that serves its page). */
export const storageFor = (page: string): string => STORAGE_OF[new URL(page).origin] ?? new URL(page).origin;

/** How long a link and its invites last when the creator names no end. */
const DEFAULT_DAYS = 365;
const PNG = [0x89, 0x50, 0x4e, 0x47];

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
}

export interface OnboardLinkInput {
  /** The project it invites to (its name or id). */
  project: string;
  /** More spaces to join with it, like a group of yours. */
  also?: string[];
  /** You follow back whoever comes in with it, so you're friends at once. Default: yes. */
  friends?: boolean;
  /** Open the project's app when they arrive. */
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
  const ws = new WebSocket(url, { headers: { origin: new URL(page).origin } } as unknown as string[]);
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
}

export class Onboarding {
  readonly #node: WeaveNode;
  readonly #core: OnboardCore;
  #following = false;

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
    const project = await node.project(input.project);
    const days = input.days ?? DEFAULT_DAYS;
    if (!(days > 0 && days <= 3650)) throw new Error('a link works from one day to ten years');
    if (input.uses !== undefined && !(Number.isInteger(input.uses) && input.uses >= 1)) throw new Error('uses are a whole number, at least 1');
    const friends = input.friends !== false;
    const expires = new Date(Date.now() + days * 86_400_000).toISOString();
    const me = node.identity.author;
    const name = node.nameOf(me);

    // The steps: their contact link, the invites, open it, a welcome.
    const steps: OnboardStep[] = [{ do: 'account' }, { do: 'contact', link: await node.contactLink(), ...(friends ? { friends: true as const } : {}) }];
    const invites: LinkRecord['invites'] = [];
    for (const ref of [project.id, ...(input.also ?? [])]) {
      const link = await node.invite(ref, days * 24, { accept: input.ask === true });
      const parsed = input.ask ? peekKnock(link) : peekInvite(link);
      steps.push({ do: 'join', link, space: { id: parsed.space.id, kind: parsed.space.kind, name: parsed.space.name } });
      invites.push({ space: parsed.space.id, invite: parsed.invite });
    }
    steps.push({ do: 'open', space: project.id, ...(input.play ? { play: true as const } : {}) });
    const welcome = input.welcome?.trim().slice(0, 1000);
    if (welcome) steps.push({ do: 'welcome', text: welcome });
    const title = (project.page.title || project.name).slice(0, 200);
    const plan: OnboardPlan = { v: 1, by: { did: me, ...(name ? { name } : {}) }, title, steps };

    // The open preview: the creator's words, or a line saying who invites to what; the project's picture if it's a PNG.
    let preview: { title: string; text?: string } | undefined;
    let image: string | undefined;
    if (input.preview !== false) {
      const p = input.preview ?? {};
      preview = { title: (p.title?.trim() || title).slice(0, 100), text: (p.text?.trim() || `${name ?? 'Someone'} invites you to ${title} on Weave`).slice(0, 300) };
      const which = p.image ?? 'banner';
      const ref = which === 'none' ? undefined : which === 'icon' ? (project.page.icon ?? project.page.banner) : (project.page.banner ?? project.page.icon);
      if (ref && parseBlobRef(ref)) {
        const blob = await node.blob(ref).catch(() => undefined);
        const bytes = blob && Buffer.from(blob.data, 'base64');
        if (bytes && blob.type === 'image/png' && PNG.every((b, i) => bytes[i] === b) && bytes.length <= 300 * 1024) image = blob.data;
      }
    }

    const secret = newPlanSecret();
    const code = await withStorage(storage, page, (client) =>
      client.putPlan(node.identity, { sealed: sealPlan(plan, secret), check: planCheck(secret), ...(preview ? { preview } : {}), ...(image ? { image } : {}), ...(input.uses ? { uses: input.uses } : {}), expires }),
    ).catch((error: Error) => {
      // Nothing was made: the invites go again.
      for (const i of invites) void node.closeInvite(i.space, i.invite).catch(() => {});
      throw /operator decides/.test(error.message) ? new Error(`the storage node at ${new URL(storage).host} makes no links for this computer yet: its operator lets it with weave-storage planner ${node.identity.did}`) : error;
    });
    const record: LinkRecord = { code, link: onboardLink(page, code, secret), page, storage, title, invites, friends, created: new Date().toISOString(), expires, ...(input.uses ? { uses: input.uses } : {}) };
    this.#core.sealForSelf(KIND_ONBOARD_LINK, record as unknown as Json);
    return this.#info(record);
  }

  #info(r: LinkRecord, used?: number): OnboardLinkInfo {
    return { code: r.code, link: r.link, title: r.title, friends: r.friends, created: r.created, ...(r.expires ? { expires: r.expires } : {}), ...(r.uses ? { uses: r.uses } : {}), ...(used !== undefined ? { used } : {}), ...(r.revoked ? { revoked: true as const } : {}), spaces: r.invites.map((i) => i.space) };
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
  async follow(text: string, storage?: string): Promise<{ open?: SpaceInfo; joined: SpaceInfo[]; welcome?: string; play?: true }> {
    const { plan, parts, storage: at } = await this.#open(text, storage);
    if (plan.by.did === this.#node.identity.author) throw new Error("that's your own link");
    await withStorage(at, parts.page, (client) => client.takePlan(parts.code, planCheck(parts.secret), false));
    const joined: SpaceInfo[] = [];
    let openStep: Extract<OnboardStep, { do: 'open' }> | undefined;
    let welcome: string | undefined;
    for (const step of plan.steps) {
      if (step.do === 'contact') await this.#node.addContact(step.link).catch(() => {});
      else if (step.do === 'join') {
        const mine = (await this.#node.spaces()).find((s) => s.id === step.space.id);
        joined.push(mine ?? (await this.#node.joinSpace(step.link)));
      } else if (step.do === 'open') openStep = step;
      else if (step.do === 'welcome') welcome = step.text;
    }
    const open = openStep && (joined.find((s) => s.id === openStep.space) ?? (await this.#node.spaces()).find((s) => s.id === openStep.space));
    return { ...(open ? { open } : {}), joined, ...(welcome ? { welcome } : {}), ...(openStep?.play ? { play: true as const } : {}) };
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
          for (const m of members.filter((x) => x.did !== me && x.invite === invite)) {
            if ((await this.#node.profile(m.did)).following) continue;
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
