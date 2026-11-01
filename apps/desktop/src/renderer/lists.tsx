import { useEffect, useState, type ReactNode } from 'react';
import type { KeyvaultInfo, ServiceActionInfo, ServiceListInfo, SpaceInfo } from '@weave/node/client';
import { AccountProofDialog } from './accounts.tsx';
import { Icon, isIconName, type IconName } from './icons.tsx';
import { HandDialog } from './keyvaults.tsx';
import { api, bump, navigate, onItem } from './lib.ts';
import { ActionDialog, askAndWait, SERVICE_CHANGED } from './services.tsx';
import { ask, attempt, AsyncButton } from './ui.tsx';
import { useTexts } from './texts.tsx';

/** One row of a list: its icon, title, a badge, a quieter line, its main button (or what's said instead), its icon buttons, and taking it out. */
export interface ItemRow {
  key: string;
  icon?: IconName;
  title: ReactNode;
  badge?: string;
  detail?: ReactNode;
  main?: ReactNode;
  /** Its small buttons (settings, who may get it…), each with what it does in words. */
  tools?: Array<{ icon: IconName; label: string; run(): void }>;
  /** Taking it out (closing it, declining it): only for who may. */
  remove?: { label: string; run(): void };
  /** What a search finds it by (its title, if that's text). */
  search?: string;
}

/** Rows shown at once; more with a click. */
const PAGE = 10;

/**
 * A list as every service's card shows it: a title with + (adding one, for who may), a search once it's long, and rows
 * with their main button, small buttons and a trash can (for who may), a page at a time. The same for running
 * websites, repositories offered, releases, files. A list its service pages itself says so (more, query): then
 * searching and the next page ask it.
 */
export function ItemList({ title, add, rows, empty, error, more, query }: { title: string; add?: { label: string; run(): void }; rows?: ItemRow[]; empty: string; error?: string; more?(): void; query?(text: string): void }) {
  const { t } = useTexts();
  const [text, setText] = useState('');
  const [pages, setPages] = useState(1);
  const searching = !!query || (rows?.length ?? 0) > 8;
  const found = query ? rows : rows?.filter((r) => !text.trim() || (r.search ?? (typeof r.title === 'string' ? r.title : '')).toLowerCase().includes(text.trim().toLowerCase()));
  const shown = query ? found : found?.slice(0, pages * PAGE);
  // Searching its service: once typing pauses.
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => query(text.trim()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className="item-list">
      {/* Its title (none where the page titles it already), its search, and +. */}
      {(title || searching || add) && (
        <div className="item-list-head">
          <b className="grow">{title}</b>
          {searching && <input className="item-search" type="search" placeholder={t('list.search')} value={text} onChange={(e) => (setText(e.target.value), setPages(1))} />}
          {add && (
            <button className="icon-button item-add" title={add.label} aria-label={add.label} onClick={add.run}>
              +
            </button>
          )}
        </div>
      )}
      {error ? (
        <p className="small error-text">{error}</p>
      ) : !shown ? (
        <p className="small muted">{t('looking')}</p>
      ) : !shown.length ? (
        <p className="small muted">{text.trim() ? t('addservice.nothing.matches') : empty}</p>
      ) : (
        shown.map((r) => (
          <div className="item-row" key={r.key}>
            {r.icon && <Icon name={r.icon} />}
            <div className="grow">
              <div>
                {r.title} {r.badge && <span className="tag">{r.badge}</span>}
              </div>
              {r.detail && <div className="small muted">{r.detail}</div>}
            </div>
            {r.main}
            {r.tools?.map((tool) => (
              <button key={tool.label} className="icon-button" title={tool.label} aria-label={tool.label} onClick={tool.run}>
                <Icon name={tool.icon} />
              </button>
            ))}
            {r.remove && (
              <button className="icon-button" title={r.remove.label} aria-label={r.remove.label} onClick={r.remove.run}>
                <Icon name="trash" />
              </button>
            )}
          </div>
        ))
      )}
      {/* The next page: kept here, or asked of its service. */}
      {!query && found && found.length > pages * PAGE && (
        <button className="item-more" onClick={() => setPages((n) => n + 1)}>
          {t('list.show.more.of', { n: Math.min(PAGE, found.length - pages * PAGE), total: found.length })}
        </button>
      )}
      {more && (
        <button className="item-more" onClick={more}>
          {t('list.show.more')}
        </button>
      )}
    </div>
  );
}

/** An item as a service's list action answers it. */
interface ServiceItem {
  id: string;
  /** One of Weave's icons, by name. */
  icon?: string;
  title: string;
  badge?: string;
  detail?: string;
  url?: string;
  done?: string;
  use?: false;
  remove?: false;
  /** Its other buttons: a small one with an icon, or one in words. */
  more?: Array<{ action: string; label: string; icon?: string; confirm?: true }>;
}

/** What a list action answers: all its items, or a page of them and where the next starts (it pages itself). */
type ServicePage = ServiceItem[] | { items: ServiceItem[]; next?: string };

