import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountProofText, type AccountClaim, type AppOAuth, type Did } from '@weave/core';
import type { Home } from './home.ts';
import { prepareWasm, type Runtime } from './runtime.ts';
import { shippedProblem, shippedServices, SHIPPED_DIR, type ShippedService } from './shipped.ts';

/*
 * Verifiers: client apps that check whether an account on a platform is a person's (weave.account), run by this node
 * whenever it needs to know, so nobody has to trust anyone's word for it. Weave knows no platform: the verifier for it
 * does (it reaches only the hosts its manifest names). Answers are kept for an hour; one that couldn't tell (the
 * platform didn't answer) isn't kept, and is asked again next time.
 */

export interface PlatformInfo {
  platform: string;
  /** Its verifier makes the proof itself, with a sign-in with a code: one click. */
  prove?: true;
  /** The verifier that checks it. */
  verifier: string;
  /** Its icon, as its verifier names it (one of Weave's). */
  icon?: string;
  title: string;
  howto?: string;
  page?: string;
}

/** How long a verifier may take for one claim. */
const VERIFY_MS = 30_000;
/** How long an answer is kept. */
const KEEP_MS = 60 * 60_000;

export class Verifiers {
  readonly #homeOf: () => Home;
  readonly #runtime: Runtime;
  readonly #shippedDir: () => string | undefined;
  readonly #known = new Map<string, { at: number; ok: boolean }>();
  readonly #asking = new Map<string, Promise<boolean | undefined>>();
  clock: () => number = Date.now;

  constructor(home: () => Home, runtime: Runtime, shippedDir: () => string | undefined) {
    this.#homeOf = home;
    this.#runtime = runtime;
    this.#shippedDir = shippedDir;
  }

  /** The verifiers this Weave ships. */
  shipped(): ShippedService[] {
    return [...shippedServices(this.#shippedDir() ?? SHIPPED_DIR).values()].filter((s) => s.manifest.verifier);
  }

  /** The platforms accounts can be proven on here, with how. */
  platforms(): PlatformInfo[] {
    return this.shipped().flatMap((s) => s.manifest.verifier!.platforms.map((platform) => ({ platform, verifier: s.name, title: s.manifest.name, ...(s.manifest.verifier!.prove?.device ? { prove: true as const } : {}), ...(s.manifest.verifier!.icon ? { icon: s.manifest.verifier!.icon } : {}), ...(s.manifest.verifier!.howto ? { howto: s.manifest.verifier!.howto } : {}), ...(s.manifest.verifier!.page ? { page: s.manifest.verifier!.page } : {}) })));
  }

  /** An account's page on its platform, if its verifier says where. */
  page(claim: AccountClaim): string | undefined {
    const page = this.platforms().find((p) => p.platform === claim.platform)?.page;
    return page ? page.replace('{handle}', encodeURIComponent(claim.handle)) : undefined;
  }

  #key = (claim: AccountClaim, subject: Did) => JSON.stringify([claim.platform, claim.handle.toLowerCase(), claim.proof, subject]);

  /** What's known of a claim without asking: true, false, or not known (yet). */
  known(claim: AccountClaim, subject: Did): boolean | undefined {
    const kept = this.#known.get(this.#key(claim, subject));
    return kept && this.clock() - kept.at < KEEP_MS ? kept.ok : undefined;
  }

  /** Whether a claim holds, as its platform's verifier finds it: undefined when it couldn't tell, or none checks it. */
  async verify(claim: AccountClaim, subject: Did): Promise<boolean | undefined> {
    const known = this.known(claim, subject);
    if (known !== undefined) return known;
    const key = this.#key(claim, subject);
    const asking = this.#asking.get(key);
    if (asking) return asking;
    const work = this.#run(claim, subject)
      .then((ok) => {
        if (ok !== undefined) this.#known.set(key, { at: this.clock(), ok });
        return ok;
      })
      .finally(() => this.#asking.delete(key));
    this.#asking.set(key, work);
    return work;
  }

  /** How a platform's verifier makes a proof itself, with a sign-in with a code, if it does. */
  prover(platform: string): AppOAuth | undefined {
    return this.shipped().find((x) => x.manifest.verifier!.platforms.includes(platform))?.manifest.verifier!.prove;
  }

  /** Have a platform's verifier make a proof for someone, with a token they just gave it: {handle, proof}. */
  async prove(platform: string, token: string, subject: Did): Promise<{ handle: string; proof: string }> {
    const s = this.shipped().find((x) => x.manifest.verifier!.platforms.includes(platform));
    if (!s) throw new Error(`nothing here checks accounts on ${platform}`);
    const made = JSON.parse(String(await this.#call(s, 'prove', JSON.stringify({ platform, token, subject, text: accountProofText(subject) })))) as { handle?: unknown; proof?: unknown };
    if (typeof made.handle !== 'string' || typeof made.proof !== 'string') throw new Error(`${s.manifest.name} made no proof`);
    return { handle: made.handle, proof: made.proof };
  }

  /** Run the platform's verifier once, in a worker of its own. */
  async #run(claim: AccountClaim, subject: Did): Promise<boolean | undefined> {
    const s = this.shipped().find((x) => x.manifest.verifier!.platforms.includes(claim.platform));
    if (!s || shippedProblem(s)) return undefined;
    try {
      return (await this.#call(s, 'verify', JSON.stringify({ ...claim, subject, text: accountProofText(subject) }))) === true;
    } catch {
      return undefined;
    }
  }

  /** Call one of a verifier's functions, in a worker of its own for that call. */
  async #call(s: ShippedService, fn: string, input: string): Promise<unknown> {
    const problem = shippedProblem(s);
    if (problem) throw new Error(problem);
    const dir = join(this.#homeOf().dir, 'verifiers', s.name);
    const entry = await prepareWasm(s.file, join(dir, 'wasm'));
    const key = `verifier:${s.name}:${randomBytes(4).toString('hex')}`;
    this.#runtime.startWasm(
      key,
      {
        dir: join(dir, 'wasm'),
        entry,
        data: join(dir, 'data'),
        log: join(dir, 'verifier.log'),
        name: s.name,
        net: s.manifest.verifier!.net ?? [],
        taskMs: VERIFY_MS,
        host: (name, args) => {
          if (name === 'log') return void appendFileSync(join(dir, 'verifier.log'), `${String(args[0]).slice(0, 2000)}\n`);
          throw new Error(`a verifier has no ${name}`);
        },
      },
      () => {},
    );
    try {
      return await this.#runtime.callWasm(key, fn, [input]);
    } finally {
      this.#runtime.stop(key);
    }
  }
}
