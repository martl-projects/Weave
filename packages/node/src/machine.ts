import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Managed settings (stage 12): what a company's device management sets for
 * Weave on a computer, read before anything the person sets. Windows: the
 * policy registry key (Intune, Group Policy; see apps/desktop/policy) or a
 * file in ProgramData; macOS: a configuration profile's managed preferences or
 * a file; Linux: a file in /etc. WEAVE_POLICY names a file anywhere.
 */

export interface MachinePolicy {
  /** The company's enrollment link: `weave enroll` needs only the sign-in. */
  enroll?: string;
  /** No private identities on this computer: only company accounts. */
  companyOnly?: boolean;
  /** The companies (their ids) whose accounts may be set up here. */
  companies?: string[];
  /** This computer's certificate from the company's device authority, and its key (PEM files). */
  deviceCert?: string;
  deviceKey?: string;
  /** False: no update prompts (IT rolls out versions). */
  updates?: boolean;
}

const APP_ID = 'org.weave.desktop';

function fromJson(value: unknown): MachinePolicy {
  const v = (value ?? {}) as Record<string, unknown>;
  const bool = (x: unknown) => (typeof x === 'boolean' ? x : typeof x === 'number' ? x !== 0 : typeof x === 'string' ? ['1', 'true', 'yes'].includes(x.toLowerCase()) : undefined);
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : typeof x === 'string' ? x.split(/[\s,;]+/).filter(Boolean) : undefined);
  const get = (name: string) => v[name] ?? v[name[0].toUpperCase() + name.slice(1)];
  const out: MachinePolicy = {};
  if (typeof get('enroll') === 'string') out.enroll = get('enroll') as string;
  if (bool(get('companyOnly')) !== undefined) out.companyOnly = bool(get('companyOnly'));
  if (list(get('companies'))?.length) out.companies = list(get('companies'));
  if (typeof get('deviceCert') === 'string') out.deviceCert = get('deviceCert') as string;
  if (typeof get('deviceKey') === 'string') out.deviceKey = get('deviceKey') as string;
  if (bool(get('updates')) !== undefined) out.updates = bool(get('updates'));
  return out;
}

/** Values under HKLM\SOFTWARE\Policies\Weave, as `reg query` shows them. */
function fromRegistry(): MachinePolicy {
  try {
    const text = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Policies\\Weave'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const values: Record<string, unknown> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s+(\S+)\s+(REG_\w+)\s+(.*)$/.exec(line);
      if (!m) continue;
      const [, name, type, data] = m;
      values[name] = type === 'REG_DWORD' ? Number.parseInt(data, 16) : type === 'REG_MULTI_SZ' ? data.split('\\0').filter(Boolean) : data.trim();
    }
    return fromJson(values);
  } catch {
    return {};
  }
}

/** A configuration profile's managed preferences for the app, through plutil. */
function fromManagedPreferences(): MachinePolicy {
  const file = `/Library/Managed Preferences/${APP_ID}.plist`;
  if (!existsSync(file)) return {};
  try {
    return fromJson(JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' })));
  } catch {
    return {};
  }
}

const fromFile = (file: string | undefined): MachinePolicy => {
  if (!file || !existsSync(file)) return {};
  try {
    return fromJson(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return {};
  }
};

let cached: { key: string; policy: MachinePolicy } | undefined;

/** This computer's managed settings: the policy source of its platform first, then its file. */
export function machinePolicy(): MachinePolicy {
  const key = process.env.WEAVE_POLICY ?? '';
  if (cached?.key === key) return cached.policy;
  const file =
    process.platform === 'win32'
      ? join(process.env.ProgramData ?? 'C:\\ProgramData', 'Weave', 'weave.policy.json')
      : process.platform === 'darwin'
        ? '/Library/Application Support/Weave/weave.policy.json'
        : '/etc/weave/weave.policy.json';
  const policy = process.env.WEAVE_POLICY
    ? fromFile(process.env.WEAVE_POLICY)
    : { ...fromFile(file), ...(process.platform === 'win32' ? fromRegistry() : process.platform === 'darwin' ? fromManagedPreferences() : {}) };
  cached = { key, policy };
  return policy;
}

/** For tests: read the settings again. */
export function forgetMachinePolicy(): void {
  cached = undefined;
}