/** A service's list (its manifest's lists): its items asked of it, its buttons as yours to use. */
export function ServiceList({ space, service, list, actions }: { space: { id: string; name: string }; service: { did: string; name: string }; list: ServiceListInfo; actions: ServiceActionInfo[] }) {
  const { t } = useTexts();
  const [items, setItems] = useState<ServiceItem[]>();
  const [error, setError] = useState<string>();
  // A list its service pages itself: where its next page starts, and what's searched for.
  const [paged, setPaged] = useState<{ next?: string; query: string }>();
  const [round, setRound] = useState(0);
  const [proving, setProving] = useState<string>();
  const [handing, setHanding] = useState<KeyvaultInfo>();
  const [using, setUsing] = useState<ServiceActionInfo>();
  const again = () => setRound((n) => n + 1);
  // Asked once per round: when it opens, after one of its buttons, and when something changed here (not for requests
  // and answers: asking is one of those, and would ask on and on).
  const ask_ = (input: { query?: string; cursor?: string }) => askAndWait(space.id, service, list.list, Object.keys(input).length ? input : undefined).then((got) => (got.data ?? []) as ServicePage);
  useEffect(() => {
    let alive = true;
    ask_(paged?.query ? { query: paged.query } : {}).then(
      (got) => {
        if (!alive) return;
        setItems(Array.isArray(got) ? got : got.items);
        setPaged(Array.isArray(got) ? undefined : { query: paged?.query ?? '', ...(got.next ? { next: got.next } : {}) });
        setError(undefined);
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => void (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, service.did, list.list, round]);
  // Its next page, or a search: asked of it.
  const more = paged?.next ? () => void ask_({ ...(paged.query ? { query: paged.query } : {}), cursor: paged.next }).then((got) => !Array.isArray(got) && (setItems((all) => [...(all ?? []), ...got.items]), setPaged({ query: paged.query, ...(got.next ? { next: got.next } : {}) })), (e: Error) => setError(e.message)) : undefined;
  const query = paged ? (text: string) => text !== paged.query && (setPaged({ query: text }), again()) : undefined;
  useEffect(() => {
    let soon: ReturnType<typeof setTimeout> | undefined;
    const later = (ms: number) => (clearTimeout(soon), (soon = setTimeout(again, ms)));
    const off = onItem((item) => item.kind !== 'weave.service.request' && item.kind !== 'weave.service.result' && later(1500));
    const changed = (event: Event) => (event as CustomEvent<string>).detail === service.did && later(1500);
    addEventListener(SERVICE_CHANGED, changed);
    return () => (off(), clearTimeout(soon), removeEventListener(SERVICE_CHANGED, changed));
  }, [service.did]);
  const mine = (name: string) => !!actions.find((a) => a.name === name)?.mine;
  const act = (action: string, id: string, label: string) => attempt(() => askAndWait(space.id, service, action, { id }, label).then((r) => (again(), bump(), r.text ?? '')));
  const removeLabel = list.remove?.label ?? t('button.remove');
  const add = list.add?.mine
    ? {
        label: list.add.label ?? t('list.add.item', { item: list.item ?? t('list.one') }),
        run: () =>
          void (async () => {
            if (list.add!.hand) {
              // From your keyvault for that platform: yours alone to hand to a project.
              const vault = (await api<KeyvaultInfo[]>('keyvaults')).find((k) => k.platform === list.add!.hand && k.added);
              if (!vault?.apps.length) return void ((await ask(t('list.keyvault.first', { platform: list.add!.hand }), t('list.go.there'))) && navigate('#/keys'));
              setHanding(vault);
            } else {
              const a = actions.find((x) => x.name === list.add!.action);
              if (a) setUsing(a);
            }
          })(),
      }
    : undefined;
  const rows = items?.map(
    (it): ItemRow => ({
      key: it.id,
      title: it.url ? (
        <a href={it.url} target="_blank" rel="noopener noreferrer">
          {it.title}
        </a>
      ) : (
        it.title
      ),
      ...(isIconName(it.icon) ? { icon: it.icon } : {}),
      ...(it.badge ? { badge: it.badge } : {}),
      search: `${it.title} ${it.detail ?? ''}`,
      ...(it.detail ? { detail: it.detail } : {}),
      tools: (it.more ?? [])
        .filter((m) => isIconName(m.icon) && mine(m.action))
        .map((m) => ({ icon: m.icon as IconName, label: m.label, run: () => void (async () => (!m.confirm || (await ask(`${m.label}: ${it.title}?`, m.label))) && act(m.action, it.id, `${m.label}: ${it.title}`))() })),
      main: (
        <>
          {(it.more ?? [])
            .filter((m) => !isIconName(m.icon) && mine(m.action))
            .map((m) => (
              <AsyncButton key={m.action} onClick={() => act(m.action, it.id, `${m.label}: ${it.title}`)}>
                {m.label}
              </AsyncButton>
            ))}
          {it.done ? (
            <span className="small muted">{it.done}</span>
          ) : (
            list.use?.mine &&
            it.use !== false && (
              <AsyncButton className="default" onClick={async () => void (list.use!.account ? setProving(list.use!.account) : await act(list.use!.action!, it.id, `${list.use!.label}: ${it.title}`))}>
                {list.use.label}
              </AsyncButton>
            )
          )}
        </>
      ),
      ...(list.remove?.mine && it.remove !== false ? { remove: { label: removeLabel, run: () => void (async () => (await ask(`${removeLabel}: ${it.title}?`, removeLabel)) && act(list.remove!.action, it.id, `${removeLabel}: ${it.title}`))() } } : {}),
    }),
  );
  return (
    <>
      <ItemList title={list.title} add={add} rows={rows} error={error} empty={t('list.none.yet', { item: list.item ?? t('list.item') })} {...(more ? { more } : {})} {...(query ? { query } : {})} />
      {proving && <AccountProofDialog space={{ id: space.id, name: space.name } as SpaceInfo} platform={proving} onClose={() => (setProving(undefined), again())} />}
      {handing && <HandDialog vault={handing} project={{ id: space.id, name: space.name.replace(/^p\//, '') }} onClose={() => (setHanding(undefined), again())} />}
      {using && <ActionDialog space={space} service={service} action={using} onClose={() => (setUsing(undefined), again())} />}
    </>
  );
}
