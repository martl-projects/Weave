import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { hue, loadBlobImages, renderMarkdown, useBlobUrl } from './lib.ts';

// ---------------------------------------------------------------- pixel art

/** A small deterministic random generator, so the same seed always draws the same picture. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** A mirrored pixel sprite (like an identicon) as an SVG string: people get faces, posts get patterns. */
function sprite(seed: string, size: number, face: boolean): string {
  const rand = seeded(seed);
  const h = hue(seed);
  const fg = `hsl(${h} 60% 42%)`;
  const fg2 = `hsl(${(h + 40) % 360} 70% 62%)`;
  const bg = `hsl(${(h + 180) % 360} 45% 88%)`;
  const half = Math.ceil(size / 2);
  let cells = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < half; x++) {
      const r = rand();
      if (r < 0.45) continue;
      const color = r > 0.85 ? fg2 : fg;
      cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
      if (x !== size - 1 - x) cells += `<rect x="${size - 1 - x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
  }
  if (face) {
    // Two eyes, so a sprite reads as a little character.
    const ey = Math.floor(size * 0.38);
    const ex = Math.floor(size * 0.25);
    cells += `<rect x="${ex}" y="${ey}" width="1" height="1" fill="#000"/><rect x="${size - 1 - ex}" y="${ey}" width="1" height="1" fill="#000"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${size + 2} ${size + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${size + 2}" height="${size + 2}" fill="${bg}"/>${cells}</svg>`;
}

export function Sprite({ seed, size = 40, face = false, className = '' }: { seed: string; size?: number; face?: boolean; className?: string }) {
  const svg = useMemo(() => sprite(seed, face ? 8 : 10, face), [seed, face]);
  return <span className={`sprite ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Avatar({ did, size = 32, status }: { did: string; name?: string; size?: number; status?: 'online' | 'offline' }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <Sprite seed={did} size={size} face />
      {status && <i className={`presence ${status}`} />}
    </span>
  );
}

export function WeaveMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="4" y="1" width="2" height="14" fill="#000080" />
      <rect x="10" y="1" width="2" height="14" fill="#008080" />
      <rect x="1" y="4" width="14" height="2" fill="#c00000" />
      <rect x="4" y="4" width="2" height="2" fill="#000080" />
      <rect x="1" y="10" width="14" height="2" fill="#d4a000" />
      <rect x="10" y="10" width="2" height="2" fill="#008080" />
    </svg>
  );
}

/** Markdown from other people, sanitized, with its images loaded from peers. `rich`: a project page, which may use inline styles. */
export function Markdown({ text, rich }: { text: string; rich?: boolean }) {
  const html = useMemo(() => renderMarkdown(text, rich), [text, rich]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) loadBlobImages(ref.current);
  }, [html]);
  return <div ref={ref} className={rich ? 'md md-rich' : 'md'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** An uploaded (wblob:) image, loaded from disk or peers. */
export function BlobImage({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  const url = useBlobUrl(src);
  return url ? <img src={url} alt={alt} className={className} /> : <span className={`${className ?? ''} blob-loading`} aria-label={alt} />;
}

// ---------------------------------------------------------------- windows

/** A Win95 dialog window over a dimmed screen. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-root">
      <div className="modal-back" onClick={onClose} />
      <div className={`window modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}

/** A Win95 menu: a label in the menu bar that opens a list of commands. */
export function Menu({ label, items }: { label: string; items: Array<{ label: string; onClick(): void; disabled?: boolean } | 'sep'> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`menu-label${open ? ' open' : ''}`} aria-label={label} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <u>{label[0]}</u>
        {label.slice(1)}
      </button>
      {open && (
        <ul className="menu-list window">
          {items.map((item, i) =>
            item === 'sep' ? (
              <li key={i} className="menu-sep" />
            ) : (
              <li key={item.label}>
                <button
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const emit = () => toastListeners.forEach((l) => l());

export function toast(text: string, kind: 'ok' | 'error' = 'ok'): void {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 3000);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className={`window toast ${t.kind}`}>
          <div className="window-body">
            {t.kind === 'error' ? '⚠ ' : 'ℹ '}
            {t.text}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Runs an async action, showing errors as toasts. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (success) toast(success);
    return result;
  } catch (error) {
    toast((error as Error).message, 'error');
    return undefined;
  }
}

/** A button that disables itself while its async action runs. */
export function AsyncButton({ onClick, className = '', children, title }: { onClick(): Promise<unknown>; className?: string; children: ReactNode; title?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      title={title}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
