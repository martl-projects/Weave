import { useEffect, useState } from 'react';
import type { UpdateInfo } from '@weave/node/client';
import { whyNotText, type UpdateView } from '../updatestate.ts';
import { ago, api, bridge, navigate } from './lib.ts';
import { Markdown, Modal, toast } from './ui.tsx';

/*
 * New Weave versions. In the desktop app the main process does the work (src/update.ts): it asks the daemon shortly
 * after starting and every few hours, the daemon downloads the new version in the background and checks it against
 * the maintainer's signed SHA-256, and this shows where it stands: a small window at the bottom left while it
 * downloads, then "Restart to update". "Later" waits a day; "Skip this version" waits for the next one. A build that
 * can't install itself (the MSI, the Store, an unsigned Mac app, managed Updates=false) gets the prompt with the
 * download instead. Help → Check for updates… asks now and says so even when nothing is newer.
 *
 * In the browser preview and on the phone there's no main process: the check runs here and only ever prompts.
 */

const SKIP = 'weave.update.skip';
const LATER = 'weave.update.later';
const EVERY = 6 * 3600_000;
const DAY = 24 * 3600_000;

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // private window: ask again next time
    }
  },
};

/** Put off by the person: skipped this version, or "later" still running. */
const putOff = (version: string | undefined) => !!version && (store.get(SKIP) === version || Number(store.get(LATER) ?? 0) > Date.now());

let checkNow: (() => void) | undefined;
/** Help → Check for updates…: says so even when nothing is newer. */
export const checkForUpdates = (): void => checkNow?.();

export function UpdatePrompt() {
  return bridge.update ? <DesktopUpdate /> : <CheckOnly />;
}

/** The desktop app: the main process says where a new version stands; this shows it and passes the clicks on. */
function DesktopUpdate() {
  const update = bridge.update!;
  const [view, setView] = useState<UpdateView>();
  // Put off here: hidden until the next check finds something else, or the person asks.
  const [hidden, setHidden] = useState<string>();
  useEffect(() => {
    let last: UpdateView | undefined;
    const show = (next: UpdateView) => {
      // Said once each: the answer to Check for updates…, and a refusal.
      if (next.asked && next.state === 'idle' && last?.state !== 'idle') toast(`Weave ${next.current} is the newest version`);
      if (next.state === 'failed' && (last?.state !== 'failed' || last.error !== next.error)) toast(next.error ?? "Couldn't update", 'error');
      if (next.state !== last?.state || next.version !== last?.version) setHidden(undefined);
      last = next;
      setView(next);
    };
    update.onChange(show);
    update.state().then(show, () => {});
    checkNow = () => void update.action('check').catch((error: Error) => toast(error.message, 'error'));
    return () => {
      checkNow = undefined;
    };
  }, []);
  if (!view || !view.version || hidden === view.version) return null;
  // Put off before this start: a ready update shows again next start, an available one too (as before).
  if (!view.asked && putOff(view.version) && view.state !== 'downloading') return null;
  const later = () => {
    store.set(LATER, String(Date.now() + DAY));
    setHidden(view.version);
  };
  const skip = () => {
    store.set(SKIP, view.version!);
    setHidden(view.version);
  };
  const act = (action: 'download' | 'restart') => void update.action(action).catch((error: Error) => toast(error.message, 'error'));

  if (view.state === 'downloading')
    return (
      <div className="window update-bar">
        <div className="window-body">
          <span className="update-text">
            Getting Weave {view.version}…{view.total ? ` ${Math.min(100, Math.round(((view.done ?? 0) / view.total) * 100))} %` : ''}
          </span>
          <progress max={view.total ?? 1} value={view.total ? view.done ?? 0 : undefined} />
        </div>
      </div>
    );

  if (view.state === 'ready')
    return (
      <div className="window update-bar">
        <div className="window-body">
          <span className="update-text">
            Weave {view.version} is ready to install. Restarting ends the Weave daemon and any <code>weave</code> commands or agents using it; they start again with the new version.
          </span>
          <div className="buttons">
            <button type="button" className="default" onClick={() => act('restart')}>
              Restart to update
            </button>
            <button type="button" onClick={later}>
              Later
            </button>
            <button type="button" onClick={skip}>
              Skip this version
            </button>
            {view.latest?.post && (
              <button type="button" onClick={() => navigate(`#/post/${view.latest!.post!.replace('weave:post:', '')}`)}>
                What's new
              </button>
            )}
          </div>
        </div>
      </div>
    );

  if (view.state === 'available' && view.latest)
    return (
      <Prompt current={view.current} latest={view.latest} why={view.why ? whyNotText(view.why) : undefined} install={view.self ? () => act('download') : undefined} onLater={later} onSkip={skip} />
    );
  return null;
}

