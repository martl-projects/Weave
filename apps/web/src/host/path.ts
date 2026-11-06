/* node:path for a browser: a home's paths, always with forward slashes. */

export const sep = '/';
export const delimiter = ':';

export function normalize(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
    else if (part !== '..' || !absolute) parts.push(part);
  }
  return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.');
}

export const join = (...paths: string[]): string => normalize(paths.filter(Boolean).join('/'));

export function resolve(...paths: string[]): string {
  let path = '';
  for (const part of [...paths].reverse()) {
    if (!part) continue;
    path = path ? `${part}/${path}` : part;
    if (part.startsWith('/')) break;
  }
  return normalize(path.startsWith('/') ? path : `/${path}`);
}

export const isAbsolute = (path: string): boolean => path.startsWith('/');

export function dirname(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed && path) return '/';
  const end = trimmed.lastIndexOf('/');
  return end < 0 ? '.' : end === 0 ? '/' : path.slice(0, end);
}

export function basename(path: string, suffix?: string): string {
  const base = path.replace(/\/+$/, '').split('/').at(-1) ?? '';
  return suffix && base.endsWith(suffix) && base !== suffix ? base.slice(0, -suffix.length) : base;
}

export function extname(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

export function relative(from: string, to: string): string {
  const a = resolve(from).split('/').filter(Boolean);
  const b = resolve(to).split('/').filter(Boolean);
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  return [...a.slice(same).map(() => '..'), ...b.slice(same)].join('/');
}

export const posix = { sep, delimiter, normalize, join, resolve, isAbsolute, dirname, basename, extname, relative };
export default posix;
