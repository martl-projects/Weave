import { useEffect, useState, type ReactNode } from 'react';
import type { KeyvaultInfo, ServiceActionInfo, ServiceListInfo, SpaceInfo } from '@weave/node/client';
import { AccountProofDialog } from './accounts.tsx';
import { Icon } from './icons.tsx';
import { HandDialog } from './keyvaults.tsx';
import { api, bump, navigate, onItem } from './lib.ts';
import { ActionDialog, askAndWait, SERVICE_CHANGED } from './services.tsx';
import { ask, attempt, AsyncButton } from './ui.tsx';

/** One row of a list: its title, a quieter line, its main button (or what's said instead), and taking it out. */
export interface ItemRow {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  main?: ReactNode;
  /** Taking it out (closing it, declining it): only for who may. */
  remove?: { label: string; run(): void };
}

/**
 * A list as every service's card shows it: a title with + (adding one, for who may), and rows with their main button
 * and a trash can (for who may). The same for running websites, repositories offered, releases, files.
 */
export function ItemList({ title, add, rows, empty, error }: { title: string; add?: { label: string; run(): void }; rows?: ItemRow[]; empty: string; error?: string }) {
  return (
    <div className="item-list">
      <div className="item-list-head">
        <b className="grow">{title}</b>
        {add && (
          <button className="icon-button item-add" title={add.label} aria-label={add.label} onClick={add.run}>
            +
          </button>
        )}
      </div>
      {error ? (
        <p className="small error-text">{error}</p>
      ) : !rows ? (
        <p className="small muted">Looking…</p>
      ) : !rows.length ? (
        <p className="small muted">{empty}</p>
      ) : (
        rows.map((r) => (
          <div className="item-row" key={r.key}>
            <div className="grow">
              <div>{r.title}</div>
              {r.detail && <div className="small muted">{r.detail}</div>}
            </div>
            {r.main}
            {r.remove && (
              <button className="icon-button" title={r.remove.label} onClick={r.remove.run}>
                <Icon name="trash" />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/** An item as a service's list action answers it. */
interface ServiceItem {
  id: string;
  title: string;
  detail?: string;
  url?: string;
  done?: string;
  use?: false;
  remove?: false;
  more?: Array<{ action: string; label: string }>;
}

/** A service's list (its manifest's lists): its items asked of it, its buttons as yours to use. */
export function ServiceList({ space, service, list, actions }: { space: { id: string; name: string }; service: { did: string; name: string }; list: ServiceListInfo; actions: ServiceActionInfo[] }) {
  const [items, setItems] = useState<ServiceItem[]>();
  const [error, setError] = useState<string>();
  const [round, setRound] = useState(0);
  const [proving, setProving] = useState<string>();
  const [handing, setHanding] = useState<{ vault: KeyvaultInfo; resources: string[] }>();
  const [using, setUsing] = useState<ServiceActionInfo>();
  const again = () => setRound((n) => n + 1);
  // Asked once per round: when it opens, after one of its buttons, and when something changed here (not for requests
  // and answers: asking is one of those, and would ask on and on).
  useEffect(() => {
    let alive = true;
    askAndWait(space.id, service, list.list).then(
      (got) => alive && (setItems(Array.isArray(got.data) ? (got.data as ServiceItem[]) : []), setError(undefined)),
      (e: Error) => alive && setError(e.message),
    );
    return () => void (alive = false);
  }, [space.id, service.did, list.list, round]);
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
  const add = list.add?.mine
    ? {
        label: list.add.label ?? `Add ${list.item ?? 'one'}`,
        run: () =>
          void (async () => {
            if (list.add!.hand) {
              // From your keyvault for that platform: yours alone to hand to a project.
              const vault = (await api<KeyvaultInfo[]>('keyvaults')).find((k) => k.platform === list.add!.hand && k.added);
              if (!vault) return void ((await ask(`First add your ${list.add!.hand} keyvault in Keys & devices: it holds your access, and you hand projects what it reaches.`, 'Go there')) && navigate('#/keys'));
              setHanding({ vault, resources: vault.handed.find((h) => h.project.id === space.id)?.resources ?? [] });
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
      ...(it.detail ? { detail: it.detail } : {}),
      main: (
        <>
          {(it.more ?? [])
            .filter((m) => mine(m.action))
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
      ...(list.remove?.mine && it.remove !== false
        ? { remove: { label: list.remove.label ?? 'Remove', run: () => void (async () => (await ask(`${list.remove!.label ?? 'Remove'}: ${it.title}?`, list.remove!.label ?? 'Remove')) && act(list.remove!.action, it.id, `${list.remove!.label ?? 'Remove'}: ${it.title}`))() } }
        : {}),
    }),
  );
  return (
    <>
      <ItemList title={list.title} add={add} rows={rows} error={error} empty={`No ${list.item ?? 'items'}s yet.`} />
      {proving && <AccountProofDialog space={{ id: space.id, name: space.name } as SpaceInfo} platform={proving} onClose={() => (setProving(undefined), again())} />}
      {handing && <HandDialog vault={handing.vault} project={{ id: space.id, name: space.name.replace(/^p\//, '') }} resources={handing.resources} onClose={() => (setHanding(undefined), again())} />}
      {using && <ActionDialog space={space} service={service} action={using} onClose={() => (setUsing(undefined), again())} />}
    </>
  );
}
