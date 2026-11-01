// Making your avatar (a turnable figure above, tabs of parts and colors below), and picking a scene for a post.

import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@weave/node/client';
import { api, bump, useApi } from './lib.ts';
import { avatarLib, forgetFigure, SceneImage, useScenes, type AvatarLib, type Figure } from './avatar.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { useTexts } from './texts.tsx';

interface Section {
  part: string;
  /** Its heading's text: avatar.part.<heading>. */
  heading: string;
  color?: string;
  /** Its color heading's text: avatar.color.<colorHeading>. */
  colorHeading?: string;
  /** Eyes, brows and mouths show flat from their sprites; the rest as a head, or a bust (tops). */
  kind?: 'flat' | 'bust';
  /** Its fine adjustments (eye, brow, mouth, nose). */
  adjust?: string;
  names?: string[];
}

/** The tabs, each with its sections; a tab's text is avatar.tab.<id>. */
const TABS: Array<{ id: string; sections: Section[] }> = [
  { id: 'head', sections: [{ part: 'face', heading: 'shape', color: 'skin', colorHeading: 'skin' }, { part: 'blush', heading: 'cheeks', names: ['plain', 'rosy'] }] },
  { id: 'hair', sections: [{ part: 'hair', heading: 'hair', color: 'hairColor', colorHeading: 'color' }] },
  { id: 'eyes', sections: [{ part: 'eyes', heading: 'eyes', color: 'eyeColor', colorHeading: 'color', kind: 'flat', adjust: 'eye' }, { part: 'brows', heading: 'brows', kind: 'flat', adjust: 'brow' }] },
  { id: 'mouth', sections: [{ part: 'nose', heading: 'nose', adjust: 'nose' }, { part: 'mouth', heading: 'mouth', kind: 'flat', adjust: 'mouth' }, { part: 'beard', heading: 'beard' }] },
  { id: 'extras', sections: [{ part: 'glasses', heading: 'glasses' }, { part: 'hat', heading: 'hat', color: 'propColor', colorHeading: 'color' }] },
  { id: 'outfit', sections: [{ part: 'shirt', heading: 'top', color: 'shirtColor', colorHeading: 'color', kind: 'bust' }] },
];

// Fine adjustments: one word (avatar.step.<id>) and two buttons each, for those a part has.
const STEPS = [
  { k: 'Y', id: 'height', less: '▲', more: '▼' },
  { k: 'Gap', id: 'spacing', less: '▸◂', more: '◂▸' },
  { k: 'Size', id: 'size', less: '−', more: '+' },
  { k: 'Rot', id: 'turn', less: '↺', more: '↻' },
];

/** A variant's picture: flat from the sprites, or the figure drawn with it. */
function Variant({ lib, figure, section, sprites }: { lib: AvatarLib; figure: Figure; section: Section; sprites: boolean }) {
  const [url, setUrl] = useState<string>();
  const key = JSON.stringify(figure);
  useEffect(() => {
    let live = true;
    if (section.kind === 'flat' && sprites) setUrl(lib.thumb(section.part, figure));
    // Hair and hats need the whole head; the rest is seen best close to the face.
    else void lib.snapshot(figure, section.kind === 'bust' ? 'bust' : section.part === 'hair' || section.part === 'hat' ? 'head' : 'face').then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key, sprites]);
  return url ? <img src={url} alt="" draggable={false} /> : null;
}

