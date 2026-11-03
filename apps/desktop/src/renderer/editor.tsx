import { useEffect, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { Icon, type IconName } from './icons.tsx';
import { uploadImage } from './lib.ts';
import { ask, attempt, BlobImage } from './ui.tsx';
import { t, useTexts } from './texts.tsx';

/*
 * The editor for posts and project pages: what you see is what you get, with
 * a Win95 toolbar, stored as Markdown so the CLI and agents read and write the
 * same text. Images are uploaded as encrypted blobs (wblob: references) by
 * button, paste or drop. "Source" edits the Markdown directly, which is also
 * the way to write HTML: the visual editor would drop tags it doesn't know.
 */

/** Images show through the blob loader, since wblob: isn't a URL the browser can fetch. */
function ImageView({ node, selected }: NodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const alt = String(node.attrs.alt ?? '');
  return (
    <NodeViewWrapper as="span" className={`editor-image${selected ? ' selected' : ''}`}>
      {src.startsWith('wblob:') ? <BlobImage src={src} alt={alt} /> : <span className="blob-missing">{alt || t('editor.image')}</span>}
    </NodeViewWrapper>
  );
}

const BlobImageNode = Image.extend({ addNodeView: () => ReactNodeViewRenderer(ImageView) }).configure({ inline: false });

/** Does this Markdown hold HTML the visual editor would lose? */
const hasHtml = (markdown: string) => /<(?!br\s*\/?>)[a-z][^>]*>/i.test(markdown.replace(/```[\s\S]*?```|`[^`]*`/g, ''));

async function insertImages(editor: Editor, files: File[], at?: number): Promise<void> {
  for (const file of files.filter((f) => f.type.startsWith('image/'))) {
    const src = await attempt(() => uploadImage(file));
    if (!src) continue;
    const image = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
    if (at === undefined) editor.chain().focus().insertContent(image).run();
    else editor.chain().focus().insertContentAt(at, image).run();
  }
}

function ToolButton({ icon, label, text, active, disabled, onClick }: { icon?: IconName; label: string; text?: string; active?: boolean; disabled?: boolean; onClick(): void }) {
  return (
    <button type="button" className={`tool${active ? ' active' : ''}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon ? <Icon name={icon} /> : <span className="tool-text">{text}</span>}
    </button>
  );
}

