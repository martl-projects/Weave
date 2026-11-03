// Making your avatar (a turnable figure above, tabs of parts and colors below), and picking a scene for a post.

import { useEffect, useRef, useState } from 'react';
import type { MemberInfo, Profile, SessionInfo, SpaceInfo } from '@weave/node/client';
import { api, bump, shortDid, useApi, useBlobUrl } from './lib.ts';
import { agentDefault, avatarLib, forgetFigure, GroupPhoto, pickedScene, SceneImage, sessionSeed, useGroupPoses, useScenes, type AvatarLib, type Figure } from './avatar.tsx';
import { ImagePicker } from './editor.tsx';
import { attempt, AsyncButton, Avatar, BlobImage, Modal, Sprite } from './ui.tsx';
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

// zoom: how close the 3D figure comes for a tab (1: the face, 0: all of it); the wheel zooms too. A tab's text is avatar.tab.<id>.
type Tab = { id: string; zoom: number; sections: Section[] };
const PERSON_TABS: Tab[] = [
  { id: 'head', zoom: 0.85, sections: [{ part: 'face', heading: 'shape', color: 'skin', colorHeading: 'skin' }, { part: 'blush', heading: 'cheeks', names: ['plain', 'rosy'] }] },
  { id: 'hair', zoom: 0.6, sections: [{ part: 'hair', heading: 'hair', color: 'hairColor', colorHeading: 'color' }] },
  { id: 'eyes', zoom: 1, sections: [{ part: 'eyes', heading: 'eyes', color: 'eyeColor', colorHeading: 'color', kind: 'flat', adjust: 'eye' }, { part: 'brows', heading: 'brows', kind: 'flat', adjust: 'brow' }] },
  { id: 'mouth', zoom: 1, sections: [{ part: 'nose', heading: 'nose', adjust: 'nose' }, { part: 'mouth', heading: 'mouth', kind: 'flat', adjust: 'mouth' }, { part: 'beard', heading: 'beard' }] },
  { id: 'extras', zoom: 0.6, sections: [{ part: 'glasses', heading: 'glasses' }, { part: 'hat', heading: 'hat', color: 'propColor', colorHeading: 'color' }] },
  { id: 'outfit', zoom: 0, sections: [{ part: 'shirt', heading: 'top', color: 'shirtColor', colorHeading: 'color', kind: 'bust' }] },
];

// Fine adjustments: one word (avatar.step.<id>) and two buttons each, for those a part has.
const STEPS = [
  { k: 'Y', id: 'height', less: '▲', more: '▼' },
  { k: 'Gap', id: 'spacing', less: '▸◂', more: '◂▸' },
  { k: 'Size', id: 'size', less: '−', more: '+' },
  { k: 'Rot', id: 'turn', less: '↺', more: '↻' },
];

// A robot with a screen for a face (agents, sessions): its screen (light, or dark with the face glowing in its colour) and
// body colours, then the same eyes and mouths as people's.
const SCREEN_TABS: Tab[] = [
  { id: 'screen', zoom: 0.7, sections: [{ part: 'glow', heading: 'glow', names: ['light', 'glowing'] }, { part: '', heading: '', color: 'screenColor', colorHeading: 'color' }, { part: '', heading: '', color: 'frameColor', colorHeading: 'frame' }] },
  PERSON_TABS[2],
  { id: 'mouth', zoom: 1, sections: [{ part: 'mouth', heading: 'mouth', kind: 'flat', adjust: 'mouth' }] },
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
  return (
    <FigureEditor
      title={t('avatar.title')}
      initial={(l) => me.avatar ?? l.Avatar.fromSeed(me.did)}
      reset={me.avatar ? t('avatar.use.default') : undefined}
      onSave={async (avatar) => {
        const saved = await attempt(() => api<Profile>('setProfile', { avatar }), t(avatar ? 'avatar.saved' : 'avatar.default.again'));
        if (saved) forgetFigure(me.did);
        return !!saved;
      }}
      onClose={onClose}
    />
  );
}

