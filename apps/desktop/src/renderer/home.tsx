import { useState, type ReactNode } from 'react';
import type { HomeSource, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump } from './lib.ts';
import { PostList, spaceLabel } from './posts.tsx';
import { useTexts } from './texts.tsx';
import { attempt, Modal } from './ui.tsx';

/*
 * Home: posts from your communities, your projects and people you follow,
 * filtered by source, without the communities and projects you hid from it.
 * Both choices are yours alone: the filter is remembered on this computer,
 * hiding is sealed to you and follows you to your other devices.
 */

/** The sources to show, in the picker's order; their texts are home.source.<value>, what's empty home.empty.<value>. */
const SOURCES: HomeSource[] = ['all', 'communities', 'projects', 'mine', 'friends', 'following'];

const KEY = 'weave.home.from';

function readSource(): HomeSource {
  try {
    const saved = localStorage.getItem(KEY);
    return SOURCES.some((s) => s === saved) ? (saved as HomeSource) : 'all';
  } catch {
    return 'all';
  }
}

/** Which communities and projects show on Home. */
function SourcesDialog({ spaces, onClose }: { spaces: SpaceInfo[]; onClose(): void }) {
  const { t } = useTexts();
  const list = spaces.filter((s) => (s.kind === 'community' || s.kind === 'project') && !s.closed);
  const toggle = (s: SpaceInfo, visible: boolean) => attempt(() => api('setHomeVisibility', { space: s.id, visible }).then(bump));
  return (
    <Modal title={t('home.follow')} onClose={onClose}>
      <p className="small">{t('home.follow.text')}</p>
      {(['community', 'project'] as const).map((kind) => {
        const ofKind = list.filter((s) => s.kind === kind);
        return (
          ofKind.length > 0 && (
            <fieldset key={kind}>
              <legend>{t(kind === 'community' ? 'tree.communities' : 'tree.projects')}</legend>
              {ofKind.map((s) => (
                <div className="field-row" key={s.id}>
                  <input type="checkbox" id={`home-${s.id}`} checked={!s.hiddenFromHome} onChange={(e) => toggle(s, e.target.checked)} />
                  <label htmlFor={`home-${s.id}`}>{spaceLabel(s)}</label>
                </div>
              ))}
            </fieldset>
          )
        );
      })}
      {list.length === 0 && <p>{t('home.follow.none')}</p>}
      <div className="buttons">
        <button className="default" onClick={onClose}>
          {t('button.done')}
        </button>
      </div>
    </Modal>
  );
}

/**
 * What Weave itself has to say, as a post pinned on top of Home rather than a banner over everything: nobody else can
 * bring a person's data back, said until a backup was saved and again when the last one is a month old.
 */
export function BackupPost({ due }: { due: 'never' | 'again' }) {
  const { t } = useTexts();
  return (
    <article className="post-row is-pinned weave-post">
      <span className="votes">
        <Icon name="mapPin" />
      </span>
      <a className="thumb weave-post-thumb" href="#/keys">
        <Icon name="lock" />
      </a>
      <div className="post-body">
        <a className="post-title" href="#/keys">
          {t(due === 'again' ? 'backup.post.title.again' : 'backup.post.title')}
        </a>
        <div className="post-meta">{t('backup.post.by')}</div>
        <p className="excerpt">{t(due === 'again' ? 'backup.due.again' : 'backup.due.never')}</p>
        <a className="post-link big" href="#/keys">
          <Icon name="lock" /> {t('backup.post.open')}
        </a>
      </div>
    </article>
  );
}

export function HomeFeed({ spaces, meDid, onSubmit, above }: { spaces: SpaceInfo[]; meDid: string; onSubmit(): void; above?: ReactNode }) {
  const { t } = useTexts();
  const [from, setFrom] = useState<HomeSource>(readSource);
  const [choosing, setChoosing] = useState(false);
  const hiddenCount = spaces.filter((s) => s.hiddenFromHome && !s.closed).length;
  const choose = (value: HomeSource) => {
    setFrom(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {}
  };
  return (
    <>
      <PostList
        title={<>{t('nav.home')}</>}
        query={{ from }}
        spaces={spaces}
        meDid={meDid}
        toolbar={
          <>
            <button onClick={onSubmit}>
              <Icon name="pencil" /> {t('tool.submit')}
            </button>
            <select value={from} onChange={(e) => choose(e.target.value as HomeSource)} aria-label={t('home.from')}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`home.source.${s}`)}
                </option>
              ))}
            </select>
            <button onClick={() => setChoosing(true)} title={t('home.sources.title')}>
              {hiddenCount ? t('home.sources.hidden', { n: hiddenCount }) : t('home.sources')}
            </button>
          </>
        }
        above={above}
        empty={<>{t(`home.empty.${from}`)}</>}
      />
      {choosing && <SourcesDialog spaces={spaces} onClose={() => setChoosing(false)} />}
    </>
  );
}
