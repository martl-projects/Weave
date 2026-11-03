import { useState } from 'react';
import type { ImprintInfo } from '@weave/node/client';
import { TEXT_LIMITS } from '@weave/core/limits';
import { CharCount } from './editor.tsx';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Markdown, Modal } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * A person's imprint (Impressum) on their hub: who is behind it, as the law where they live asks them to say it. The
 * person keeps it themself; it's public like their profile. The hub shows a button for it once there is one; without
 * one, only the person themself sees the button, and behind it a hint with the editor.
 */

/** The Impressum button on a hub: for everyone once there is an imprint, for the person themself always. */
export function ImprintButton({ did, me, name }: { did: string; me: boolean; name: string }) {
  const { t } = useTexts();
  const imprint = useApi(() => api<ImprintInfo | null>('imprint', did), [did]);
  const [open, setOpen] = useState(false);
  if (imprint.data === undefined) return null;
  if (!imprint.data && !me) return null;
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Icon name="info" /> {t('hub.imprint')}
      </button>
      {open && <ImprintDialog imprint={imprint.data} me={me} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The imprint as it is; for the person themself with the editor behind "Create…" or "Edit…". */
function ImprintDialog({ imprint, me, name, onClose }: { imprint: ImprintInfo | null; me: boolean; name: string; onClose(): void }) {
  const { t } = useTexts();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(imprint?.text ?? '');
  const save = async () => {
    const saved = await attempt(() => api<ImprintInfo | null>('setImprint', { text }), t(text.trim() ? 'imprint.saved' : 'imprint.removed'));
    if (saved !== undefined) {
      bump();
      onClose();
    }
  };
  const remove = async () => {
    if (!(await ask(t('imprint.remove.ask'), t('button.remove')))) return;
    const removed = await attempt(() => api<ImprintInfo | null>('setImprint', { text: '' }), t('imprint.removed'));
    if (removed !== undefined) {
      bump();
      onClose();
    }
  };
  const title = me ? t('imprint.title.yours') : t('imprint.title.of', { name });
  if (me && (editing || !imprint)) {
    return (
      <Modal title={title} onClose={onClose}>
        {!imprint && <p className="small">{t('imprint.none.yours')}</p>}
        <p className="small">{t('imprint.public')}</p>
        <textarea className="wide" rows={10} autoFocus placeholder={t('imprint.placeholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <CharCount length={text.length} max={TEXT_LIMITS.imprint} onlyNear />
        <div className="buttons">
          <button onClick={onClose}>{t('button.cancel')}</button>
          {imprint && (
            <AsyncButton onClick={remove}>{t('button.remove')}</AsyncButton>
          )}
          <AsyncButton className="default" disabled={text.length > TEXT_LIMITS.imprint || (!imprint && !text.trim())} onClick={save}>
            {t(imprint ? 'button.save' : 'imprint.create')}
          </AsyncButton>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={title} onClose={onClose}>
      <article className="imprint">
        <Markdown text={imprint!.text} />
      </article>
      <p className="small">{t('imprint.updated', { time: ago(imprint!.time) })}</p>
      <div className="buttons">
        <button onClick={onClose}>{t('button.close')}</button>
        {me && (
          <button className="default" onClick={() => setEditing(true)}>
            {t('imprint.edit')}
          </button>
        )}
      </div>
    </Modal>
  );
}
