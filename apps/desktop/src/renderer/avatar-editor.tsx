// Making your avatar (a turnable figure above, tabs of parts and colors below), and picking a scene for a post.

import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@weave/node/client';
import { api, bump, useApi } from './lib.ts';
import { avatarLib, forgetFigure, SceneImage, useScenes, type AvatarLib, type Figure } from './avatar.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';

interface Section {
  part: string;
  title: string;
  color?: string;
  colorTitle?: string;
  /** Eyes, brows and mouths show flat from their sprites; the rest as a head, or a bust (tops). */
  kind?: 'flat' | 'bust';
  /** Its fine adjustments (eye, brow, mouth, nose). */
  adjust?: string;
  names?: string[];
}

// zoom: how close the 3D figure comes for a tab (1: the face, 0: all of it); the wheel zooms too.
const TABS: Array<{ label: string; zoom: number; sections: Section[] }> = [
  { label: 'Head', zoom: 0.85, sections: [{ part: 'face', title: 'Shape', color: 'skin', colorTitle: 'Skin' }, { part: 'blush', title: 'Cheeks', names: ['plain', 'rosy'] }] },
  { label: 'Hair', zoom: 0.6, sections: [{ part: 'hair', title: 'Hair', color: 'hairColor', colorTitle: 'Color' }] },
  { label: 'Eyes', zoom: 1, sections: [{ part: 'eyes', title: 'Eyes', color: 'eyeColor', colorTitle: 'Color', kind: 'flat', adjust: 'eye' }, { part: 'brows', title: 'Brows', kind: 'flat', adjust: 'brow' }] },
  { label: 'Mouth', zoom: 1, sections: [{ part: 'nose', title: 'Nose', adjust: 'nose' }, { part: 'mouth', title: 'Mouth', kind: 'flat', adjust: 'mouth' }, { part: 'beard', title: 'Beard' }] },
  { label: 'Extras', zoom: 0.6, sections: [{ part: 'glasses', title: 'Glasses' }, { part: 'hat', title: 'Hat', color: 'propColor', colorTitle: 'Color' }] },
  { label: 'Outfit', zoom: 0, sections: [{ part: 'shirt', title: 'Top', color: 'shirtColor', colorTitle: 'Color', kind: 'bust' }] },
];

// Fine adjustments: one word and two buttons each, for those a part has.
const STEPS = [
  { k: 'Y', label: 'Height', less: '▲', more: '▼' },
  { k: 'Gap', label: 'Spacing', less: '▸◂', more: '◂▸' },
  { k: 'Size', label: 'Size', less: '−', more: '+' },
  { k: 'Rot', label: 'Turn', less: '↺', more: '↻' },
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
      setFailed("3D doesn't work here");
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
    viewer.current?.zoom(TABS[tab].zoom);
  }, [lib, !!figure]);
  const save = async (avatar: Figure | null) => {
    const saved = await attempt(() => api<Profile>('setProfile', { avatar }), avatar ? 'Your avatar is saved' : 'You show as your sprite again');
    if (saved) {
      forgetFigure(me.did);
      bump();
      onClose();
    }
  };
  const A = lib?.Avatar;
  return (
    <Modal title="Your avatar" onClose={onClose} wide>
      {failed ? (
        <p className="error-text">The avatar can't be drawn here: {failed}</p>
      ) : (
        <div className="avatar-editor">
          <div className="avatar-stage">
            {/* The renderer's own: it fills and empties it. */}
            <div className="avatar-canvas" ref={stage} />
            <button type="button" className="avatar-dice" title="Roll a new one" onClick={() => A && change(A.random())}>
              🎲
            </button>
          </div>
          <div className="avatar-parts">
            <menu role="tablist" className="avatar-tabs">
              {TABS.map((t, i) => (
                <li key={t.label} role="tab" aria-selected={i === tab}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setTab(i);
                      viewer.current?.zoom(t.zoom);
                    }}
                  >
                    {t.label}
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
                          <h4>{s.colorTitle}</h4>
                          <div className="avatar-colors">
                            {A.COLORS[s.color].map((c, i) => (
                              <button type="button" key={c} className={figure[s.color!] === i ? 'sel' : ''} style={{ background: c }} aria-label={`${s.colorTitle} ${i + 1}`} onClick={() => change({ ...figure, [s.color!]: i })} />
                            ))}
                          </div>
                        </>
                      )}
                      <h4>{s.title}</h4>
                      {s.adjust && (
                        <div className="avatar-adjust">
                          {STEPS.filter((st) => `${s.adjust}${st.k}` in A.ADJUST).map((st) => {
                            const k = `${s.adjust}${st.k}`;
                            return (
                              <span key={k} className="avatar-step">
                                {st.label}
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
                          const none = s.names?.[v] ?? (v === 0 && ['beard', 'glasses', 'hat'].includes(s.part) ? 'none' : undefined);
                          return (
                            <button type="button" key={v} className={figure[s.part] === v ? 'sel' : ''} title={name ?? none} onClick={() => figure[s.part] !== v && change({ ...figure, [s.part]: v })}>
                              {none && s.part !== 'blush' ? none : <Variant lib={lib} figure={{ ...figure, [s.part]: v }} section={s} sprites={sprites} />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                : 'Loading…'}
            </div>
          </div>
        </div>
      )}
      <div className="buttons">
        {me.avatar && <AsyncButton onClick={() => save(null)}>Use my sprite</AsyncButton>}
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
        <AsyncButton className="default" disabled={!figure} onClick={() => save(figure!)}>
          Save
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** A scene for a post: your avatar in a pose, with things around it. None is a choice too. */
export function ScenePicker({ value, onChange }: { value: string; onChange(scene: string): void }) {
  const scenes = useScenes();
  const { data: me } = useApi(() => api<{ did: string }>('whoami'), []);
  if (!scenes || !me) return null;
  return (
    <div className="field-row-stacked">
      <label>Scene (optional): your avatar on the post</label>
      <div className="scene-picker">
        <button type="button" className={value ? '' : 'sel'} onClick={() => onChange('')}>
          None
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
