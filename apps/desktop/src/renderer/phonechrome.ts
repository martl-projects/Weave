import { useEffect, useRef, useState } from 'react';
import { navigate } from './lib.ts';

/**
 * On a phone the bars make room for what is read: a finger pushing the page up (reading on) folds them, one pulling it
 * down brings them back. It goes by the finger, not by scroll events, so a chat scrolling itself to a new message
 * leaves them as they are. While something is typed into, they stay.
 */

const PHONE = '(max-width: 700px)';

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  useEffect(() => {
    const query = matchMedia(PHONE);
    const changed = () => setPhone(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return phone;
}

/** How far a finger goes before the bars follow it, in pixels. */
const STEP = 24;

const typing = () => {
  const active = document.activeElement;
  return !!active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && (active as HTMLInputElement).type !== 'checkbox') || (active as HTMLElement).isContentEditable);
};

/** Whether the bars are folded away; `again` unfolds them on every new place. */
export function useBarsFolded(on: boolean, again: string): [boolean, (folded: boolean) => void] {
  const [folded, setFolded] = useState(false);
  useEffect(() => setFolded(false), [again, on]);
  useEffect(() => {
    if (!on) return;
    let last: { x: number; y: number } | undefined;
    let sideways = false;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      last = touch && { x: touch.clientX, y: touch.clientY };
      sideways = false;
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!last || !touch || sideways) return;
      const dx = touch.clientX - last.x;
      const dy = touch.clientY - last.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        sideways = true; // a strip of chips, a swipe back: not the page
        return;
      }
      if (Math.abs(dy) < STEP) return;
      if (dy < 0 && !typing()) setFolded(true);
      else if (dy > 0) setFolded(false);
      last = { x: touch.clientX, y: touch.clientY };
    };
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 4) return;
      if (event.deltaY > 0 && !typing()) setFolded(true);
      else if (event.deltaY < 0) setFolded(false);
    };
    addEventListener('touchstart', start, { passive: true, capture: true });
    addEventListener('touchmove', move, { passive: true, capture: true });
    addEventListener('wheel', wheel, { passive: true, capture: true });
    return () => {
      removeEventListener('touchstart', start, { capture: true });
      removeEventListener('touchmove', move, { capture: true });
      removeEventListener('wheel', wheel, { capture: true });
    };
  }, [on]);
  return [folded, setFolded];
}

/** Where back leads out of a place: the list it was opened from (Places, Inbox, People, a hub), else Home. */
let outside = '#/';
export function rememberOutside(hash: string): void {
  outside = hash || '#/';
}
export function backOut(): void {
  navigate(outside === location.hash ? '#/' : outside);
}

/** Back from where a place shows something: a post goes back to its board (or its community), else out of the place. */
export function backFrom(route: string[]): void {
  const [kind, id, view, arg, post] = route;
  if (view === 'b' && arg && post) navigate(`#/${kind}/${id}/b/${arg}`);
  else if (view === 'post' && arg) navigate(`#/${kind}/${id}`);
  else backOut();
}

/** A finger drawn from the left edge to the right goes back, as on a phone everywhere. */
export function useSwipeBack(on: boolean, back: () => void): void {
  const latest = useRef(back);
  latest.current = back;
  useEffect(() => {
    if (!on) return;
    let from: { x: number; y: number } | undefined;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      from = touch && touch.clientX < 28 ? { x: touch.clientX, y: touch.clientY } : undefined;
    };
    const end = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = Math.abs(touch.clientY - from.y);
      from = undefined;
      if (dx > 80 && dy < 60 && !document.querySelector('.window.modal')) latest.current();
    };
    addEventListener('touchstart', start, { passive: true, capture: true });
    addEventListener('touchend', end, { passive: true, capture: true });
    return () => {
      removeEventListener('touchstart', start, { capture: true });
      removeEventListener('touchend', end, { capture: true });
    };
  }, [on]);
}
