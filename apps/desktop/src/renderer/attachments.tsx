import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Attachment } from '@weave/core';
import { api, blobUrl, shrinkImage } from './lib.ts';
import { Icon } from './icons.tsx';
import { t, useTexts } from './texts.tsx';

/*
 * Files and images in chat. A message carries its file by blob reference with
 * name, size and type (all inside the sealed message), the sender holds the
 * encrypted blob and the readers fetch it from whoever has it. Images show as a
 * thumbnail that opens full size; other files as a card to save. The bytes come
 * when asked for: a thumbnail asks at once, a file card when you save it.
 */

export const MAX_FILE = 2 * 1024 * 1024;

/** A size as people read it. */
export const fileSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const isImage = (type: string) => /^image\/(png|jpeg|webp|gif)$/.test(type);

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/**
 * Upload a file to attach: an image is shrunk to at most 1600 pixels and re-encoded
 * (which drops metadata such as GPS positions, as for posts), anything else goes as
 * it is. At most 2 MB after that; refused before anything is sent otherwise.
 */
export async function uploadFile(file: File): Promise<Attachment> {
  let blob: Blob = file;
  let name = file.name || 'file';
  let type = file.type || 'application/octet-stream';
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    blob = await shrinkImage(file, 1600);
    type = blob.type;
    if (blob.type !== file.type) name = name.replace(/\.[^.]+$/, '') + (blob.type === 'image/webp' ? '.webp' : '');
  }
  if (blob.size > MAX_FILE) throw new Error(t('file.too.big.size', { name, size: fileSize(blob.size) }));
  const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
  if (isImage(type)) return { ref: await api<string>('putBlob', { data, type }), name, size: blob.size, type };
  return api<Attachment>('putFile', { data, name, type });
}

/** Save a blob to the person's files: the browser's download on the desktop, the share sheet on a phone where there is one. */
export async function saveBlob(file: Attachment): Promise<void> {
  const url = await blobUrl(file.ref);
  const native = 'Capacitor' in window && (window as unknown as { Capacitor: { isNativePlatform?(): boolean } }).Capacitor.isNativePlatform?.();
  if (native && typeof navigator.share === 'function') {
    const bytes = await (await fetch(url)).blob();
    const shared = new File([bytes], file.name, { type: file.type });
    if (navigator.canShare?.({ files: [shared] })) return navigator.share({ files: [shared], title: file.name });
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type BlobState = { status: 'idle' | 'fetching' | 'ready' | 'missing'; url?: string; error?: string };

/** A blob's bytes as a local URL, fetched on demand (`now` asks at once) and again on `retry`. */
export function useBlob(ref: string, now: boolean): BlobState & { fetch(): Promise<string | undefined> } {
  const [state, setState] = useState<BlobState>({ status: 'idle' });
  const fetchIt = useCallback(async () => {
    setState((s) => (s.status === 'ready' ? s : { status: 'fetching' }));
    try {
      const url = await blobUrl(ref);
      setState({ status: 'ready', url });
      return url;
    } catch (error) {
      setState({ status: 'missing', error: (error as Error).message });
      return undefined;
    }
  }, [ref]);
  useEffect(() => {
    setState({ status: 'idle' });
    if (now) void fetchIt();
  }, [ref, now, fetchIt]);
  return { ...state, fetch: fetchIt };
}

/** A picture in the chat, bounded; click for full size. */
function ImageAttachment({ file }: { file: Attachment }) {
  const { t } = useTexts();
  const blob = useBlob(file.ref, true);
  const [open, setOpen] = useState(false);
  if (blob.status === 'ready' && blob.url) {
    return (
      <>
        <button className="msg-image" title={t('file.image.title', { name: file.name, size: fileSize(file.size) })} onClick={() => setOpen(true)}>
          <img src={blob.url} alt={file.name} />
        </button>
        {open && createPortal(<Lightbox file={file} url={blob.url} onClose={() => setOpen(false)} />, document.body)}
      </>
    );
  }
  return (
    <div className={`file-card ${blob.status}`}>
      <Icon name="image" />
      <span className="file-name" title={file.name}>
        {file.name}
      </span>
      <span className="file-meta">{fileSize(file.size)}</span>
      <FetchState state={blob} />
    </div>
  );
}

/** What a card says about its bytes: fetching, not to be had right now (with a retry), or nothing while they are here or not asked for. */
function FetchState({ state }: { state: BlobState & { fetch(): Promise<unknown> } }) {
  const { t } = useTexts();
  if (state.status === 'fetching') return <span className="file-state">{t('file.fetching')}</span>;
  if (state.status === 'missing')
    return (
      <span className="file-state missing" title={state.error}>
        {t('file.unavailable')}
        <button className="link-btn" onClick={() => void state.fetch()}>
          {t('file.retry')}
        </button>
      </span>
    );
  return null;
}

/** A file in the chat: name, type and size, and a button to save it (which fetches it first). */
function FileAttachment({ file }: { file: Attachment }) {
  const { t } = useTexts();
  const blob = useBlob(file.ref, false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (await blob.fetch()) await saveBlob(file);
    } catch {
      // The state shows what went wrong (or the share sheet was dismissed).
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={`file-card ${blob.status}`}>
      <Icon name="file" />
      <span className="file-name" title={file.name}>
        {file.name}
      </span>
      <span className="file-meta">
        {fileSize(file.size)} · {file.type}
      </span>
      <FetchState state={blob} />
      <button className="file-save" title={t('file.save.file')} disabled={saving} onClick={() => void save()}>
        <Icon name="download" /> {t('button.save')}
      </button>
    </div>
  );
}

export function AttachmentView({ file }: { file: Attachment }) {
  return isImage(file.type) ? <ImageAttachment file={file} /> : <FileAttachment file={file} />;
}

/** The picture full size over a dimmed screen (in a portal: the chat's rows are transformed, which would pin it inside): Escape, a click outside or the button closes it; Save keeps the file. */
export function Lightbox({ file, url, onClose }: { file: Attachment; url: string; onClose(): void }) {
  const { t } = useTexts();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-label={file.name} onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="file-name" title={file.name}>
          {file.name}
        </span>
        <span className="file-meta">{fileSize(file.size)}</span>
        <button onClick={() => void saveBlob(file)} title={t('file.save.image')}>
          <Icon name="download" /> {t('button.save')}
        </button>
        <button onClick={onClose} title={t('file.close.esc')}>
          <Icon name="close" />
        </button>
      </div>
      <img src={url} alt={file.name} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/** The file waiting in the composer: its name and size, and a way to take it off before sending. */
export function AttachedChip({ file, uploading, onRemove }: { file: File; uploading: boolean; onRemove(): void }) {
  const { t } = useTexts();
  return (
    <div className={`attached${uploading ? ' uploading' : ''}`}>
      <Icon name={file.type.startsWith('image/') ? 'image' : 'file'} />
      <span className="file-name" title={file.name}>
        {file.name}
      </span>
      <span className="file-meta">{fileSize(file.size)}</span>
      {uploading ? (
        <span className="file-state">{t('file.uploading')}</span>
      ) : (
        <button onClick={onRemove} title={t('file.remove')}>
          ✕
        </button>
      )}
    </div>
  );
}

/** What a message without text is about, for previews: its file. */
export const fileLine = (file?: Attachment) => (file ? `📎 ${file.name}` : '');
