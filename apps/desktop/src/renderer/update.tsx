import { useEffect, useState } from 'react';
import type { UpdateInfo } from '@weave/node/client';
import { ago, api, navigate } from './lib.ts';
import { Markdown, Modal, toast } from './ui.tsx';

/*
 * New Weave versions: the app compares its own version with the newest release
 * (release posts in the Weave project, signed by its maintainers, and GitHub's
 * releases) shortly after starting and every few hours, and asks whether to
 * update. "Later" waits a day; "Skip this version" waits for the next one.
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

let checkNow: (() => void) | undefined;
/** Help → Check for updates…: says so even when nothing is newer. */
export const checkForUpdates = (): void => checkNow?.();

export function UpdatePrompt() {
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
        if (!asked && (store.get(SKIP) === version || Number(store.get(LATER) ?? 0) > Date.now())) return;
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
  const download = () => {
    if (latest.url && /^https:\/\//.test(latest.url)) window.open(latest.url, '_blank', 'noopener');
    else if (latest.post) navigate(`#/post/${latest.post.replace('weave:post:', '')}`);
    setInfo(undefined);
  };
  return (
    <Modal title={`Weave ${latest.version} is available`} onClose={later}>
      <div className="update-prompt">
        <p>
          You have Weave {info.current}. Weave {latest.version} came out{latest.published ? ` ${ago(latest.published)}` : ''}
          {latest.source === 'weave' ? ', announced in the Weave project by its maintainers' : ''}. Weave is still 0.x: please update, so everyone speaks the same version.
        </p>
        {latest.notes && (
          <div className="update-notes sunken">
            <Markdown text={latest.notes} />
          </div>
        )}
        <div className="buttons">
          <button type="button" onClick={skip}>
            Skip this version
          </button>
          <button type="button" onClick={later}>
            Later
          </button>
          {latest.post && latest.url && (
            <button type="button" onClick={() => (navigate(`#/post/${latest.post!.replace('weave:post:', '')}`), setInfo(undefined))}>
              Read the release post
            </button>
          )}
          <button type="button" className="default" onClick={download}>
            {latest.url ? 'Download' : 'Open the release'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
