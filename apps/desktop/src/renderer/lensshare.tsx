import { useState } from 'react';
import QRCode from 'qrcode';
import type { BoardInfo, LensShareInfo, OnboardLinkInfo, SpaceInfo } from '@weave/node/client';
import { bridge } from './bridge.ts';
import { Icon } from './icons.tsx';
import { api, bump, navigate, useApi } from './lib.ts';
import { attempt, AsyncButton, Modal, toast } from './ui.tsx';
import { useTexts } from './texts.tsx';

/**
 * Take a board's lens along: a board of its own, shown through the same lens, in a group of yours or a new one, and a
 * link that brings people into that group (people who have no Weave yet, too). What is on this board stays here.
 * Opened from the board's head, or by the lens itself ({weave: 'share'}).
 */
export function LensShare({ space, board, meDid, onClose }: { space: SpaceInfo; board: BoardInfo; meDid: string; onClose(): void }) {
  const { t } = useTexts();
  const lens = board.lens?.name ?? board.title;
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const mine = (spaces ?? []).filter((s) => s.kind === 'group' && s.founder === meDid && !s.closed);
  const [picked, setPicked] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState(lens);
  const [made, setMade] = useState<{ share: LensShareInfo; link?: string; svg?: string; plain?: boolean }>();
  const fresh = picked === '';

  const share = async () => {
    const done = await attempt(() => api<LensShareInfo>('shareLens', { space: space.id, board: board.name, ...(fresh ? { name: name.trim() } : { group: picked }), title: title.trim() }));
    if (!done) return;
    bump();
    // A link for people who have no Weave yet (through Weave Web); if that cannot be made now, the group's own invite link.
    let link: string | undefined;
    let plain = false;
    try {
      const onboard = await api<OnboardLinkInfo>('createOnboardLink', { target: { kind: 'board', space: done.space.id, board: done.board }, ...(bridge.web ? { page: location.origin } : {}), also: [], friends: true, days: 30 });
      link = onboard.link;
    } catch {
      link = await attempt(() => api<string>('invite', done.space.id, 7 * 24, { access: [] }));
      plain = true;
    }
    const svg = link && !plain ? await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }) : undefined;
    setMade({ share: done, link, svg, plain });
  };

  if (made)
    return (
      <Modal title={t('lens.share.made.title')} subtitle={t('lens.share.made', { board: made.share.title, group: made.share.space.name })} onClose={onClose}>
        <div className="form">
          {made.link ? (
            <>
              <p className="muted">{t(made.plain ? 'lens.share.link.plain' : 'lens.share.link', { group: made.share.space.name })}</p>
              <div className="onboard-made">
                {made.svg && <span className="qr" dangerouslySetInnerHTML={{ __html: made.svg }} />}
                <input className="wide" readOnly value={made.link} onFocus={(e) => e.target.select()} />
              </div>
            </>
          ) : (
            <p className="muted">{t('lens.share.link.none', { group: made.share.space.name })}</p>
          )}
          <div className="buttons">
            <button
              onClick={() => {
                onClose();
                navigate(`#/g/${made.share.space.id}/b/${made.share.board}`);
              }}
            >
              {t('lens.share.open', { board: made.share.title })}
            </button>
            {made.link && (
              <button className="default" onClick={() => void navigator.clipboard.writeText(made.link!).then(() => toast(t('lens.share.copied')))}>
                <Icon name="copy" /> {t('button.copy')}
              </button>
            )}
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal title={t('lens.share.title', { name: lens })} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <p>{t('lens.share.what', { name: lens, board: board.title })}</p>
        <div className="field-row-stacked">
          <label htmlFor="ls-group">{t('lens.share.group')}</label>
          <select id="ls-group" value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">{t('lens.share.group.new')}</option>
            {mine.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {fresh && (
          <div className="field-row-stacked">
            <label htmlFor="ls-name">{t('lens.share.group.name')}</label>
            <input id="ls-name" maxLength={40} placeholder={t('lens.share.group.placeholder')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        )}
        <div className="field-row-stacked">
          <label htmlFor="ls-title">{t('lens.share.board')}</label>
          <input id="ls-title" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <p className="muted">{t('lens.share.then')}</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <AsyncButton className="default" disabled={fresh && !name.trim()} onClick={share}>
            {t('lens.share.go')}
          </AsyncButton>
        </div>
      </form>
    </Modal>
  );
}

/** The board's own button for it, next to the lens's other tools. */
export function LensShareButton({ space, board, meDid }: { space: SpaceInfo; board: BoardInfo; meDid: string }) {
  const { t } = useTexts();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title={t('lens.share.hint', { name: board.lens?.name ?? board.title })}>
        <Icon name="share" /> {t('lens.share.short')}
      </button>
      {open && <LensShare space={space} board={board} meDid={meDid} onClose={() => setOpen(false)} />}
    </>
  );
}