function Toolbar({ editor, source, onSource, onImage }: { editor: Editor; source: boolean; onSource(): void; onImage(): void }) {
  const { t } = useTexts();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const link = () => {
    if (state.link) return void chain().unsetLink().run();
    const href = prompt(t('editor.link.address'))?.trim();
    if (href && /^https?:\/\//.test(href)) chain().extendMarkRange('link').setLink({ href }).run();
  };
  const off = source;
  return (
    <div className="editor-toolbar" role="toolbar" aria-label={t('editor.formatting')}>
      <ToolButton text="B" label={t('editor.bold')} active={state.bold} disabled={off} onClick={() => chain().toggleBold().run()} />
      <ToolButton text="I" label={t('editor.italic')} active={state.italic} disabled={off} onClick={() => chain().toggleItalic().run()} />
      <ToolButton text="S" label={t('editor.strike')} active={state.strike} disabled={off} onClick={() => chain().toggleStrike().run()} />
      <ToolButton icon="code" label={t('editor.code')} active={state.code} disabled={off} onClick={() => chain().toggleCode().run()} />
      <span className="tool-sep" />
      <ToolButton icon="heading2" label={t('editor.heading')} active={state.h2} disabled={off} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon="heading3" label={t('editor.subheading')} active={state.h3} disabled={off} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <ToolButton icon="bulletList" label={t('editor.bullets')} active={state.bullet} disabled={off} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton text="1." label={t('editor.numbered')} active={state.ordered} disabled={off} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon="quote" label={t('editor.quote')} active={state.quote} disabled={off} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton text="{ }" label={t('editor.code.block')} active={state.codeBlock} disabled={off} onClick={() => chain().toggleCodeBlock().run()} />
      <span className="tool-sep" />
      <ToolButton icon="link" label={t(state.link ? 'editor.link.remove' : 'editor.link')} active={state.link} disabled={off} onClick={link} />
      <ToolButton icon="image" label={t('editor.insert.image')} disabled={off} onClick={onImage} />
      <span className="tool-sep" />
      <ToolButton icon="undo" label={t('editor.undo')} disabled={off || !state.undo} onClick={() => chain().undo().run()} />
      <ToolButton icon="redo" label={t('editor.redo')} disabled={off || !state.redo} onClick={() => chain().redo().run()} />
      <span className="grow" />
      <ToolButton icon="eye" text={t('editor.source')} label={t(source ? 'editor.visual' : 'editor.source.edit')} active={source} onClick={onSource} />
    </div>
  );
}

export function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
  autoFocus,
  max,
}: {
  value: string;
  onChange(markdown: string): void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  /** The most characters Weave keeps (Markdown, as stored): shows a counter. */
  max?: number;
}) {
  const { t } = useTexts();
  // Text with HTML opens in the source view, so nothing is lost by accident.
  const [source, setSource] = useState(() => hasHtml(value));
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } }), Markdown, BlobImageNode, Placeholder.configure({ placeholder: placeholder ?? '' })],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: e }) => onChange(e.getMarkdown()),
    editorProps: {
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length || !editorRef.current) return false;
        void insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length || !editorRef.current) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(editorRef.current, files, at);
        return true;
      },
    },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Someone else changed the value (e.g. a form reset): show it.
  useEffect(() => {
    if (editor && !source && value !== editor.getMarkdown()) editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [value, editor, source]);

  if (!editor) return null;
  const toggleSource = async () => {
    if (source && hasHtml(value) && !(await ask(t('editor.html.ask'), t('editor.switch')))) return;
    if (source) editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    setSource(!source);
  };
  return (
    <div className="rich-editor sunken">
      <Toolbar editor={editor} source={source} onSource={() => void toggleSource()} onImage={() => fileInput.current?.click()} />
      {source ? (
        <textarea className="editor-source" style={{ minHeight }} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-label={t('editor.markdown.source')} />
      ) : (
        <EditorContent editor={editor} className="editor-body md" style={{ minHeight }} />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void insertImages(editor, [...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {max !== undefined && <CharCount length={value.length} max={max} />}
    </div>
  );
}

/** "1,234 / 10,000", warning near the limit and saying what to do past it. */
export function CharCount({ length, max, onlyNear }: { length: number; max: number; onlyNear?: boolean }) {
  const { t } = useTexts();
  const near = length > max * 0.9;
  if (onlyNear && !near) return null;
  const over = length > max;
  return (
    <div className={`char-count${over ? ' over' : near ? ' near' : ''}`} aria-live="polite">
      {over ? t('editor.too.many', { over: length - max, length, max }) : t('editor.count', { length, max })}
    </div>
  );
}

/** Pick, show and replace one image (a project's icon or banner). */
export function ImagePicker({ value, onChange, label, wide }: { value?: string; onChange(ref: string): void; label: string; wide?: boolean }) {
  const { t } = useTexts();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className={`image-picker${wide ? ' wide' : ''}`}>
      <div className="image-picker-frame sunken">{value ? <BlobImage src={value} alt={label} /> : <span className="small muted">{t('image.none', { what: label.toLowerCase() })}</span>}</div>
      <div className="image-picker-buttons">
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {value ? t('image.change') : t('image.add', { what: label.toLowerCase() })}
        </button>
        {value && (
          <button type="button" onClick={() => onChange('')}>
            {t('button.remove')}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          const ref = await attempt(() => uploadImage(file, wide ? 1800 : 512));
          setBusy(false);
          if (ref) onChange(ref);
        }}
      />
    </div>
  );
}
