import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { checkTexts, findHardcoded, namesUsed } from '../../../scripts/check-texts.ts';

describe('the texts check', () => {
  it('finds text written into components, attributes, labels and toasts, and lets names and symbols through', () => {
    const source = `
      const x = <div title="Open it" aria-label={\`Access to \${b.title}\`} className="card-title">
        Hello there <b>{name}</b> · p/{p}
        <input placeholder={post ? 'Chat about this post…' : \`Message #\${channel}\`} />
        <button title={t('post.reply')} aria-label="×">{t('menu.view')}</button>
      </div>;
      const items = [{ label: 'Home', onClick }, { label: t('menu.view.saved'), onClick }];
      toast(\`\${s.name} removed\`); ask(t('agent.revoke', { name }), t('agent.revoke.button'));
      attempt(() => api('x'), 'Taken in');
    `;
    const texts = findHardcoded('a.tsx', source).map((f) => f.text);
    expect(texts).toEqual(['Open it', 'Access to', 'Hello there', 'Chat about this post…', 'Message #', 'Home', 'removed', 'Taken in']);
  });

  it('collects the names code asks for, chosen in a conditional too, template names as prefixes, name-shaped strings as candidates', () => {
    const used = namesUsed('a.tsx', "t('a.b'); const l = t(`look.${s}`); <T name=\"c.d\" values={{}} />; texts.t('e.f'); t(big ? 'g.h' : 'i.j'); const m = { x: 'k.l' }; localStorage.getItem('weave.skin');");
    expect([...used.names]).toEqual(['a.b', 'c.d', 'e.f', 'g.h', 'i.j']);
    expect([...used.prefixes]).toEqual(['look.']);
    expect([...used.candidates]).toEqual(['a.b', 'c.d', 'e.f', 'g.h', 'i.j', 'k.l', 'weave.skin']);
  });

  it("lets the product's name and a toast's kind through", () => {
    expect(findHardcoded('a.tsx', "toast(t('x.y'), 'error'); const b = <b>Weave</b>;")).toEqual([]);
  });

  it('passes on this checkout: nothing hard-coded off the allowlist, packages in step with the code', () => {
    const result = checkTexts(resolve(import.meta.dirname, '../../..'));
    expect(result.errors).toEqual([]);
  });
});
