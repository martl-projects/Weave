import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MessageInfo, WidgetReleaseInfo, WidgetViewInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { LensFrame } from './lens.tsx';
import { api, bridge, bump, useApi } from './lib.ts';
import { attempt, Modal } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * Group widgets (docs/group-widgets.md): a mini-app sent into a chat, one instance per message. In the chat it shows
 * in its bubble, compact, as its renderer (its site) in a sandboxed frame, talking the lens protocol (lens.tsx); a
 * click opens it large. Until you approved its release, nothing of it runs here: the bubble says what it is, from
 * where and by whom, with a button to approve and open it.
 */

/** The message its frame gets: the instance's state and actions, and which widget it is. */
const viewMessage = (v: WidgetViewInfo, meDid: string) => ({ weave: 'view', state: v.state ?? null, actions: v.actions ?? [], widget: { id: v.id, title: v.title }, me: { did: meDid } });

function WidgetFrame({ view, meDid, height }: { view: WidgetViewInfo; meDid: string; height: number | string }) {
  const { data: base } = useApi(async () => (view.site ? bridge.lensBase(view.view) : undefined), [view.view, view.site]);
  const message = useMemo(() => viewMessage(view, meDid), [view, meDid]);
  if (!view.site) return <pre className="sunken widget-state">{JSON.stringify(view.state, null, 2)}</pre>;
  if (!base) return <div className="widget-wait" style={{ height }} />;
  return <LensFrame title={view.title} release={view.view} base={base} view={message} act={(name, input) => api('widgetAction', { message: view.id, action: name, input })} className="widget-frame" style={{ height }} />;
}

/** A widget message's bubble: the approval card, or the widget itself (compact; large on click). */
export function WidgetMessage({ m, meDid }: { m: MessageInfo; meDid: string }) {
  const { t } = useTexts();
  const widget = m.widget!;
  const { data: view, error, reload } = useApi(() => api<WidgetViewInfo>('widgetView', { message: m.id }), [m.id]);
  const [large, setLarge] = useState(false);
  const approve = async () => {
    const approved = await attempt(() => api<WidgetViewInfo>('approveWidget', { message: m.id }));
    if (!approved) return;
    reload();
    bump();
    setLarge(true);
  };
  const withdraw = async () => {
    await attempt(() => api('approveWidget', { message: m.id, off: true }));
    setLarge(false);
    reload();
    bump();
  };
  const from = view && (view.app.projectName ? t('widget.from', { name: view.app.name, tag: view.app.tag, project: view.app.projectName }) : t('widget.from.elsewhere', { name: view.app.name, tag: view.app.tag }));
  const head = (
    <div className="widget-head">
      <Icon name="zap" />
      <b className="widget-title">{widget.title}</b>
      <span className="muted widget-app">{t('widget.app', { name: widget.name, tag: widget.app.tag })}</span>
      {view?.approved && !view.problem && (
        <button className="widget-open" title={t('widget.open.large')} onClick={() => setLarge(true)}>
          ⤢
        </button>
      )}
    </div>
  );

  if (error) return <div className="widget-card">{head}<p className="muted">{error}</p></div>;
  if (!view) return <div className="widget-card">{head}<div className="widget-wait" style={{ height: 40 }} /></div>;
  if (view.problem)
    return (
      <div className="widget-card">
        {head}
        <p className="muted">{t('widget.cant.run', { problem: view.problem })}</p>
      </div>
    );
  if (!view.approved)
    return (
      <div className="widget-card widget-ask">
        {head}
        <p>{from}</p>
        <p className="muted">{t('widget.sent.by', { name: view.by.name ?? t('word.someone') })}</p>
        {!view.checked && <p className="muted">{t('widget.unchecked')}</p>}
        <p className="muted">{t('widget.approve.why')}</p>
        <button onClick={() => void approve()}>{t('widget.approve.open')}</button>
      </div>
    );
  return (
    <div className="widget-card">
      {head}
      <WidgetFrame view={view} meDid={meDid} height={view.height} />
      {/* Over the whole window: a chat's rows are moved by transforms, which would hold a fixed window inside them. */}
      {large &&
        createPortal(
        <Modal title={view.title} onClose={() => setLarge(false)} wide>
          <WidgetFrame view={view} meDid={meDid} height="min(70vh, 720px)" />
          <div className="widget-foot">
            <span className="muted">{from}</span>
            <button onClick={() => void withdraw()}>{t('widget.approve.off')}</button>
          </div>
        </Modal>,
          document.body,
        )}
    </div>
  );
}

/** The mini-apps you can send here: the widget releases of the projects you're in. */
export function WidgetPicker({ onPick, onClose }: { onPick(release: WidgetReleaseInfo): void; onClose(): void }) {
  const { t } = useTexts();
  const { data: releases, error } = useApi(() => api<WidgetReleaseInfo[]>('widgetReleases'), []);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  return (
    <div className="widget-picker window" ref={ref} role="menu" aria-label={t('widget.picker.title')}>
      <div className="widget-picker-title">{t('widget.picker.title')}</div>
      {error && <p className="muted">{error}</p>}
      {releases && releases.length === 0 && <p className="muted">{t('widget.picker.none')}</p>}
      {releases?.map((r) => (
        <button key={r.release} role="menuitem" className="widget-pick" onClick={() => onPick(r)}>
          <Icon name="zap" />
          <span>
            <b>{r.name}</b> <span className="muted">{t('widget.app.tag', { tag: r.tag })}</span>
            <br />
            <span className="muted">{r.about ?? t('widget.picker.from', { project: r.project.name })}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Send a mini-app into a chat: a channel of a space, or a post's chat. */
export async function sendWidget(where: { space?: string; channel?: string; post?: string }, release: WidgetReleaseInfo): Promise<void> {
  if (await attempt(() => api('sendWidget', { ...where, project: release.project.id, tag: release.tag }))) bump();
}
