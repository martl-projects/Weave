import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Did } from '@weave/core';

/*
 * Onboarding links on a storage node (idea bZFDCQNT): a creator puts a plan, sealed, under a short code; whoever has the
 * whole link (`/j/<code>#<key>`) gets it and opens it. The node can't: the key after `#` never reaches it. What it keeps
 * in the open is only what the creator chose to show in a link preview (a title, a line, a picture), and the counts.
 *
 *   plans/<code>.json   {code, by, sealed, check, preview?, uses?, used, expires?, revoked?, created}
 *   plans/<code>.png    the preview's picture
 *   planners.json       the identities the operator lets put plans (weave-storage planner <did>)
 *
 * Taking a plan counts a use and, for someone without an account, hands out a one-time account invitation: the link is
 * the invitation, so the operator no longer makes them by hand. To take one, a client shows the key's check (a hash
 * of the key), so a preview fetch that has only the code never uses one up.
 */

export const PLAN_CODE = /^[A-Za-z0-9]{8}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const MAX_SEALED = 64 * 1024;
/** WhatsApp leaves a preview's picture out above about 300 KB. */
export const MAX_PREVIEW_IMAGE = 300 * 1024;
const MAX_USES = 100_000;
const MAX_PLANS_PER_PLANNER = 500;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PlanPreview {
  title: string;
  text?: string;
}

interface PlanFile {
  code: string;
  by: Did;
  sealed: string;
  /** The key's check, hashed again: a taker shows the check, the node compares hashes. */
  check: string;
  preview?: PlanPreview;
  image?: true;
  uses?: number;
  used: number;
  expires?: string;
  revoked?: true;
  created: string;
}

/** What a creator sees of one of their links. */
export interface PlanInfo {
  code: string;
  preview?: PlanPreview;
  image?: true;
  uses?: number;
  used: number;
  expires?: string;
  revoked?: true;
  created: string;
}

/** What anyone with the code sees: the preview, and whether the link still works. */
export interface PlanPreviewInfo {
  live: boolean;
  preview?: PlanPreview;
  image?: true;
}

const hashOf = (text: string) => createHash('sha256').update('weave/plan/check/v1').update(text).digest('base64url');
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function writeJson(path: string, value: unknown): void {
  const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, path);
}

function newCode(): string {
  const bytes = randomBytes(8);
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** A preview from untrusted input, trimmed to what a link card shows. */
function previewOf(value: unknown): PlanPreview | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { title, text } = value as Record<string, unknown>;
  if (!isText(title, 200)) return undefined;
  const line = typeof text === 'string' ? text.trim().slice(0, 300) : '';
  return { title: title.trim().slice(0, 100), ...(line ? { text: line } : {}) };
}

export class PlanStore {
  readonly #dir: string;
  readonly #root: string;

  constructor(dir: string) {
    this.#root = dir;
    this.#dir = join(dir, 'plans');
    mkdirSync(this.#dir, { recursive: true });
  }

  /** Let an identity put plans here (the operator's word, from another process while the node runs). */
  static allowIn(dir: string, did: Did, on = true): Did[] {
    mkdirSync(dir, { recursive: true });
    const now = new Set(PlanStore.plannersIn(dir));
    if (on) now.add(did);
    else now.delete(did);
    writeJson(join(dir, 'planners.json'), [...now]);
    return [...now];
  }

  static plannersIn(dir: string): Did[] {
    const path = join(dir, 'planners.json');
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Did[]) : [];
  }

