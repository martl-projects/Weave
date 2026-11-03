import { useEffect, useState } from 'react';
import type { KeyvaultInfo, ServiceInfo, ShippedServiceInfo, SpaceInfo } from '@weave/node/client';
import type { Pack, PackStep } from '@weave/core';
import { Icon, type IconName } from './icons.tsx';
import { HandDialog } from './keyvaults.tsx';
import { api, bump, useApi } from './lib.ts';
import { ItemList } from './lists.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { useTexts } from './texts.tsx';

/**
 * A setup pack, walked through for a project: its steps in order, each done or the next to do with one click (Weave
 * tells which is done itself), so setting up something made of several parts (GitHub: a keyvault, its app, two
 * services) takes clicks, not knowing how they fit.
 */
export function SetupPackDialog({ project, pack, onClose }: { project: SpaceInfo; pack: Pack; onClose(): void }) {
  const { t } = useTexts();
  const { data: vaults, reload: reloadVaults } = useApi(() => api<KeyvaultInfo[]>('keyvaults'), []);
  const { data: services, reload: reloadServices } = useApi(() => api<ServiceInfo[]>('services'), []);
  const { data: shipped } = useApi(() => api<ShippedServiceInfo[]>('shippedServices').catch(() => [] as ShippedServiceInfo[]), []);
  // What each keyvault's app reaches, once asked (it asks the platform, which takes a moment): installed if anything.
  const [reaches, setReaches] = useState<Record<string, number | string>>({});
  const [handing, setHanding] = useState<KeyvaultInfo>();
  const vault = (name: string) => vaults?.find((v) => v.name === name && v.added);
  const ask = (name: string) =>
    api<unknown[]>('keyvaultReachable', { name }).then(
      (got) => setReaches((r) => ({ ...r, [name]: got.length })),
      (e: Error) => setReaches((r) => ({ ...r, [name]: e.message })),
    );
  // Asked once a keyvault has its app, for the install step.
  useEffect(() => {
    for (const step of pack.steps) if (step.kind === 'install' && vault(step.keyvault)?.apps.length && reaches[step.keyvault] === undefined) void ask(step.keyvault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults]);
  const done = (step: PackStep): boolean | undefined => {
    if (!vaults || !services) return undefined;
    if (step.kind === 'keyvault') return !!vault(step.keyvault);
    if (step.kind === 'app') return !!vault(step.keyvault)?.apps.length;
    if (step.kind === 'install') return typeof reaches[step.keyvault] === 'number' && (reaches[step.keyvault] as number) > 0;
    if (step.kind === 'service') return services.some((s) => s.shipped === step.service && s.spaces.some((x) => x.id === project.id));
    return !!vault(step.keyvault)?.apps.some((a) => a.handed.some((h) => h.project.id === project.id && h.resources.length));
  };
  const again = () => (reloadVaults(), reloadServices(), bump());
  const label = (step: PackStep): { icon: IconName; heading: string } => {
    if (step.kind === 'service') return { icon: 'plug', heading: t('pack.add.service', { service: shipped?.find((s) => s.name === step.service)?.title ?? step.service, project: project.name }) };
    const v = vaults?.find((x) => x.name === step.keyvault);
    const what = v?.resources ?? t('pack.resources');
    if (step.kind === 'keyvault') return { icon: 'lock', heading: t('pack.add.keyvault', { keyvault: v?.title ?? step.keyvault }) };
    if (step.kind === 'app') return { icon: 'lock', heading: t('pack.make.app', { app: (v?.settings.find((s) => s.register)?.label ?? t('pack.app')).replace(/^your /i, '') }) };
    if (step.kind === 'install') return { icon: 'download', heading: t('pack.install.on', { what }) };
    return { icon: 'folder', heading: t('pack.hand', { project: project.name, what }) };
  };
  /** The next step's button: one click each. */
  const act = (step: PackStep) => {
    if (step.kind === 'keyvault') return <AsyncButton className="default" onClick={() => attempt(() => api('addKeyvault', { shipped: step.keyvault }).then(again))}>{t('pack.add.it')}</AsyncButton>;
    if (step.kind === 'app') {
      const setting = vault(step.keyvault)?.settings.find((s) => s.register);
      return (
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              const { id, url } = await api<{ id: string; url: string }>('startKeyvaultApp', { name: step.keyvault, setting: setting?.name });
              window.open(url, '_blank', 'noopener');
              await api('finishKeyvaultApp', { id });
              again();
            }, t('pack.made.install'))
          }
        >
          {t('pack.make.on', { site: setting?.register ? new URL(setting.register.page).hostname : t('pack.its.site') })}
        </AsyncButton>
      );
    }
    if (step.kind === 'install') {
      const next = vault(step.keyvault)?.apps[0]?.next;
      return (
        <>
          {next && (
            <button className="default" onClick={() => window.open(next, '_blank', 'noopener')}>
              {t('catalog.install')}
            </button>
          )}
          <AsyncButton onClick={() => ask(step.keyvault)}>{t('pack.check.again')}</AsyncButton>
        </>
      );
    }
    if (step.kind === 'service') {
      // Yours elsewhere: here too. Else Weave's, added.
      const mine = services?.find((s) => s.shipped === step.service && !s.node);
      return (
        <AsyncButton className="default" onClick={() => attempt(() => (mine ? api('setService', { name: mine.name, spaces: [...mine.spaces.map((x) => x.id), project.id] }) : api('addService', { shipped: step.service, spaces: [project.id] })).then(again))}>
          {t('pack.add.it')}
        </AsyncButton>
      );
    }
    return (
      <button className="default" onClick={() => setHanding(vault(step.keyvault))}>
        {t('button.choose')}
      </button>
    );
  };
  // The first step not done is the one to do; those after it wait for it.
  const first = pack.steps.findIndex((s) => done(s) === false);
  return (
    <Modal title={`${pack.title} · p/${project.name}`} onClose={onClose} wide>
      {pack.about && <p className="small">{pack.about}</p>}
      <ItemList
        title={t('pack.steps')}
        empty={t('looking')}
        {...(vaults && services
          ? {
              rows: pack.steps.map((step, i) => {
                const l = label(step);
                const ok = done(step);
                const problem = step.kind === 'install' && typeof reaches[step.keyvault] === 'string' ? (reaches[step.keyvault] as string) : undefined;
                return {
                  key: `${i}`,
                  icon: ok ? ('flag' as const) : l.icon,
                  title: `${i + 1}. ${l.heading}`,
                  detail: [step.why, problem].filter(Boolean).join(' · '),
                  main: ok ? <span className="small muted">{t('pack.done')}</span> : i === first ? act(step) : <span className="small muted">{t('pack.after.before')}</span>,
                };
              }),
            }
          : {})}
      />
      {first === -1 && vaults && services && (
        <p className="note">
          <Icon name="flag" /> {t('pack.all.set', { pack: pack.title })}
        </p>
      )}
      <div className="buttons">
        <button onClick={onClose}>{t(first === -1 ? 'button.done' : 'update.later')}</button>
      </div>
      {handing && <HandDialog vault={handing} project={{ id: project.id, name: project.name }} onClose={() => (setHanding(undefined), again())} />}
    </Modal>
  );
}
