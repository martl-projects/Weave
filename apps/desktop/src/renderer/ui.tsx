import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PostInfo } from '@weave/node/client';
import { ago, api, blobUrl, hue, loadBlobImages, onItem, plain, renderMarkdown, shortDid, useBlobUrl } from './lib.ts';
import { FigureHead, picture, postScene, useFigure, useSeen, type Figure } from './avatar.tsx';
import { loadInviteEmbeds } from './invites.tsx';
import { errorText, t, useTexts } from './texts.tsx';

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
export function sprite(seed: string, size: number, face: boolean): string {
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

/** A project's picture: the icon from its page, or else its pixel sprite. */
export function ProjectIcon({ id, icon, size = 40, className = '' }: { id: string; icon?: string; size?: number; className?: string }) {
  if (!icon) return <Sprite seed={id} size={size} className={className} />;
  return (
    <span className={`project-icon ${className}`} style={{ width: size, height: size }}>
      <BlobImage src={icon} alt="" />
    </span>
  );
}

/** Someone's picture: their avatar (Weave avatar), or the one their key makes; their pixel sprite until it's drawn. */
export function Avatar({ did, size = 32, status }: { did: string; name?: string; size?: number; status?: 'online' | 'offline' }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const figure = useFigure(did);
  const sprite = <Sprite seed={did} size={size} face />;
  return (
    <span ref={ref} className="avatar" style={{ width: size, height: size }}>
      {figure === undefined || !seen ? sprite : <FigureHead figure={figure} seed={did} fallback={sprite} />}
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

// ---------------------------------------------------------------- post embeds

const embedded = new Map<string, Promise<PostInfo>>();
// Posts change (votes, chat, edits): fetch them again for the next embed after any live event.
onItem(() => embedded.clear());

const PREFIX: Record<string, string> = { project: 'p/', community: 'r/', group: 'g/', direct: '@' };

/** Fill in the post embeds renderMarkdown left (.post-embed[data-post]) with a card of each post. */
export function loadEmbeds(root: HTMLElement): void {
  loadInviteEmbeds(root);
  for (const box of root.querySelectorAll<HTMLElement>('.post-embed[data-post]:not([data-ready])')) {
    const id = box.dataset.post!;
    box.dataset.ready = 'loading';
    let post = embedded.get(id);
    if (!post) {
      post = api<PostInfo>('post', id);
      embedded.set(id, post);
      post.catch(() => embedded.delete(id));
    }
    post.then(
      (p) => box.replaceChildren(embedCard(p)),
      () => {
        box.classList.add('missing');
        const link = document.createElement('a');
        link.setAttribute('href', id.startsWith('http') ? id : `weave:post:${id}`);
        link.textContent = "A post you can't see here";
        box.replaceChildren(link);
      },
    );
    box.dataset.ready = 'yes';
  }
}

/** A post as a card: picture, where and who, title, a bit of the text, votes and chat. The card is its link. */
function embedCard(p: PostInfo): HTMLElement {
  const el = (tag: string, className: string, text?: string) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const card = el('a', 'post-embed-card');
  card.setAttribute('href', `weave:post:${p.id}`);
  card.dataset.post = p.id;
  const thumb = el('span', 'post-embed-thumb');
  const scene = postScene(p);
  if (scene) {
    // Its author's avatar in its scene, like on the post's card.
    const img = document.createElement('img');
    img.alt = '';
    thumb.innerHTML = sprite(p.id, 10, false);
    void api<Record<string, Figure>>('avatars', [p.by.did])
      .catch(() => ({}) as Record<string, Figure>)
      .then((found) => picture(`scene:${scene}:128:close:${JSON.stringify(found[p.by.did] ?? p.by.did)}`, (l) => l.sceneSnapshot(found[p.by.did] ?? l.Avatar.fromSeed(p.by.did), scene, 128, 'close')))
      .then((url) => {
        img.src = url;
        thumb.replaceChildren(img);
      }, () => {});
  } else if (p.image) {
    const img = document.createElement('img');
    img.alt = '';
    blobUrl(p.image).then((url) => (img.src = url), () => {});
    thumb.append(img);
  } else if (p.project?.icon) {
    const img = document.createElement('img');
    img.alt = '';
    blobUrl(p.project.icon).then((url) => (img.src = url), () => {});
    thumb.append(img);
  } else thumb.innerHTML = sprite(p.project?.id ?? p.id, 10, false);
  const where = [p.space ? `${PREFIX[p.space.kind] ?? ''}${p.space.name}${p.board && p.space.kind === 'project' && p.type !== 'project' ? `/${p.board}` : ''}` : '', `u/${p.by.name ?? shortDid(p.by.did)}`, ago(p.time)].filter(Boolean).join(' · ');
  const body = el('span', 'post-embed-body');
  body.append(el('span', 'post-embed-where', where), el('b', 'post-embed-title', p.title));
  const text = plain(p.text);
  if (text) body.append(el('span', 'post-embed-text', text.length > 180 ? `${text.slice(0, 180)}…` : text));
  body.append(el('span', 'post-embed-meta', `▲ ${p.score} · ${p.chat} in chat`));
  card.append(thumb, body);
  return card;
}

/** Markdown from other people, sanitized, with its images loaded from peers. `rich`: a project page, which may use inline styles. */
export function Markdown({ text, rich }: { text: string; rich?: boolean }) {
  const html = useMemo(() => renderMarkdown(text, rich), [text, rich]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    loadBlobImages(ref.current);
    loadEmbeds(ref.current);
  }, [html]);
  return <div ref={ref} className={rich ? 'md md-rich' : 'md'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** An uploaded (wblob:) image, loaded from disk or peers. */
export function BlobImage({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  const url = useBlobUrl(src);
  return url ? <img src={url} alt={alt} className={className} /> : <span className={`${className ?? ''} blob-loading`} aria-label={alt} />;
}

/** Where a mark or hint service comes from, in its title: Weave's own (checked by its digest), or a project's release. */
export function ServiceOrigin({ shipped, project, tag }: { shipped?: boolean; project?: string; tag?: string }) {
  const { t } = useTexts();
  if (shipped)
    return (
      <span className="tag origin-weave" title={t('origin.weave.title')}>
        {t('origin.weave')}
      </span>
    );
  return (
    <span className="tag" title={t('origin.release.title', { project: project ? `p/${project}` : t('origin.project.unknown'), tag })}>
      {project ? `p/${project}` : t('origin.other.project')}
    </span>
  );
}

// ---------------------------------------------------------------- windows

/** A Win95 dialog window over a dimmed screen. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const { t } = useTexts();
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
            <button aria-label={t('window.close')} onClick={onClose} />
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
    <>
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
      <Questions />
    </>
  );
}

// ---------------------------------------------------------------- questions

interface Question {
  text: string;
  yes: string;
  answer(yes: boolean): void;
}
let showQuestion: ((q: Question) => void) | undefined;

/**
 * Ask the person to confirm, in a Win95 message box. Used instead of the
 * browser's confirm(), which some windows (like a preview pane) never show.
 */
export function ask(text: string, yes?: string): Promise<boolean> {
  return new Promise((answer) => (showQuestion ? showQuestion({ text, yes: yes ?? t('button.ok'), answer }) : answer(window.confirm(text))));
}

/** Where ask() shows its box; mounted once, with the toasts. */
function Questions() {
  const [question, setQuestion] = useState<Question>();
  useEffect(() => {
    showQuestion = setQuestion;
    return () => {
      showQuestion = undefined;
    };
  }, []);
  if (!question) return null;
  const done = (yes: boolean) => {
    question.answer(yes);
    setQuestion(undefined);
  };
  return (
    <Modal title="Weave" onClose={() => done(false)}>
      <p className="question-text">{question.text}</p>
      <div className="buttons">
        <button onClick={() => done(false)}>{t('button.cancel')}</button>
        <button className="default" autoFocus onClick={() => done(true)}>
          {question.yes}
        </button>
      </div>
    </Modal>
  );
}

/** Runs an async action, showing errors as toasts. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (success) toast(success);
    return result;
  } catch (error) {
    toast(errorText(error), 'error');
    return undefined;
  }
}

/** A button that disables itself while its async action runs (and while `disabled`). */
export function AsyncButton({ onClick, className = '', children, title, disabled = false }: { onClick(): Promise<unknown>; className?: string; children: ReactNode; title?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      title={title}
      disabled={busy || disabled}
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
