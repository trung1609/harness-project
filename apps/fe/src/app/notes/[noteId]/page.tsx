'use client';

import { AlertTriangle, ArrowLeft, Check, Clock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NoteRichEditor } from '../../../features/notes/NoteRichEditor';
import { createNotesApiClient } from '../../../features/notes/notes-api';
import { formatDateTimeVi } from '../../../features/tasks/workspace-helpers';
import { useToast } from '../../../features/ui/ToastProvider';

const notesApi = createNotesApiClient();

export default function NoteEditorPage() {
  const params = useParams<{ noteId: string }>();
  const router = useRouter();
  const toast = useToast();
  const noteId = params?.noteId ?? 'new';
  const isNew = noteId === 'new';

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [timestamp, setTimestamp] = useState<string>(() => new Date().toISOString());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    void notesApi
      .getNote(noteId)
      .then((note) => {
        if (!active) return;
        setTitle(note.title);
        setBody(note.body);
        setTimestamp(note.updatedAt || note.startsAt);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Không thể tải ghi chú.',
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isNew, noteId]);

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Vui lòng nhập tiêu đề ghi chú.');
      return;
    }
    setErrorMsg(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await notesApi.createNote({
          title: title.trim(),
          body,
        });
        toast.success('Đã lưu ghi chú mới.');
        router.replace(`/notes/${created.id}`);
      } else {
        const updated = await notesApi.updateNote(noteId, {
          title: title.trim(),
          body,
        });
        setTimestamp(updated.updatedAt);
        toast.success('Đã cập nhật ghi chú.');
        router.push('/workspace?tab=notes');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể lưu ghi chú.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    setSaving(true);
    try {
      await notesApi.deleteNote(noteId);
      router.replace('/workspace?tab=notes');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa ghi chú.');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Minimal Apple Notes-style top bar */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/workspace?tab=notes"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Ghi chú
          </Link>

          <span className="hidden items-center gap-1 text-xs text-slate-400 sm:inline-flex">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            {formatDateTimeVi(timestamp)}
          </span>

          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                type="button"
                aria-label="Xóa ghi chú"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" strokeWidth={2} />
              {saving ? 'Đang lưu...' : 'Xong'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        {errorMsg && (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm text-rose-700">
            {errorMsg}
          </p>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Đang mở ghi chú...
          </p>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              autoFocus
              placeholder="Tiêu đề"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-slate-900 placeholder:text-slate-300 focus:outline-none sm:text-3xl"
            />
            <NoteRichEditor
              key={isNew ? 'new' : noteId}
              initialContent={body}
              onChange={setBody}
            />
          </div>
        )}
      </main>

      {confirmDelete && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Xóa ghi chú?
              </h2>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              Bạn có chắc chắn muốn xóa ghi chú <strong>{title || 'này'}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