/** One of your agents' avatars: a screen for a head on your body, so everyone sees at once that it's an agent. */
export function AgentAvatarEditor({ me, agent, onClose }: { me: Profile; agent: string; onClose(): void }) {
  const { t } = useTexts();
  const own = me.agentAvatars?.[agent];
  return (
    <FigureEditor
      title={t('avatar.agent.title', { agent })}
      screen
      initial={(l) => own ?? agentDefault(l, me.avatar ?? null, me.did, `${me.did}·${agent}`)}
      reset={own ? t('avatar.use.its.default') : undefined}
      onSave={async (avatar) => {
        const saved = await attempt(() => api<Profile>('setProfile', { agentAvatars: { [agent]: avatar } }), t(avatar ? 'avatar.agent.saved' : 'avatar.agent.default.again', { agent }));
        if (saved) forgetFigure(`${me.did}·${agent}`);
        return !!saved;
      }}
      onClose={onClose}
    />
  );
}

/** A session's avatar, so you know it again (here and in the overlay); only you see it. */
export function SessionAvatarEditor({ session, me, onClose }: { session: SessionInfo; me: Profile; onClose(): void }) {
  const { t } = useTexts();
  return (
    <FigureEditor
      title={t('avatar.session.title', { session: session.name ?? session.title ?? t('avatar.this.session') })}
      screen
      initial={(l) => session.avatar ?? agentDefault(l, me.avatar ?? null, me.did, sessionSeed(session))}
      reset={session.avatar ? t('avatar.use.its.default') : undefined}
      onSave={async (avatar) => !!(await attempt(() => api('setSessionAvatar', { session: { provider: session.provider, id: session.id }, avatar }).then(bump), t(avatar ? 'avatar.session.saved' : 'avatar.session.default.again')))}
      onClose={onClose}
    />
  );
}

