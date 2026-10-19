import { useState } from 'react';
import type { HomeSource, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump } from './lib.ts';
import { PostList, spaceLabel } from './posts.tsx';
import { attempt, Modal } from './ui.tsx';

/*
 * Home: posts from your communities, your projects and people you follow,
 * filtered by source, without the communities and projects you hid from it.
 * Both choices are yours alone: the filter is remembered on this computer,
 * hiding is sealed to you and follows you to your other devices.
 */

const SOURCES: Array<{ value: HomeSource; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'communities', label: 'Communities' },
  { value: 'projects', label: 'Projects' },
  { value: 'mine', label: 'My projects' },
  { value: 'friends', label: "Friends' projects" },
  { value: 'following', label: 'People I follow' },
];

const EMPTY: Record<HomeSource, string> = {
  all: 'Nothing here yet. Start a project or community with “New…”, or join one with an invite link.',
  communities: 'No community posts here. Join a community, or check Sources: some may be hidden from Home.',
  projects: 'No projects here. Start one with “New…”, or check Sources: some may be hidden from Home.',
  mine: 'No projects of yours yet: start one with “New…”.',
  friends: "None of your friends' projects. Friends are people you follow who follow you back.",
  following: 'No public posts from people you follow yet.',
};

const KEY = 'weave.home.from';

function readSource(): HomeSource {
  try {
    const saved = localStorage.getItem(KEY);
    return SOURCES.some((s) => s.value === saved) ? (saved as HomeSource) : 'all';
  } catch {
    return 'all';
  }
}

/** Which communities and projects show on Home. */
function SourcesDialog({ spaces, onClose }: { spaces: SpaceInfo[]; onClose(): void }) {
  const list = spaces.filter((s) => (s.kind === 'community' || s.kind === 'project') && !s.closed);
  const toggle = (s: SpaceInfo, visible: boolean) => attempt(() => api('setHomeVisibility', { space: s.id, visible }).then(bump));
  return (
    <Modal title="Show on Home" onClose={onClose}>
      <p className="small">Choose what feeds your Home. Hidden ones stay in the sidebar and work as usual. Only you know what you hide.</p>
      {(['community', 'project'] as const).map((kind) => {
        const ofKind = list.filter((s) => s.kind === kind);
        return (
          ofKind.length > 0 && (
            <fieldset key={kind}>
              <legend>{kind === 'community' ? 'Communities' : 'Projects'}</legend>
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
      {list.length === 0 && <p>You're in no communities or projects yet.</p>}
      <div className="buttons">
        <button className="default" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export function HomeFeed({ spaces, meDid, onSubmit }: { spaces: SpaceInfo[]; meDid: string; onSubmit(): void }) {
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
        title={<>Home</>}
        query={{ from }}
        spaces={spaces}
        meDid={meDid}
        toolbar={
          <>
            <button onClick={onSubmit}>
              <Icon name="pencil" /> Submit
            </button>
            <select value={from} onChange={(e) => choose(e.target.value as HomeSource)} aria-label="Show posts from">
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button onClick={() => setChoosing(true)} title="Which communities and projects show on Home">
              Sources{hiddenCount ? ` (${hiddenCount} hidden)` : ''}…
            </button>
          </>
        }
        empty={<>{EMPTY[from]}</>}
      />
      {choosing && <SourcesDialog spaces={spaces} onClose={() => setChoosing(false)} />}
    </>
  );
}
