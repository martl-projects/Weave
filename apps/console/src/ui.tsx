import { useCallback, useEffect, useState, type ReactNode } from 'react';
// Pixel icons, as in the Weave app: pixelarticons (MIT).
import analytics from 'pixelarticons/svg/analytics.svg';
import briefcases from 'pixelarticons/svg/briefcases.svg';
import check from 'pixelarticons/svg/check.svg';
import clipboardNote from 'pixelarticons/svg/clipboard-note.svg';
import clock from 'pixelarticons/svg/clock.svg';
import copy from 'pixelarticons/svg/copy.svg';
import database from 'pixelarticons/svg/database.svg';
import download from 'pixelarticons/svg/download.svg';
import externalLink from 'pixelarticons/svg/external-link.svg';
import grid from 'pixelarticons/svg/grid-2x2-2.svg';
import key from 'pixelarticons/svg/key.svg';
import link from 'pixelarticons/svg/link.svg';
import lock from 'pixelarticons/svg/lock.svg';
import login from 'pixelarticons/svg/login.svg';
import logout from 'pixelarticons/svg/logout.svg';
import monitor from 'pixelarticons/svg/monitor.svg';
import moon from 'pixelarticons/svg/moon.svg';
import plug from 'pixelarticons/svg/plug.svg';
import plus from 'pixelarticons/svg/plus.svg';
import reload from 'pixelarticons/svg/reload.svg';
import send from 'pixelarticons/svg/send.svg';
import shield from 'pixelarticons/svg/shield.svg';
import sun from 'pixelarticons/svg/sun.svg';
import trash from 'pixelarticons/svg/trash.svg';
import users from 'pixelarticons/svg/users.svg';
import warning from 'pixelarticons/svg/warning-diamond.svg';

const ICONS = { analytics, briefcases, check, clipboardNote, clock, copy, database, download, externalLink, grid, key, link, lock, login, logout, monitor, moon, plug, plus, reload, send, shield, sun, trash, users, warning };
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return <span className={`icon ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

/**
 * Weave's mark: four strands woven together, each over one and under the
 * next (navy over red, red over teal, gold over navy, teal over gold).
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" viewBox="0 0 512 512" width={size} height={size} aria-hidden="true">
      <rect x="128" y="32" width="64" height="448" fill="var(--strand-navy)" />
      <rect x="320" y="32" width="64" height="448" fill="var(--strand-teal)" />
      <rect x="32" y="128" width="448" height="64" fill="var(--strand-red)" />
      <rect x="32" y="320" width="448" height="64" fill="var(--strand-gold)" />
      <rect x="128" y="128" width="64" height="64" fill="var(--strand-navy)" />
      <rect x="320" y="320" width="64" height="64" fill="var(--strand-teal)" />
    </svg>
  );
}

export class Unauthorized extends Error {}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined || init?.method ? { 'content-type': 'application/json', 'x-weave-console': '1' } : {},
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (res.status === 401) throw new Unauthorized();
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body;
}

/** Load something, with a way to load it again. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data?: T; error?: string; reload(): void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load()
      .then((d) => live && (setData(d), setError(undefined)))
      .catch((e: Error) => live && setError(e instanceof Unauthorized ? 'signed out' : e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** A button that runs something, shows it's busy and reports what went wrong. */
export function Run({ children, run, kind, icon, confirm: ask, disabled, small, title }: { children?: ReactNode; run: () => Promise<unknown>; kind?: 'primary' | 'danger' | 'ghost'; icon?: IconName; confirm?: string; disabled?: boolean; small?: boolean; title?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn ${kind ?? ''} ${small ? 'small' : ''} ${children ? '' : 'icon-only'}`}
      title={title}
      aria-label={title}
      disabled={busy || disabled}
      onClick={async () => {
        if (ask && !window.confirm(ask)) return;
        setBusy(true);
        try {
          await run();
        } catch (e) {
          window.alert((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {icon && <Icon name={busy ? 'reload' : icon} className={busy ? 'spin' : ''} />}
      {children && <span>{busy && !icon ? '…' : children}</span>}
    </button>
  );
}

/** A status: a colored dot and a word. */
export function Badge({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'muted' | 'info'; children: ReactNode }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

const STRANDS = ['navy', 'teal', 'red', 'gold'];

/** Initials on one of the logo's strand colors, the same for the same person. */
export function Avatar({ name, id, ring, title }: { name?: string; id: string; ring?: boolean; title?: string }) {
  const initials =
    (name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className={`avatar strand-${STRANDS[hash % STRANDS.length]} ${ring ? 'ring' : ''}`} title={title}>
      {initials}
    </span>
  );
}

/** People as a row of overlapping avatars (names on hover), and how many more. */
export function Faces({ people, max = 7 }: { people: Array<{ did: string; name?: string; maintainer?: boolean }>; max?: number }) {
  return (
    <div className="faces">
      {people.slice(0, max).map((p) => (
        <Avatar key={p.did} name={p.name} id={p.did} ring={p.maintainer} title={`${p.name ?? p.did.slice(8, 16)}${p.maintainer ? ' (maintainer)' : ''}`} />
      ))}
      {people.length > max && <span className="avatar more">+{people.length - max}</span>}
      <span className="count">{people.length}</span>
    </div>
  );
}

/** Nothing here yet: a quiet icon and what would show. */
export function Empty({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div>{children}</div>
    </div>
  );
}

export function Problem({ error }: { error?: string }) {
  return error ? (
    <div className="notice error">
      <Icon name="warning" /> {error}
    </div>
  ) : null;
}

/** Opens it in the Weave app (weave:project:…, weave:group:…). */
export function Open({ kind, id, children }: { kind?: string; id: string; children: ReactNode }) {
  return kind ? (
    <a className="open" href={`weave:${kind}:${id}`} title="Open in Weave">
      {children}
      <Icon name="externalLink" size={12} />
    </a>
  ) : (
    <>{children}</>
  );
}

/** Copy text, and say so. */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy">
      <code>{text}</code>
      <button
        className="btn small ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} />
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

/** A page's heading: an icon, the title, what it's for, and actions. */
export function Header({ icon, title, lead, children }: { icon: IconName; title: string; lead: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="page-title">
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
