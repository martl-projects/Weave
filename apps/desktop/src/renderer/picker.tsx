import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Found, FoundKind } from '@weave/node/client';
import { api, bridge } from './lib.ts';
import { Icon, type IconName } from './icons.tsx';
import { kindOf } from './overlay.tsx';

/*
 * The address book picker: a search over the people, projects and posts this
 * computer knows, brought up by its shortcut from wherever you're typing. Enter
 * pastes a Markdown link to the pick there, [Phil](http://weave.localhost:7710/@phil~…),
 * which names exactly that person or post however many share the name: Weave's
 * tools take the link wherever they take a person or a post. Tab switches
 * between all, people, projects and posts; Esc or a click elsewhere puts it away.
 */

/** `[label](url)`, with the label's own brackets kept as text. */
export const markdownLink = (label: string, url: string) => `[${label.replace(/[\\[\]]/g, '\\$&')}](${url})`;

const linkOf = (f: Found) => (f.person ? markdownLink(f.person.name ?? 'someone', f.person.url) : markdownLink(f.post.title, f.post.url));

/** What tells this one apart from others with the same name. */
function noteOf(f: Found): string {
  if (f.post) return `${kindOf(f.post)}${f.post.issue ? ` · ${f.post.issue.status}` : ''}`;
  const p = f.person;
  const state = p.following && p.followsMe ? 'friend' : p.following ? 'you follow them' : p.followsMe ? 'follows you' : p.contact ? 'in your address book' : 'person';
  // The key part of their address (@phil~fP5Q3XPC…), as the pasted link names them.
  return [state, p.company?.name, `~${p.url.split('~').pop()}`].filter(Boolean).join(' · ');
}

/** The tabs: everything, or one kind. Tab and Shift+Tab go from one to the next. */
const TABS: Array<[FoundKind | 'all', string]> = [
  ['all', 'All'],
  ['people', 'People'],
  ['projects', 'Projects'],
  ['posts', 'Posts'],
];

/** The tab a shortcut asked for (Ctrl+F1 all, F2 people, F3 projects), else all. */
const tabOf = (asked: string | null | undefined): FoundKind | 'all' => TABS.find(([key]) => key === asked)?.[0] ?? 'all';

const PLACEHOLDER: Record<FoundKind | 'all', string> = {
  all: 'A person, project, issue or post',
  people: 'A person',
  projects: 'A project',
  posts: 'An issue, idea or post',
};

const NOTHING: Record<FoundKind | 'all', string> = {
  all: 'Nobody and nothing by that name here.',
  people: 'Nobody by that name here.',
  projects: 'No project by that name here.',
  posts: 'No issue, idea or post by that name here.',
};

function iconOf(f: Found): IconName {
  if (f.person) return 'user';
  if (f.post.type === 'project') return 'zap';
  if (f.post.type === 'issue') return 'bug';
  if (f.post.type === 'proposal') return 'flag';
  return f.post.board === 'ideas' ? 'lightbulb' : 'notes';
}

export function Picker() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(() => tabOf(new URLSearchParams(location.hash.split('?')[1] ?? '').get('tab')));
  const [found, setFound] = useState<Found[]>();
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    const search = () =>
      void api<Found[]>('find', query, 30, ...(tab === 'all' ? [] : [tab])).then((f) => {
        if (!current) return;
        setFound(f);
        setAt(0);
      }, () => {});
    const timer = setTimeout(search, query ? 80 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, tab]);
  // The shortcut again, after a pick or Escape: a fresh search.
  useEffect(
    () =>
      bridge.onPickerOpen?.((asked) => {
        setQuery('');
        setTab(tabOf(asked));
        input.current?.focus();
      }),
    [],
  );
  useEffect(() => list.current?.querySelector('.picker-item.at')?.scrollIntoView({ block: 'nearest' }), [at]);
  // Just the search bar at first; the window grows with what it finds.
  useEffect(() => {
    if (!root.current || !bridge.fitPicker) return;
    const fit = new ResizeObserver(() => void bridge.fitPicker!(Math.ceil(root.current!.getBoundingClientRect().height)));
    fit.observe(root.current);
    return () => fit.disconnect();
  }, []);

  const close = () => void bridge.closePicker?.();
  const pick = (f: Found | undefined) => {
    if (!f) return;
    const link = linkOf(f);
    if (bridge.pick) void bridge.pick(link);
    else void navigator.clipboard.writeText(link); // in a browser
  };
  const onKey = (event: KeyboardEvent) => {
    const n = found?.length ?? 0;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown' && n) setAt((i) => (i + 1) % n);
    else if (event.key === 'ArrowUp' && n) setAt((i) => (i - 1 + n) % n);
    else if (event.key === 'Enter') pick(found?.[at]);
    else if (event.key === 'Tab') {
      const i = TABS.findIndex(([key]) => key === tab);
      setTab(TABS[(i + (event.shiftKey ? TABS.length - 1 : 1)) % TABS.length][0]);
      input.current?.focus();
    }
    else return;
    event.preventDefault();
  };

  return (
    <div className="picker" ref={root} onKeyDown={onKey}>
      <div className="picker-search">
        <Icon name="search" />
        <input ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={PLACEHOLDER[tab]} spellCheck={false} />
        <span className="picker-tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {query.trim() && found && (
        <ul className="picker-list" ref={list} role="listbox">
          {found.map((f, i) => (
            <li
              key={f.person ? f.person.did : f.post.id}
              className={`picker-item${i === at ? ' at' : ''}`}
              role="option"
              aria-selected={i === at}
              onMouseMove={() => setAt(i)}
              onClick={() => pick(f)}
            >
              <Icon name={iconOf(f)} />
              <span className="picker-what">
                <b>{f.person ? (f.person.name ?? 'Someone') : f.post.title}</b>
                <span className="panel-line-note">{noteOf(f)}</span>
              </span>
            </li>
          ))}
          {!found.length && <li className="picker-none">{NOTHING[tab]}</li>}
        </ul>
      )}
    </div>
  );
}