/** Making a figure: a person's (head and hair) or a robot's (agents, sessions). */
function FigureEditor({ title, screen = false, initial, reset, onSave, onClose }: { title: string; screen?: boolean; initial(l: AvatarLib): Figure; reset?: string; onSave(avatar: Figure | null): Promise<boolean>; onClose(): void }) {
  const { t } = useTexts();
  const TABS = screen ? SCREEN_TABS : PERSON_TABS;
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
        setFigure(l.Avatar.clean(initial(l)));
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
    viewer.current?.zoom(TABS[tab].zoom);
  }, [lib, !!figure]);
  const save = async (avatar: Figure | null) => {
    if (await onSave(avatar)) {
      bump();
      onClose();
    }
  };
  const A = lib?.Avatar;
  return (
    <Modal title={title} onClose={onClose} wide>
      {failed ? (
        <p className="error-text">{t('avatar.cant.draw', { why: failed })}</p>
      ) : (
        <div className="avatar-editor">
          <div className="avatar-stage">
            {/* The renderer's own: it fills and empties it. */}
            <div className="avatar-canvas" ref={stage} />
            <button type="button" className="avatar-dice" title={t('avatar.roll')} onClick={() => A && change(screen ? { ...A.random(), head: 1 } : A.random())}>
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
                      viewer.current?.zoom(tabDef.zoom);
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
                    <section key={s.part || s.color}>
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
                      {s.part && <h4>{t(`avatar.part.${s.heading}`)}</h4>}
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
                      {s.part && (
                        <div className="avatar-grid">
                          {Array.from({ length: A.PARTS[s.part] }, (_, v) => {
                            const name = s.kind === 'flat' && sprites ? lib.partNames(s.part)[v] : undefined;
                            const noneKey = s.names?.[v] ?? (v === 0 && ['beard', 'glasses', 'hat'].includes(s.part) ? 'none' : undefined);
                            const none = noneKey ? t(`avatar.variant.${noneKey}`) : undefined;
                            return (
                              <button type="button" key={v} className={figure[s.part] === v ? 'sel' : ''} title={name ?? none} onClick={() => figure[s.part] !== v && change({ ...figure, [s.part]: v })}>
                                {none && s.part !== 'blush' && s.part !== 'glow' ? none : <Variant lib={lib} figure={{ ...figure, [s.part]: v }} section={s} sprites={sprites} />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))
                : t('loading')}
            </div>
          </div>
        </div>
      )}
      <div className="buttons">
        {reset && <AsyncButton onClick={() => save(null)}>{reset}</AsyncButton>}
        <span className="grow" />
        <button onClick={onClose}>{t('button.cancel')}</button>
        <AsyncButton className="default" disabled={!figure} onClick={() => save(figure!)}>
          {t('button.save')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/**
 * A post's picture: your avatar in a scene (the default: one you pick, or "Surprise me", picked by the post), an image
 * of your own, or none. image and scene as the post keeps them: an image wins; scene "none" is no picture.
 */
export function PicturePicker({ image, scene, onImage, onScene, imageAllowed = true, postId }: { image: string; scene: string; onImage(ref: string): void; onScene(scene: string): void; imageAllowed?: boolean; postId?: string }) {
  const { t } = useTexts();
  const mode = image ? 'image' : scene === 'none' ? 'none' : 'avatar';
  const choose = (next: 'avatar' | 'image' | 'none') => {
    if (next !== 'image') onImage('');
    onScene(next === 'none' ? 'none' : next === 'avatar' && scene === 'none' ? '' : scene);
  };
  const [wantsImage, setWantsImage] = useState(false);
  const shown = wantsImage && mode !== 'image' ? 'image' : mode;
  return (
    <div className="field-row-stacked">
      <label>{t('picture.label')}</label>
      <div className="field-row">
        <input id="picture-avatar" type="radio" name="picture" checked={shown === 'avatar'} onChange={() => { setWantsImage(false); choose('avatar'); }} />
        <label htmlFor="picture-avatar">{t('picture.avatar')}</label>
        {imageAllowed && (
          <>
            <input id="picture-image" type="radio" name="picture" checked={shown === 'image'} onChange={() => setWantsImage(true)} />
            <label htmlFor="picture-image">{t('picture.image')}</label>
          </>
        )}
        <input id="picture-none" type="radio" name="picture" checked={shown === 'none'} onChange={() => { setWantsImage(false); choose('none'); }} />
        <label htmlFor="picture-none">{t('picture.none')}</label>
      </div>
      {shown === 'avatar' && <ScenePicker value={scene === 'none' ? '' : scene} onChange={onScene} postId={postId} />}
      {shown === 'image' && imageAllowed && <ImagePicker value={image} onChange={(ref) => { onImage(ref); if (ref) onScene(''); }} label={t('field.image.pick')} wide />}
    </div>
  );
}

/** A scene for a post: your avatar in a pose, with things around it; or "Surprise me" (picked by the post itself). */
export function ScenePicker({ value, onChange, postId }: { value: string; onChange(scene: string): void; postId?: string }) {
  const { t } = useTexts();
  const scenes = useScenes();
  const { data: me } = useApi(() => api<{ did: string }>('whoami'), []);
  if (!scenes || !me) return null;
  return (
    <div className="field-row-stacked">
      <div className="scene-picker">
        <button type="button" className={value ? '' : 'sel'} title={t('scene.surprise.title')} onClick={() => onChange('')}>
          {postId ? <SceneImage did={me.did} scene={pickedScene(postId)} size={128} close /> : <span className="surprise">?</span>}
          <span>{t('scene.surprise')}</span>
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

/** People in the order its photo puts them: those it names first (who are still here), then the rest as given. */
export function inPhotoOrder(space: SpaceInfo, dids: string[]): string[] {
  const named: string[] = (space.photoOrder ?? []).filter((d) => dids.includes(d));
  return [...named, ...dids.filter((d) => !named.includes(d))];
}

/** A space's photo: its own picture with its banner's text over it, or everyone's avatars holding the banner (in front of its background). */
export function SpacePhoto({ space, dids }: { space: SpaceInfo; dids: string[] }) {
  const { t } = useTexts();
  const banner = space.bannerText ?? space.name;
  const background = useBlobUrl(space.background);
  if (!space.photo)
    return dids.length ? (
      <div className={`space-photo-group${background ? ' has-background' : ''}`} style={background ? { backgroundImage: `url("${background}")` } : undefined}>
        <GroupPhoto dids={inPhotoOrder(space, dids)} banner={banner} poses={space.photoPoses} />
      </div>
    ) : null;
  return (
    <figure className="space-photo">
      <BlobImage src={space.photo} alt={t('photo.alt', { space: space.name })} />
      <figcaption>{banner}</figcaption>
    </figure>
  );
}

/** Settings: the space's photo (everyone's avatars, or a picture of its own) and the text on its banner. */
export function SpacePhotoSettings({ space, members, canSet }: { space: SpaceInfo; members: MemberInfo[]; canSet: boolean }) {
  const { t } = useTexts();
  const dids = members.map((m) => m.did);
  // As the photo has it (members may still be loading), until someone moves someone.
  const [moved, setOrder] = useState<string[]>();
  const order = moved ?? inPhotoOrder(space, dids);
  const name = (did: string) => members.find((m) => m.did === did)?.name ?? shortDid(did);
  const [poses, setPoses] = useState<Record<string, string>>(space.photoPoses ?? {});
  const choices = useGroupPoses();
  const move = (i: number, by: number) => { const next = [...order]; [next[i], next[i + by]] = [next[i + by], next[i]]; setOrder(next); };
  const [own, setOwn] = useState(!!space.photo);
  const [photo, setPhoto] = useState(space.photo ?? '');
  const [banner, setBanner] = useState(space.bannerText ?? '');
  const [background, setBackground] = useState(space.background ?? '');
  const [onBanner, setOnBanner] = useState(!!space.membersOnBanner);
  const [inList, setInList] = useState(!!space.photoInList);
  const changed = (own ? photo : '') !== (space.photo ?? '') || banner.trim() !== (space.bannerText ?? '') || background !== (space.background ?? '') || onBanner !== !!space.membersOnBanner || inList !== !!space.photoInList || JSON.stringify(poses) !== JSON.stringify(space.photoPoses ?? {}) || order.join() !== inPhotoOrder(space, dids).join();
  const preview: SpaceInfo = { ...space, photo: own && photo ? photo : undefined, bannerText: banner.trim() || undefined, background: background || undefined, photoOrder: order as SpaceInfo["photoOrder"], photoPoses: poses as SpaceInfo['photoPoses'] };
  return (
    <fieldset>
      <legend>{t('photo.legend')}</legend>
      <div className="space-photo-settings">
        <div className="space-photo-preview">
          <SpacePhoto space={preview} dids={dids} />
        </div>
        <div className="grow">
          <div className="field-row">
            <input id={`photo-group-${space.id}`} type="radio" name={`photo-${space.id}`} checked={!own} disabled={!canSet} onChange={() => setOwn(false)} />
            <label htmlFor={`photo-group-${space.id}`}>{t('photo.group')}</label>
          </div>
          <div className="field-row">
            <input id={`photo-own-${space.id}`} type="radio" name={`photo-${space.id}`} checked={own} disabled={!canSet} onChange={() => setOwn(true)} />
            <label htmlFor={`photo-own-${space.id}`}>{t('photo.own')}</label>
          </div>
          {own && canSet && <ImagePicker value={photo} onChange={setPhoto} label={t('photo.legend')} wide />}
          {!own && canSet && (
            <div className="field-row-stacked">
              <label>{t(space.kind === 'project' ? 'photo.background.project' : 'photo.background')}</label>
              <ImagePicker value={background} onChange={setBackground} label={t('photo.background.pick')} wide />
            </div>
          )}
          <div className="field-row-stacked">
            <label htmlFor={`photo-banner-${space.id}`}>{t('photo.on.banner')}</label>
            <input id={`photo-banner-${space.id}`} value={banner} maxLength={40} placeholder={space.name} disabled={!canSet} onChange={(e) => setBanner(e.target.value)} />
          </div>
          {!own && order.length > 0 && (
            <div className="field-row-stacked">
              <label>{t('photo.who.where')}</label>
              <ol className="photo-order">
                {order.slice(0, 12).map((did, i) => (
                  <li key={did}>
                    <Avatar did={did} size={20} /> <span className="grow">{name(did)}</span>
                    <select
                      aria-label={t('photo.how.poses', { name: name(did) })}
                      value={poses[did] ?? ''}
                      disabled={!canSet || !choices}
                      onChange={(e) => setPoses((p) => { const next = { ...p }; if (e.target.value) next[did] = e.target.value; else delete next[did]; return next; })}
                    >
                      <option value="">{t('photo.any.pose')}</option>
                      <optgroup label={t('photo.poses')}>
                        {choices?.filter((c) => !c.scene).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </optgroup>
                      <optgroup label={t('photo.scenes')}>
                        {choices?.filter((c) => c.scene).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </optgroup>
                    </select>
                    <button type="button" disabled={!canSet || i === 0} title={t('photo.forward')} onClick={() => move(i, -1)}>▲</button>
                    <button type="button" disabled={!canSet || i === order.length - 1} title={t('photo.back')} onClick={() => move(i, 1)}>▼</button>
                  </li>
                ))}
              </ol>
              {order.length > 12 && <span className="small muted">{t('photo.first.twelve')}</span>}
            </div>
          )}
          <div className="field-row">
            <input id={`photo-list-${space.id}`} type="checkbox" checked={inList} disabled={!canSet} onChange={(e) => setInList(e.target.checked)} />
            <label htmlFor={`photo-list-${space.id}`}>{t('photo.in.list')}</label>
          </div>
          {space.kind === 'project' && (
            <div className="field-row">
              <input id={`photo-hero-${space.id}`} type="checkbox" checked={onBanner} disabled={!canSet} onChange={(e) => setOnBanner(e.target.checked)} />
              <label htmlFor={`photo-hero-${space.id}`}>{t('photo.on.hero')}</label>
            </div>
          )}
          {canSet ? (
            <div className="buttons">
              <AsyncButton
                className="default"
                disabled={!changed || (own && !photo)}
                onClick={() => attempt(() => api('setSpacePhoto', { space: space.id, photo: own ? photo : '', banner: banner.trim(), background, ...(space.kind === 'project' ? { members: onBanner } : {}), order, poses, list: inList }).then(bump), t('photo.saved'))}
              >
                {t('photo.save')}
              </AsyncButton>
            </div>
          ) : (
            <p className="small muted">{t('photo.who.runs', { space: space.name })}</p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * A group's little icon: its own photo, or its people's faces (two of them overlapping; one alone), as its members
 * list them; until they're known, its sprite.
 */
export function GroupIcon({ space, size = 16 }: { space: SpaceInfo; size?: number }) {
  const { data: members } = useApi(() => api<MemberInfo[]>('members', space.id).catch(() => [] as MemberInfo[]), [space.id]);
  if (space.photo)
    return (
      <span className="group-icon" style={{ width: size, height: size }}>
        <BlobImage src={space.photo} alt="" />
      </span>
    );
  const faces = (members ?? []).map((m) => m.did).slice(0, 2);
  if (!faces.length) return <Sprite seed={space.id} size={size} />;
  if (faces.length === 1) return <Avatar did={faces[0]} size={size} />;
  const small = Math.round(size * 0.75);
  return (
    <span className="group-icon faces" style={{ width: size, height: size }}>
      <Avatar did={faces[1]} size={small} />
      <Avatar did={faces[0]} size={small} />
    </span>
  );
}
