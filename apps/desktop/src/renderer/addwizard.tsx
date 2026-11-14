import { useState } from 'react';
import type { ProjectInfo, ServiceInfo, ShippedServiceInfo, SpaceInfo } from '@weave/node/client';
import type { Pack } from '@weave/core';
import { api, useApi } from './lib.ts';
import { ServiceCatalog, serviceIcon, ServiceTile } from './addservice.tsx';
import { contractText } from './services.tsx';
import { Modal } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * Add a service, in Keys & devices: which one (what Weave ships, its setup packs, or what your projects offer), then
 * which project gets it; that project's catalog takes it from there, with its settings. Every service comes from
 * what Weave ships or from a project's release: nothing typed in by hand.
 */

type Choice = { kind: 'pack'; pack: Pack } | { kind: 'shipped'; shipped: ShippedServiceInfo } | { kind: 'projects' };
type Step = 'what' | 'project' | 'catalog';

export function AddServiceWizard({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const { data: shipped } = useApi(() => api<ShippedServiceInfo[]>('shippedServices').catch(() => [] as ShippedServiceInfo[]), []);
  const { data: packs } = useApi(() => api<Pack[]>('setupPacks').catch(() => [] as Pack[]), []);
  const { data: all } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  const projects = (all ?? []).filter((s) => s.kind === 'project');
  const [step, setStep] = useState<Step>('what');
  const [choice, setChoice] = useState<Choice>();
  const [project, setProject] = useState<string>();
  const pick = (c: Choice) => (setChoice(c), setStep('project'));

  // A project picked: its catalog takes it from here, opened at the one picked (or at all it offers).
  const picked = all?.find((s) => s.id === project);
  if (step === 'catalog' && picked && choice)
    return <CatalogFor project={picked} services={services ?? []} pick={choice.kind === 'pack' ? choice.pack.name : choice.kind === 'shipped' ? choice.shipped.name : undefined} onClose={onClose} />;

  return (
    <Modal title={step === 'what' ? t('addwiz.title') : t('addwiz.title.step', { step: 2, steps: 2 })} onClose={onClose} wide>
      {step === 'what' && (
        <>
          <h3 className="wizard-question">{t('addwiz.what')}</h3>
          <div className="service-catalog">
            {(packs ?? []).map((p) => (
              <ServiceTile key={`pack:${p.name}`} icon="zap" heading={p.title} by="Weave" about={p.about ?? t('addservice.steps', { n: p.steps.length })} badge={t('addservice.setup.steps', { n: p.steps.length })} onClick={() => pick({ kind: 'pack', pack: p })} />
            ))}
            {(shipped ?? []).map((s) => (
              <ServiceTile key={`shipped:${s.name}`} icon={serviceIcon({ name: s.name, shipped: s.name, contract: s.contract })} heading={s.title} by="Weave" about={s.about ?? t('service.it.does', { contract: contractText(s.contract) })} badge={t('origin.weave')} onClick={() => pick({ kind: 'shipped', shipped: s })} />
            ))}
            <ServiceTile icon="folder" heading={t('addwiz.from.projects')} about={t('addwiz.from.projects.about')} onClick={() => pick({ kind: 'projects' })} />
          </div>
          {(!shipped || !packs) && <p className="small muted">{t('addservice.looking')}</p>}
          <p className="small muted">{t('addwiz.from.artifacts')}</p>
        </>
      )}

      {step === 'project' && choice && (
        <>
          <h3 className="wizard-question">{t('addwiz.which.project', { name: choice.kind === 'pack' ? choice.pack.title : choice.kind === 'shipped' ? choice.shipped.title : t('addwiz.a.service') })}</h3>
          {projects.length ? (
            <div className="sunken service-spaces">
              {projects.map((p) => (
                <div className="field-row" key={p.id}>
                  <input type="radio" name="addwiz-project" id={`addwiz-p-${p.id}`} checked={project === p.id} onChange={() => setProject(p.id)} />
                  <label htmlFor={`addwiz-p-${p.id}`}>{p.name}</label>
                </div>
              ))}
            </div>
          ) : (
            <p className="small muted">{t('addwiz.no.projects')}</p>
          )}
          <p className="small muted">{t(choice.kind === 'projects' ? 'addwiz.project.catalog.note' : 'addwiz.project.note')}</p>
        </>
      )}

      <div className="buttons">
        {step !== 'what' && <button onClick={() => setStep('what')}>{t('addwiz.back')}</button>}
        <span className="grow" />
        <button onClick={onClose}>{t('button.cancel')}</button>
        {step === 'project' && (
          <button className="default" disabled={!project} onClick={() => setStep('catalog')}>
            {t('addwiz.next')}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** That project's catalog, opened at the one picked (or at all it offers). */
function CatalogFor({ project, services, pick, onClose }: { project: SpaceInfo; services: ServiceInfo[]; pick: string | undefined; onClose(): void }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  if (!info) return null;
  return <ServiceCatalog project={project} services={services} maintainer={!!info.maintainer} {...(pick ? { pick } : {})} onClose={onClose} />;
}
