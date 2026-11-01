// Making your avatar (a turnable figure above, tabs of parts and colors below), and picking a scene for a post.

import { useEffect, useRef, useState } from 'react';
import type { MemberInfo, Profile, SpaceInfo } from '@weave/node/client';
import { api, bump, shortDid, useApi, useBlobUrl } from './lib.ts';
import { avatarLib, forgetFigure, GroupPhoto, pickedScene, SceneImage, useGroupPoses, useScenes, type AvatarLib, type Figure } from './avatar.tsx';
import { ImagePicker } from './editor.tsx';
import { attempt, AsyncButton, Avatar, BlobImage, Modal } from './ui.tsx';

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
    const saved = await attempt(() => api<Profile>('setProfile', { avatar }), avatar ? 'Your avatar is saved' : 'You show as the figure your key makes again');
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
        {me.avatar && <AsyncButton onClick={() => save(null)}>Use my default figure</AsyncButton>}
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
        <AsyncButton className="default" disabled={!figure} onClick={() => save(figure!)}>
          Save
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
  const mode = image ? 'image' : scene === 'none' ? 'none' : 'avatar';
  const choose = (next: 'avatar' | 'image' | 'none') => {
    if (next !== 'image') onImage('');
    onScene(next === 'none' ? 'none' : next === 'avatar' && scene === 'none' ? '' : scene);
  };
  const [wantsImage, setWantsImage] = useState(false);
  const shown = wantsImage && mode !== 'image' ? 'image' : mode;
  return (
    <div className="field-row-stacked">
      <label>Picture</label>
      <div className="field-row">
        <input id="picture-avatar" type="radio" name="picture" checked={shown === 'avatar'} onChange={() => { setWantsImage(false); choose('avatar'); }} />
        <label htmlFor="picture-avatar">Your avatar</label>
        {imageAllowed && (
          <>
            <input id="picture-image" type="radio" name="picture" checked={shown === 'image'} onChange={() => setWantsImage(true)} />
            <label htmlFor="picture-image">An image</label>
          </>
        )}
        <input id="picture-none" type="radio" name="picture" checked={shown === 'none'} onChange={() => { setWantsImage(false); choose('none'); }} />
        <label htmlFor="picture-none">No picture</label>
      </div>
      {shown === 'avatar' && <ScenePicker value={scene === 'none' ? '' : scene} onChange={onScene} postId={postId} />}
      {shown === 'image' && imageAllowed && <ImagePicker value={image} onChange={(ref) => { onImage(ref); if (ref) onScene(''); }} label="Image" wide />}
    </div>
  );
}

/** A scene for a post: your avatar in a pose, with things around it; or "Surprise me" (picked by the post itself). */
export function ScenePicker({ value, onChange, postId }: { value: string; onChange(scene: string): void; postId?: string }) {
  const scenes = useScenes();
  const { data: me } = useApi(() => api<{ did: string }>('whoami'), []);
  if (!scenes || !me) return null;
  return (
    <div className="field-row-stacked">
      <div className="scene-picker">
        <button type="button" className={value ? '' : 'sel'} title="A calm scene, picked by the post" onClick={() => onChange('')}>
          {postId ? <SceneImage did={me.did} scene={pickedScene(postId)} size={128} close /> : <span className="surprise">?</span>}
          <span>Surprise me</span>
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
      <BlobImage src={space.photo} alt={`${space.name}: their photo`} />
      <figcaption>{banner}</figcaption>
    </figure>
  );
}

