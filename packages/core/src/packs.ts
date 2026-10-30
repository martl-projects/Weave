/*
 * Setup packs: what a catalog offers for setting something up in a few clicks, not one by one. A pack is steps, each
 * a thing Weave knows how to do and to tell is done: add a keyvault, make its app, install that app (on the
 * platform's own page), add a service to the project, hand the project what the keyvault reaches. Weave walks its
 * person through them, skipping what's done. Nothing in a pack is platform-specific to Weave: "GitHub for this
 * project" is GitHub's keyvault and services named in such steps, and anyone's catalog can offer its own.
 *
 *   {"pack": "github-project", "title": "GitHub for this project", "about": "...", "steps": [
 *     {"keyvault": "github-keyvault"}, {"app": "github-keyvault"}, {"install": "github-keyvault"},
 *     {"service": "github-releases"}, {"service": "github-access"}, {"hand": "github-keyvault"}]}
 */

export type PackStep =
  /** Add a keyvault (by its name: one Weave ships, or added from a release). */
  | { kind: 'keyvault'; keyvault: string; why?: string }
  /** Make the keyvault's app (its first setting that registers one), unless it has one. */
  | { kind: 'app'; keyvault: string; why?: string }
  /** Install that app where it reaches things (the platform's page): done once it reaches something. */
  | { kind: 'install'; keyvault: string; why?: string }
  /** Add a service (one Weave ships, by name) to the project, or the one you run elsewhere. */
  | { kind: 'service'; service: string; why?: string }
  /** Hand the project what the keyvault reaches (its person picks). */
  | { kind: 'hand'; keyvault: string; why?: string };

export interface Pack {
  name: string;
  title: string;
  about?: string;
  steps: PackStep[];
}

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const KINDS = ['keyvault', 'app', 'install', 'service', 'hand'] as const;

/** A pack as a catalog offers it, checked: or why not. */
export function parsePack(value: unknown): { pack?: Pack; problem?: string } {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const name = typeof o.pack === 'string' && NAME.test(o.pack) ? o.pack : '';
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 60) : '';
  if (!name || !title) return { problem: 'a pack has a name ("pack", like "github-project") and a title' };
  const steps: PackStep[] = [];
  for (const [i, raw] of (Array.isArray(o.steps) ? o.steps : []).slice(0, 20).entries()) {
    const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const kind = KINDS.find((k) => typeof s[k] === 'string' && NAME.test(s[k] as string));
    if (!kind) return { problem: `steps[${i}] is one of ${KINDS.map((k) => `{"${k}": "<name>"}`).join(', ')}` };
    const why = typeof s.why === 'string' && s.why.trim() ? { why: s.why.trim().slice(0, 200) } : {};
    steps.push(kind === 'service' ? { kind, service: s.service as string, ...why } : ({ kind, keyvault: s[kind] as string, ...why } as PackStep));
  }
  if (!steps.length) return { problem: 'a pack has steps' };
  const about = typeof o.about === 'string' && o.about.trim() ? { about: o.about.trim().slice(0, 400) } : {};
  return { pack: { name, title, ...about, steps } };
}