/** The browser preview and the phone: asked here, and only ever a prompt with the download. */
function CheckOnly() {
  const [info, setInfo] = useState<UpdateInfo>();
  useEffect(() => {
    const check = async (asked: boolean) => {
      try {
        const result = await api<UpdateInfo>('updateCheck', { current: WEAVE_VERSION });
        const version = result.latest?.version;
        if (!result.newer || !version) {
          if (asked) toast(`Weave ${result.current} is the newest version`);
          return;
        }
        if (!asked && putOff(version)) return;
        setInfo(result);
      } catch (error) {
        if (asked) toast(`Couldn't check for updates: ${(error as Error).message}`, 'error');
      }
    };
    checkNow = () => void check(true);
    const first = setTimeout(() => void check(false), 5000);
    const every = setInterval(() => void check(false), EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      checkNow = undefined;
    };
  }, []);
  const latest = info?.latest;
  if (!info || !latest) return null;
  const later = () => {
    store.set(LATER, String(Date.now() + DAY));
    setInfo(undefined);
  };
  const skip = () => {
    store.set(SKIP, latest.version);
    setInfo(undefined);
  };
  return <Prompt current={info.current} latest={latest} onLater={later} onSkip={skip} />;
}

/** A newer version this build doesn't install by itself (why), or only when asked (install): the notes and the download. */
function Prompt({ current, latest, why, install, onLater, onSkip }: { current: string; latest: NonNullable<UpdateInfo['latest']>; why?: string; install?: () => void; onLater(): void; onSkip(): void }) {
  const download = () => {
    if (latest.url && /^https:\/\//.test(latest.url)) window.open(latest.url, '_blank', 'noopener');
    else if (latest.post) navigate(`#/post/${latest.post.replace('weave:post:', '')}`);
    onLater();
  };
  return (
    <Modal title={`Weave ${latest.version} is available`} onClose={onLater}>
      <div className="update-prompt">
        <p>
          You have Weave {current}. Weave {latest.version} came out{latest.published ? ` ${ago(latest.published)}` : ''}
          {latest.source === 'weave' ? ', announced in the Weave project by its maintainers' : ''}. Weave is still 0.x: please update, so everyone speaks the same version.
        </p>
        {why && <p className="small">{why}</p>}
        {latest.notes && (
          <div className="update-notes sunken">
            <Markdown text={latest.notes} />
          </div>
        )}
        <div className="buttons">
          <button type="button" onClick={onSkip}>
            Skip this version
          </button>
          <button type="button" onClick={onLater}>
            Later
          </button>
          {latest.post && latest.url && (
            <button type="button" onClick={() => (navigate(`#/post/${latest.post!.replace('weave:post:', '')}`), onLater())}>
              Read the release post
            </button>
          )}
          {install ? (
            <button type="button" className="default" onClick={install}>
              Download and install
            </button>
          ) : (
            <button type="button" className="default" onClick={download}>
              {latest.url ? 'Download' : 'Open the release'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Settings → Updates…: download new versions in the background, or only say there's one. */
export function UpdateSettings({ onClose }: { onClose(): void }) {
  const update = bridge.update;
  const [view, setView] = useState<UpdateView>();
  useEffect(() => {
    if (!update) return;
    update.state().then(setView, () => {});
    update.onChange(setView);
  }, []);
  const auto = view?.auto !== false;
  const setAuto = (on: boolean) => {
    setView((v) => (v ? { ...v, auto: on } : v));
    void update?.setAuto(on).catch((error: Error) => toast(error.message, 'error'));
  };
  const standing = !view
    ? ''
    : view.state === 'ready'
      ? `Weave ${view.version} is downloaded and checked: restart to install it.`
      : view.state === 'downloading'
        ? `Getting Weave ${view.version}…`
        : view.state === 'available' && view.why
          ? `Weave ${view.version} is available. ${whyNotText(view.why)}`
          : view.state === 'available'
            ? `Weave ${view.version} is available.`
            : view.state === 'failed'
              ? `Couldn't get Weave ${view.version ?? ''}: ${view.error ?? ''}`
              : `You have Weave ${view.current}.`;
  return (
    <Modal title="Updates" onClose={onClose}>
      {!update ? (
        <p>New versions are installed by the desktop app; the browser preview only says when there is one.</p>
      ) : (
        <>
          <p>{standing}</p>
          <div className="field-row">
            <input type="checkbox" id="update-auto" checked={auto} disabled={!view || view.why === 'managed'} onChange={(e) => setAuto(e.target.checked)} />
            <label htmlFor="update-auto">Download new versions in the background, then offer a restart</label>
          </div>
          <p className="small">
            Weave installs only a file whose SHA-256 is the one a maintainer of the Weave project signed with the release, and installs it when you click Restart to update, never behind your back. Off: Weave says when a new version is out, and gets it when you ask.
          </p>
          <div className="buttons">
            <button type="button" onClick={() => void update.action('check').catch((error: Error) => toast(error.message, 'error'))}>
              Check now
            </button>
            <button type="button" className="default" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
