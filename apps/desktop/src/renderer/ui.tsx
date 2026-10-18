import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { hue } from './lib.ts';

export function Avatar({ did, name, size = 40, status }: { did: string; name?: string; size?: number; status?: 'online' | 'offline' }) {
  return (
    <span className="avatar" style={{ '--h': hue(did), '--s': `${size}px` } as React.CSSProperties}>
      {(name ?? '?').slice(0, 1).toUpperCase()}
      {status && <i className={`presence ${status}`} />}
    </span>
  );
}

export function WeaveMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" strokeWidth="4.5">
        <path d="M11 4v24" stroke="var(--accent)" strokeLinecap="round" />
        <path d="M21 4v24" stroke="var(--agent)" strokeLinecap="round" />
        <path d="M4 11h24" stroke="var(--rail)" strokeWidth="8.5" />
        <path d="M4 11h24" stroke="var(--service)" strokeLinecap="round" />
        <path d="M4 21h24" stroke="var(--rail)" strokeWidth="8.5" />
        <path d="M4 21h24" stroke="var(--accent)" strokeLinecap="round" />
        <path d="M11 6.5v9" stroke="var(--rail)" strokeWidth="8.5" />
        <path d="M11 6v10" stroke="var(--accent)" />
        <path d="M21 16.5v9" stroke="var(--rail)" strokeWidth="8.5" />
        <path d="M21 16v10" stroke="var(--agent)" />
      </g>
    </svg>
  );
}

export function Modal({ onClose, children, wide }: { onClose(): void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-root">
      <div className="modal-back" onClick={onClose} />
      <div className={`modal${wide ? ' wide' : ''}`}>{children}</div>
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
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
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
export function AsyncButton({ onClick, className = 'btn', children, title }: { onClick(): Promise<unknown>; className?: string; children: ReactNode; title?: string }) {
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
