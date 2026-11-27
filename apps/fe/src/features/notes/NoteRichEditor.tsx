'use client';

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

interface NoteRichEditorProps {
  initialContent: string;
  onChange: (html: string) => void;
}

function toSafeInitialHtml(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // Strip any script tags or inline event handlers
  const cleaned = trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  if (/<[a-z][\s\S]*>/i.test(cleaned)) {
    return cleaned;
  }
  return cleaned
    .split('\n')
    .map((line) => (line ? `<p>${line}</p>` : '<p><br></p>'))
    .join('');
}

/**
 * Apple Notes-inspired rich text editor with formatting, lists, indentation, and alignment.
 */
export function NoteRichEditor({
  initialContent,
  onChange,
}: NoteRichEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || initializedRef.current) return;
    el.innerHTML = toSafeInitialHtml(initialContent);
    initializedRef.current = true;
  }, [initialContent]);

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }

  const toolbarGroups = [
    [
      { icon: Undo2, label: 'Hoàn tác', cmd: 'undo' },
      { icon: Redo2, label: 'Làm lại', cmd: 'redo' },
    ],
    [
      { icon: Heading2, label: 'Tiêu đề', cmd: 'formatBlock', val: 'H2' },
      { icon: Bold, label: 'In đậm', cmd: 'bold' },
      { icon: Italic, label: 'In nghiêng', cmd: 'italic' },
      { icon: Underline, label: 'Gạch chân', cmd: 'underline' },
      { icon: Strikethrough, label: 'Gạch ngang', cmd: 'strikeThrough' },
    ],
    [
      { icon: List, label: 'Danh sách chấm', cmd: 'insertUnorderedList' },
      { icon: ListOrdered, label: 'Danh sách số', cmd: 'insertOrderedList' },
      { icon: IndentIncrease, label: 'Thụt lề vào', cmd: 'indent' },
      { icon: IndentDecrease, label: 'Giảm thụt lề', cmd: 'outdent' },
    ],
    [
      { icon: AlignLeft, label: 'Căn trái', cmd: 'justifyLeft' },
      { icon: AlignCenter, label: 'Căn giữa', cmd: 'justifyCenter' },
      { icon: AlignRight, label: 'Căn phải', cmd: 'justifyRight' },
      { icon: AlignJustify, label: 'Căn đều', cmd: 'justifyFull' },
    ],
    [{ icon: RemoveFormatting, label: 'Xóa định dạng', cmd: 'removeFormat' }],
  ];

  return (
    <div className="space-y-4">
      <div
        role="toolbar"
        aria-label="Thanh công cụ định dạng ghi chú"
        className="sticky top-[57px] z-10 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/95 p-1.5 backdrop-blur-sm"
      >
        {toolbarGroups.map((group, groupIdx) => (
          <div
            key={groupIdx}
            className={`flex items-center gap-0.5 ${
              groupIdx < toolbarGroups.length - 1
                ? 'border-r border-slate-200 pr-1.5 mr-1'
                : ''
            }`}
          >
            {group.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec(item.cmd, item.val);
                  }}
                  className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white hover:text-blue-600 hover:shadow-2xs active:bg-blue-50"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Bắt đầu viết ghi chú..."
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        className="min-h-[55vh] w-full text-base leading-relaxed text-slate-800 focus:outline-none sm:min-h-[62vh] [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}
