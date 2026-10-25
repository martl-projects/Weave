/*
 * Weave's version numbers: "0.3.0", "v0.3.0" or a release title like
 * "Weave v0.3.0". Pre-release suffixes ("-beta.1") rank below the release.
 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** "beta.1" in 1.0.0-beta.1; none for a release. */
  pre?: string;
}

const VERSION = /(?:^|[\s/])v?(\d{1,4})\.(\d{1,4})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,40}))?(?=$|[\s),.;:])/;

/** The first version number in a text, if there is one. */
export function parseVersion(text: string): Version | undefined {
  const m = VERSION.exec(text.trim());
  if (!m) return undefined;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), ...(m[4] ? { pre: m[4] } : {}) };
}

export const formatVersion = (v: Version): string => `${v.major}.${v.minor}.${v.patch}${v.pre ? `-${v.pre}` : ''}`;

/** Negative when a is older, positive when newer, 0 when the same. Unreadable versions count as oldest. */
export function compareVersions(a: string | Version | undefined, b: string | Version | undefined): number {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (const key of ['major', 'minor', 'patch'] as const) if (x[key] !== y[key]) return x[key] - y[key];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}