  mayPlan(did: Did): boolean {
    return PlanStore.plannersIn(this.#root).includes(did);
  }

  #path(code: string): string {
    return join(this.#dir, `${code}.json`);
  }

  #read(code: unknown): PlanFile | undefined {
    if (typeof code !== 'string' || !PLAN_CODE.test(code) || !existsSync(this.#path(code))) return undefined;
    return JSON.parse(readFileSync(this.#path(code), 'utf8')) as PlanFile;
  }

  #live(plan: PlanFile, now = Date.now()): boolean {
    return !plan.revoked && (!plan.expires || Date.parse(plan.expires) > now) && (plan.uses === undefined || plan.used < plan.uses);
  }

  #mine(by: Did): PlanFile[] {
    return readdirSync(this.#dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(this.#dir, f), 'utf8')) as PlanFile)
      .filter((p) => p.by === by);
  }

  /** A new link's plan, from a planner. Returns its code. */
  put(by: Did, input: Record<string, unknown>): string {
    if (!this.mayPlan(by)) throw new Error('this storage node makes no links for you: its operator decides who may');
    if (!isText(input.sealed, MAX_SEALED)) throw new Error('that is not a sealed plan');
    if (!isText(input.check, 100)) throw new Error('a plan needs its check');
    const uses = input.uses === undefined || input.uses === null ? undefined : Number(input.uses);
    if (uses !== undefined && (!Number.isInteger(uses) || uses < 1 || uses > MAX_USES)) throw new Error(`uses are a whole number from 1 to ${MAX_USES}`);
    const expires = typeof input.expires === 'string' && !Number.isNaN(Date.parse(input.expires)) ? new Date(input.expires).toISOString() : undefined;
    if (input.expires !== undefined && input.expires !== null && !expires) throw new Error('expires is a date');
    if (this.#mine(by).filter((p) => !p.revoked).length >= MAX_PLANS_PER_PLANNER) throw new Error(`at most ${MAX_PLANS_PER_PLANNER} links at once: revoke some first`);
    let image: Buffer | undefined;
    if (input.image !== undefined && input.image !== null) {
      if (typeof input.image !== 'string') throw new Error('a preview picture is a PNG, base64');
      image = Buffer.from(input.image, 'base64');
      if (image.length > MAX_PREVIEW_IMAGE || !PNG.every((b, i) => image![i] === b)) throw new Error(`a preview picture is a PNG of at most ${MAX_PREVIEW_IMAGE / 1024} KB`);
    }
    const preview = previewOf(input.preview);
    let code = newCode();
    while (existsSync(this.#path(code))) code = newCode();
    const plan: PlanFile = { code, by, sealed: input.sealed, check: hashOf(input.check), ...(preview ? { preview } : {}), ...(image && preview ? { image: true as const } : {}), ...(uses ? { uses } : {}), used: 0, ...(expires ? { expires } : {}), created: new Date().toISOString() };
    if (image && preview) writeFileSync(join(this.#dir, `${code}.png`), image);
    writeJson(this.#path(code), plan);
    return code;
  }

  /** The sealed plan, for whoever has the code; nothing once it no longer works. Counts nothing. */
  get(code: unknown): { sealed: string; by: Did } | undefined {
    const plan = this.#read(code);
    return plan && this.#live(plan) ? { sealed: plan.sealed, by: plan.by } : undefined;
  }

  /** Take a use, with the key's check. `account`: the taker has none yet, so it gets an invitation for one. */
  take(code: unknown, check: unknown, account: boolean, invite: () => string): { invite?: string } {
    const plan = this.#read(code);
    if (!plan || !this.#live(plan)) throw new Error('this invite link no longer works');
    const given = Buffer.from(typeof check === 'string' ? hashOf(check) : '');
    if (given.length !== plan.check.length || !timingSafeEqual(given, Buffer.from(plan.check))) throw new Error('that is not this link');
    plan.used++;
    writeJson(this.#path(plan.code), plan);
    return account ? { invite: invite() } : {};
  }

  /** The creator takes a link back: it stops working, and its preview says so. */
  revoke(by: Did, code: unknown): void {
    const plan = this.#read(code);
    if (!plan || plan.by !== by) throw new Error('no such link of yours');
    plan.revoked = true;
    plan.sealed = '';
    writeJson(this.#path(plan.code), plan);
  }

  /** A creator's links, newest first. */
  list(by: Did): PlanInfo[] {
    return this.#mine(by)
      .sort((a, b) => b.created.localeCompare(a.created))
      .map(({ code, preview, image, uses, used, expires, revoked, created }) => ({ code, ...(preview ? { preview } : {}), ...(image ? { image } : {}), ...(uses ? { uses } : {}), used, ...(expires ? { expires } : {}), ...(revoked ? { revoked } : {}), created }));
  }

  /** What a link preview shows; undefined for a code that never was. */
  preview(code: unknown): PlanPreviewInfo | undefined {
    const plan = this.#read(code);
    if (!plan) return undefined;
    const live = this.#live(plan);
    return { live, ...(live && plan.preview ? { preview: plan.preview } : {}), ...(live && plan.image ? { image: true as const } : {}) };
  }

  /** The preview's picture, while the link works. */
  image(code: unknown): Buffer | undefined {
    const plan = this.#read(code);
    if (!plan || !plan.image || !this.#live(plan)) return undefined;
    const path = join(this.#dir, `${plan.code}.png`);
    return existsSync(path) ? readFileSync(path) : undefined;
  }

  /** Forget a link entirely (tests, or an operator cleaning up). */
  remove(code: string): void {
    rmSync(this.#path(code), { force: true });
    rmSync(join(this.#dir, `${code}.png`), { force: true });
  }
}
