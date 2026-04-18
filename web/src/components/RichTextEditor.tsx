import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({ value, onChange, minHeight = 240 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep editor in sync when the `value` prop changes from outside (e.g. loading a template).
  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return <div style={{ minHeight, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }} />;

  const addLink = () => {
    const url = prompt('Link URL');
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = prompt('Image URL');
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const btn = (on: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      className="btn secondary"
      style={{ padding: '.25rem .55rem', fontSize: '.85rem', background: on ? 'var(--brand)' : 'transparent', color: on ? '#fff' : 'var(--brand)' }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#fff' }}>
      <div style={{ display: 'flex', gap: '.25rem', padding: '.4rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I')}
        {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'S')}
        {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2')}
        {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H3')}
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '• List')}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), '1. List')}
        {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), '“ Quote')}
        {btn(editor.isActive('link'), addLink, 'Link')}
        {btn(false, addImage, 'Image')}
        <span style={{ flex: 1 }} />
        {btn(false, () => editor.chain().focus().undo().run(), '↶')}
        {btn(false, () => editor.chain().focus().redo().run(), '↷')}
      </div>
      <div style={{ minHeight, padding: '.75rem' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
