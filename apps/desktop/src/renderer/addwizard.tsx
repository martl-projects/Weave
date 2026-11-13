import { useState } from 'react';
import type { KeyInfo, ProjectInfo, ServiceInfo, ShippedServiceInfo, SpaceInfo } from '@weave/node/client';
import type { Pack, ServiceContract } from '@weave/core';
import { api, bump, useApi } from './lib.ts';
import { ServiceCatalog, serviceIcon, ServiceTile } from './addservice.tsx';
import { contractText } from './services.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * Add a service, in Keys & devices: step by step. First which one (what Weave ships, its setup packs, what your
 * projects offer, or a program of your own), then where it goes. One from a catalog goes on in that project's catalog,
 * which knows its settings; a program of your own asks which projects and groups, where it runs, and how it starts.
 */

type Choice = { kind: 'pack'; pack: Pack } | { kind: 'shipped'; shipped: ShippedServiceInfo } | { kind: 'projects' } | { kind: 'own' };
type Step = 'what' | 'project' | 'catalog' | 'spaces' | 'where' | 'how';

/** Every kind name, comma or space separated. */
const kinds = (text: string) => text.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean);
/** Split a command line into its parts, keeping quoted ones together. */
const commandParts = (text: string) => [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

export function AddServiceWizard({ nodes, onClose }: { nodes: KeyInfo[]; onClose(): void }) {
  const { t } = useTexts();
  const { data: shipped } = useApi(() => api<ShippedServiceInfo[]>('shippedServices').catch(() => [] as ShippedServiceInfo[]), []);
  const { data: packs } = useApi(() => api<Pack[]>('setupPacks').catch(() => [] as Pack[]), []);
  const { data: all } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  const projects = (all ?? []).filter((s) => s.kind === 'project');
  const [step, setStep] = useState<Step>('what');
  const [choice, setChoice] = useState<Choice>();
  const [project, setProject] = useState<string>();
  // A program of your own.
  const [spaces, setSpaces] = useState<string[]>([]);
  const [where, setWhere] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [reads, setReads] = useState<'nothing' | 'addressed' | 'kinds' | 'space'>('addressed');
  const [readKinds, setReadKinds] = useState('');
  const [writes, setWrites] = useState('');
  const [website, setWebsite] = useState(false);
  const contract: ServiceContract = { reads: reads === 'kinds' ? { kinds: kinds(readKinds) } : reads, writes: kinds(writes), ...(website ? { website: true } : {}), version: '1.0' };

  const own = choice?.kind === 'own';
  const steps: Step[] = own ? ['what', 'spaces', 'where', 'how'] : ['what', 'project'];
  const at = steps.indexOf(step) + 1;
  const pick = (c: Choice) => (setChoice(c), setStep(c.kind === 'own' ? 'spaces' : 'project'));
  const back = () => setStep(steps[Math.max(0, steps.indexOf(step) - 1)]);

  // A project picked for one from a catalog: that project's catalog takes it from here, with its settings.
  const picked = all?.find((s) => s.id === project);
  if (step === 'catalog' && picked && choice && choice.kind !== 'own')
    return <CatalogFor project={picked} services={services ?? []} pick={choice.kind === 'pack' ? choice.pack.name : choice.kind === 'shipped' ? choice.shipped.name : undefined} onClose={onClose} />;

  const add = async () => {
    const done = await attempt(
      () => api('addService', { name: name.trim(), description, contract, spaces, ...(command.trim() ? { command: commandParts(command) } : {}), ...(where ? { node: where } : {}) }).then(() => (bump(), true)),
      t(where ? 'svc.set.up.on.node' : 'svc.set.up', { name, node: where }),
    );
    if (done !== undefined) onClose();
  };
  const title = step === 'what' ? t('addwiz.title') : t('addwiz.title.step', { step: at, steps: steps.length });

  return (
    <Modal title={title} onClose={onClose} wide>
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
            <ServiceTile icon="code" heading={t('addwiz.own')} about={t('addwiz.own.about')} onClick={() => pick({ kind: 'own' })} />
          </div>
          {(!shipped || !packs) && <p className="small muted">{t('addservice.looking')}</p>}
        </>
      )}

      {step === 'project' && choice && (
        <>
          <h3 className="wizard-question">{t('addwiz.which.project', { name: choiceName(choice, t) })}</h3>
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

      {step === 'spaces' && (
        <>
          <h3 className="wizard-question">{t('addwiz.which.spaces')}</h3>
          <SpaceChecks spaces={all ?? []} value={spaces} onChange={setSpaces} />
          <p className="small muted">{t('addwiz.spaces.note')}</p>
        </>
      )}

      {step === 'where' && (
        <>
          <h3 className="wizard-question">{t('addwiz.where')}</h3>
          <div className="wizard-options">
            <WhereOption id="here" checked={where === ''} onPick={() => setWhere('')} heading={t('addwiz.here')} about={t('addwiz.here.about')} />
            {nodes.map((n) => {
              const node = n.name!.slice(5);
              return <WhereOption key={n.did} id={node} checked={where === node} onPick={() => setWhere(node)} heading={t('addwiz.node', { node })} about={t('addwiz.node.about', { node })} />;
            })}
          </div>
          {!nodes.length && <p className="small muted">{t('addwiz.no.nodes')}</p>}
        </>
      )}

      {step === 'how' && (
        <>
          <h3 className="wizard-question">{t('addwiz.how')}</h3>
          <div className="field-row-stacked">
            <label htmlFor="svc-name">{t('field.name')}</label>
            <input id="svc-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder={t('svc.name.placeholder')} spellCheck={false} autoFocus />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="svc-description">{t('svc.what.it.does')}</label>
            <input id="svc-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('svc.description.placeholder')} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="svc-command">{t('svc.how.start')}</label>
            <input id="svc-command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder={t('svc.command.placeholder')} spellCheck={false} />
            <span className="small muted">{t(where ? 'addwiz.command.node' : 'addwiz.command.here', { node: where })}</span>
          </div>
          <button className="link" onClick={() => setAdvanced(!advanced)}>
            {advanced ? '▾' : '▸'} {t('addwiz.advanced')}
          </button>
          {advanced && (
            <div className="wizard-advanced">
              <fieldset>
                <legend>{t('svc.what.it.reads')}</legend>
                {(['addressed', 'nothing', 'space'] as const).map((r) => (
                  <div className="field-row" key={r}>
                    <input type="radio" id={`svc-reads-${r}`} checked={reads === r} onChange={() => setReads(r)} />
                    <label htmlFor={`svc-reads-${r}`}>{t(`svc.reads.${r}`)}</label>
                  </div>
                ))}
                <div className="field-row">
                  <input type="radio" id="svc-reads-kinds" checked={reads === 'kinds'} onChange={() => setReads('kinds')} />
                  <label htmlFor="svc-reads-kinds">{t('svc.reads.kinds')}</label>
                  <input className="grow" value={readKinds} onChange={(e) => (setReadKinds(e.target.value), setReads('kinds'))} placeholder={t('svc.kinds.placeholder')} spellCheck={false} />
                </div>
              </fieldset>
              <div className="field-row-stacked">
                <label htmlFor="svc-writes">{t('svc.what.it.writes')}</label>
                <input id="svc-writes" value={writes} onChange={(e) => setWrites(e.target.value)} placeholder={t('svc.writes.placeholder')} spellCheck={false} />
              </div>
              <div className="field-row">
                <input type="checkbox" id="svc-website" checked={website} onChange={(e) => setWebsite(e.target.checked)} />
                <label htmlFor="svc-website">{t('svc.serves.website')}</label>
              </div>
              <p className="small muted">{t('svc.command.note')}</p>
            </div>
          )}
          <p className="small">
            <b>{t('svc.its.contract')}</b> {contractText(contract)}.
          </p>
        </>
      )}

      <div className="buttons">
        {step !== 'what' && <button onClick={back}>{t('addwiz.back')}</button>}
        <span className="grow" />
        <button onClick={onClose}>{t('button.cancel')}</button>
        {step === 'project' && (
          <button className="default" disabled={!project} onClick={() => setStep('catalog')}>
            {t('addwiz.next')}
          </button>
        )}
        {(step === 'spaces' || step === 'where') && (
          <button className="default" onClick={() => setStep(step === 'spaces' ? 'where' : 'how')}>
            {t('addwiz.next')}
          </button>
        )}
        {step === 'how' && (
          <AsyncButton className="default" disabled={!name.trim()} onClick={add}>
            {t('svc.add.button')}
          </AsyncButton>
        )}
      </div>
    </Modal>
  );
}

const choiceName = (c: Choice, t: (name: string, values?: Record<string, unknown>) => string) => (c.kind === 'pack' ? c.pack.title : c.kind === 'shipped' ? c.shipped.title : t('addwiz.a.service'));

/** One place a service can run, as a choice with what that means. */
function WhereOption({ id, checked, onPick, heading, about }: { id: string; checked: boolean; onPick(): void; heading: string; about: string }) {
  return (
    <div className="field-row wizard-option">
      <input type="radio" name="addwiz-where" id={`addwiz-where-${id}`} checked={checked} onChange={onPick} />
      <label htmlFor={`addwiz-where-${id}`}>
        <b>{heading}</b>
        <div className="small muted">{about}</div>
      </label>
    </div>
  );
}

/** Projects, then groups, then communities: each with a box to tick. */
function SpaceChecks({ spaces, value, onChange }: { spaces: SpaceInfo[]; value: string[]; onChange(ids: string[]): void }) {
  const { t } = useTexts();
  const sections = (['project', 'group', 'community'] as const).map((kind) => ({ kind, list: spaces.filter((s) => s.kind === kind) })).filter((s) => s.list.length);
  if (!sections.length) return <p className="small muted">{t('svc.no.spaces')}</p>;
  return (
    <div className="sunken service-spaces">
      {sections.map(({ kind, list }) => (
        <div key={kind}>
          <div className="small muted wizard-section">{t(`addwiz.section.${kind}`)}</div>
          {list.map((s) => (
            <div className="field-row" key={s.id}>
              <input type="checkbox" id={`svc-space-${s.id}`} checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))} />
              <label htmlFor={`svc-space-${s.id}`}>{s.name}</label>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** That project's catalog, opened at the one picked (or at all it offers). */
function CatalogFor({ project, services, pick, onClose }: { project: SpaceInfo; services: ServiceInfo[]; pick: string | undefined; onClose(): void }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  if (!info) return null;
  return <ServiceCatalog project={project} services={services} maintainer={!!info.maintainer} {...(pick ? { pick } : {})} onClose={onClose} />;
}