/** Your avatar: everyone sees it wherever you show up, and in the scenes on your posts. */
export function AvatarEditor({ me, onClose }: { me: Profile; onClose(): void }) {
  const { t } = useTexts();
  const [lib, setLib] = useState<AvatarLib>();
  const [failed, setFailed] = useState<string>();
  const [figure, setFigure] = useState<Figure>();
  const [tab, setTab] = useState(0);
  const [sprites, setSprites] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<AvatarLib['mountViewer']> | undefined>(undefined);
  useEffect(() => {
    avatarLib().then(
      (l) => {
        setLib(l);
        setFigure(l.Avatar.clean(me.avatar ?? l.Avatar.fromSeed(me.did)));
        void l.loadFaceSprites().then(() => setSprites(true), () => {});
      },
      (e: Error) => setFailed(e.message),
    );
  }, []);
  useEffect(() => {
    if (!lib || !stage.current || viewer.current) return;
    try {
      viewer.current = lib.mountViewer(stage.current);
    } catch {
      setFailed(t('avatar.no.3d'));
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = undefined;
    };
  }, [lib]);
  const change = (next: Figure, bounce = true) => {
    const clean = lib!.Avatar.clean(next);
    setFigure(clean);
    viewer.current?.set(clean, bounce);
  };
  useEffect(() => {
    if (figure) viewer.current?.set(figure);
  }, [lib, !!figure]);
  const save = async (avatar: Figure | null) => {
    const saved = await attempt(() => api<Profile>('setProfile', { avatar }), t(avatar ? 'avatar.saved' : 'avatar.sprite.again'));
    if (saved) {
      forgetFigure(me.did);
      bump();
      onClose();
    }
  };
  const A = lib?.Avatar;
  return (
    <Modal title={t('avatar.title')} onClose={onClose} wide>
      {failed ? (
        <p className="error-text">{t('avatar.cant.draw', { why: failed })}</p>
      ) : (
        <div className="avatar-editor">
          <div className="avatar-stage">
            {/* The renderer's own: it fills and empties it. */}
            <div className="avatar-canvas" ref={stage} />
            <button type="button" className="avatar-dice" title={t('avatar.roll')} onClick={() => A && change(A.random())}>
              🎲
            </button>
          </div>
          <div className="avatar-parts">
            <menu role="tablist" className="avatar-tabs">
              {TABS.map((tabDef, i) => (
                <li key={tabDef.id} role="tab" aria-selected={i === tab}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setTab(i);
                    }}
                  >
                    {t(`avatar.tab.${tabDef.id}`)}
                  </a>
                </li>
              ))}
            </menu>
            <div className="window avatar-panel" role="tabpanel">
              {A && figure && lib
                ? TABS[tab].sections.map((s) => (
                    <section key={s.part}>
                      {s.color && (
                        <>
                          <h4>{t(`avatar.color.${s.colorHeading}`)}</h4>
                          <div className="avatar-colors">
                            {A.COLORS[s.color].map((c, i) => (
                              <button type="button" key={c} className={figure[s.color!] === i ? 'sel' : ''} style={{ background: c }} aria-label={`${t(`avatar.color.${s.colorHeading}`)} ${i + 1}`} onClick={() => change({ ...figure, [s.color!]: i })} />
                            ))}
                          </div>
                        </>
                      )}
                      <h4>{t(`avatar.part.${s.heading}`)}</h4>
                      {s.adjust && (
                        <div className="avatar-adjust">
                          {STEPS.filter((st) => `${s.adjust}${st.k}` in A.ADJUST).map((st) => {
                            const k = `${s.adjust}${st.k}`;
                            return (
                              <span key={k} className="avatar-step">
                                {t(`avatar.step.${st.id}`)}
                                <button type="button" disabled={figure[k] <= 0} onClick={() => change({ ...figure, [k]: figure[k] - 1 }, false)}>
                                  {st.less}
                                </button>
                                <button type="button" disabled={figure[k] >= A.ADJUST[k] - 1} onClick={() => change({ ...figure, [k]: figure[k] + 1 }, false)}>
                                  {st.more}
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="avatar-grid">
                        {Array.from({ length: A.PARTS[s.part] }, (_, v) => {
                          const name = s.kind === 'flat' && sprites ? lib.partNames(s.part)[v] : undefined;
                          const noneKey = s.names?.[v] ?? (v === 0 && ['beard', 'glasses', 'hat'].includes(s.part) ? 'none' : undefined);
                          const none = noneKey ? t(`avatar.variant.${noneKey}`) : undefined;
                          return (
                            <button type="button" key={v} className={figure[s.part] === v ? 'sel' : ''} title={name ?? none} onClick={() => figure[s.part] !== v && change({ ...figure, [s.part]: v })}>
                              {none && s.part !== 'blush' ? none : <Variant lib={lib} figure={{ ...figure, [s.part]: v }} section={s} sprites={sprites} />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                : t('loading')}
            </div>
          </div>
        </div>
      )}
      <div className="buttons">
        {me.avatar && <AsyncButton onClick={() => save(null)}>{t('avatar.use.sprite')}</AsyncButton>}
        <span className="grow" />
        <button onClick={onClose}>{t('button.cancel')}</button>
        <AsyncButton className="default" disabled={!figure} onClick={() => save(figure!)}>
          {t('button.save')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** A scene for a post: your avatar in a pose, with things around it. None is a choice too. */
export function ScenePicker({ value, onChange }: { value: string; onChange(scene: string): void }) {
  const { t } = useTexts();
  const scenes = useScenes();
  const { data: me } = useApi(() => api<{ did: string }>('whoami'), []);
  if (!scenes || !me) return null;
  return (
    <div className="field-row-stacked">
      <label>{t('scene.label')}</label>
      <div className="scene-picker">
        <button type="button" className={value ? '' : 'sel'} onClick={() => onChange('')}>
          {t('scene.none')}
        </button>
        {scenes.map((s) => (
          <button type="button" key={s.id} className={value === s.id ? 'sel' : ''} title={s.label} onClick={() => onChange(s.id)}>
            <SceneImage did={me.did} scene={s.id} size={128} close />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