/** Settings: the space's photo (everyone's avatars, or a picture of its own) and the text on its banner. */
export function SpacePhotoSettings({ space, members, canSet }: { space: SpaceInfo; members: MemberInfo[]; canSet: boolean }) {
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
      <legend>Photo</legend>
      <div className="space-photo-settings">
        <div className="space-photo-preview">
          <SpacePhoto space={preview} dids={dids} />
        </div>
        <div className="grow">
          <div className="field-row">
            <input id={`photo-group-${space.id}`} type="radio" name={`photo-${space.id}`} checked={!own} disabled={!canSet} onChange={() => setOwn(false)} />
            <label htmlFor={`photo-group-${space.id}`}>Everyone's avatars, as a group photo</label>
          </div>
          <div className="field-row">
            <input id={`photo-own-${space.id}`} type="radio" name={`photo-${space.id}`} checked={own} disabled={!canSet} onChange={() => setOwn(true)} />
            <label htmlFor={`photo-own-${space.id}`}>A picture of your own</label>
          </div>
          {own && canSet && <ImagePicker value={photo} onChange={setPhoto} label="Photo" wide />}
          {!own && canSet && (
            <div className="field-row-stacked">
              <label>Background (optional){space.kind === 'project' ? ": the project's banner too, unless its page has one" : ''}</label>
              <ImagePicker value={background} onChange={setBackground} label="Background" wide />
            </div>
          )}
          <div className="field-row-stacked">
            <label htmlFor={`photo-banner-${space.id}`}>On the banner</label>
            <input id={`photo-banner-${space.id}`} value={banner} maxLength={40} placeholder={space.name} disabled={!canSet} onChange={(e) => setBanner(e.target.value)} />
          </div>
          {!own && order.length > 0 && (
            <div className="field-row-stacked">
              <label>Who stands where (front row first, left to right), and how</label>
              <ol className="photo-order">
                {order.slice(0, 12).map((did, i) => (
                  <li key={did}>
                    <Avatar did={did} size={20} /> <span className="grow">{name(did)}</span>
                    <select
                      aria-label={`How ${name(did)} poses`}
                      value={poses[did] ?? ''}
                      disabled={!canSet || !choices}
                      onChange={(e) => setPoses((p) => { const next = { ...p }; if (e.target.value) next[did] = e.target.value; else delete next[did]; return next; })}
                    >
                      <option value="">Any pose</option>
                      <optgroup label="Poses">
                        {choices?.filter((c) => !c.scene).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </optgroup>
                      <optgroup label="Scenes">
                        {choices?.filter((c) => c.scene).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </optgroup>
                    </select>
                    <button type="button" disabled={!canSet || i === 0} title="Further forward" onClick={() => move(i, -1)}>▲</button>
                    <button type="button" disabled={!canSet || i === order.length - 1} title="Further back" onClick={() => move(i, 1)}>▼</button>
                  </li>
                ))}
              </ol>
              {order.length > 12 && <span className="small muted">The photo shows the first twelve.</span>}
            </div>
          )}
          <div className="field-row">
            <input id={`photo-list-${space.id}`} type="checkbox" checked={inList} disabled={!canSet} onChange={(e) => setInList(e.target.checked)} />
            <label htmlFor={`photo-list-${space.id}`}>Show the photo above the member list</label>
          </div>
          {space.kind === 'project' && (
            <div className="field-row">
              <input id={`photo-hero-${space.id}`} type="checkbox" checked={onBanner} disabled={!canSet} onChange={(e) => setOnBanner(e.target.checked)} />
              <label htmlFor={`photo-hero-${space.id}`}>Show the members on the project's banner</label>
            </div>
          )}
          {canSet ? (
            <div className="buttons">
              <AsyncButton
                className="default"
                disabled={!changed || (own && !photo)}
                onClick={() => attempt(() => api('setSpacePhoto', { space: space.id, photo: own ? photo : '', banner: banner.trim(), background, ...(space.kind === 'project' ? { members: onBanner } : {}), order, poses, list: inList }).then(bump), 'Photo saved')}
              >
                Save photo
              </AsyncButton>
            </div>
          ) : (
            <p className="small muted">Those who run {space.name} choose its photo.</p>
          )}
        </div>
      </div>
    </fieldset>
  );
}
