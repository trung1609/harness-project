import { apiFetch, type ApiFetchOptions } from '../../lib/api/client';

export interface NoteItem {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  startsAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: 10 | 20 | 30 | 40 | 50;
  totalItems: number;
}

export function createNotesApiClient(
  baseOptions: Pick<ApiFetchOptions, 'fetchImpl' | 'baseUrl' | 'cookieSource'> = {},
) {
  return {
    listNotes(page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<NoteItem>>(
        `/notes?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    getNote(noteId: string) {
      return apiFetch<NoteItem>(`/notes/${encodeURIComponent(noteId)}`, {
        ...baseOptions,
        method: 'GET',
      });
    },
    createNote(input: { title: string; body: string; startsAt?: string }) {
      return apiFetch<NoteItem>('/notes', {
        ...baseOptions,
        method: 'POST',
        body: input,
      });
    },
    updateNote(
      noteId: string,
      patch: { title?: string; body?: string; startsAt?: string },
    ) {
      return apiFetch<NoteItem>(`/notes/${encodeURIComponent(noteId)}`, {
        ...baseOptions,
        method: 'PATCH',
        body: patch,
      });
    },
    deleteNote(noteId: string) {
      return apiFetch<void>(`/notes/${encodeURIComponent(noteId)}`, {
        ...baseOptions,
        method: 'DELETE',
      });
    },
    listArchivedNotes(page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<NoteItem>>(
        `/notes/archived?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    restoreNote(noteId: string) {
      return apiFetch<NoteItem>(`/notes/${encodeURIComponent(noteId)}/restore`, {
        ...baseOptions,
        method: 'POST',
      });
    },
    permanentlyDeleteNote(noteId: string) {
      return apiFetch<void>(`/notes/${encodeURIComponent(noteId)}/permanent`, {
        ...baseOptions,
        method: 'DELETE',
      });
    },
  };
}
