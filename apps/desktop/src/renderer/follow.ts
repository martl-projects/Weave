/**
 * Which session the side panel shows: the one open in the Claude app, unless you picked another (in its Sessions
 * list, or by Ctrl+click on a work item). A pick holds only until you switch sessions in the Claude app: then the
 * panel follows again, so it never sits on an old session unseen.
 */
export interface Following {
  /** The session open in the Claude app, once Weave has said (known). */
  focused?: string;
  known: boolean;
  /** The session you picked, or '' to follow the Claude app. */
  pinned: string;
}

/** Weave says which session the Claude app shows now: the first answer only tells; a switch ends a pick. */
export function focusNow(state: Following, now: string | undefined): Following {
  if (!state.known) return { ...state, known: true, focused: now };
  if (now === state.focused) return state;
  return { known: true, focused: now, pinned: '' };
}

/** You picked a session; picking the one open in Claude follows it again. */
export function pick(state: Following, id: string): Following {
  return { ...state, pinned: id === state.focused ? '' : id };
}

/** Showing a session that isn't the one open in Claude: the panel says so, with a way back. */
export const pinnedAway = (state: Following): boolean => !!state.pinned && state.pinned !== state.focused;
