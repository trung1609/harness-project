import { apiFetch, type ApiFetchOptions } from '../../lib/api/client';
import type { NoteItem, PaginatedResponse } from '../notes/notes-api';

export type TaskProgress = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskDisplayStatus =
  | 'NOT_STARTED'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'OVERDUE';

export interface TaskItem {
  id: string;
  ownerId: string;
  seriesId: string | null;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  progress: TaskProgress;
  displayStatus: TaskDisplayStatus;
  lateDays: number;
  completedAt: string | null;
}

export interface TimetableWeekResponse {
  weekStart: string;
  weekEnd: string;
  dates: string[];
  tasks: TaskItem[];
}

export function createTasksApiClient(
  baseOptions: Pick<ApiFetchOptions, 'fetchImpl' | 'baseUrl' | 'cookieSource'> = {},
) {
  return {
    getTimetableWeek(weekStart: string) {
      return apiFetch<TimetableWeekResponse>(
        `/timetable/weeks?weekStart=${encodeURIComponent(weekStart)}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    listTasks(page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<TaskItem>>(
        `/tasks?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    createTask(input: {
      title: string;
      scheduledDate: string;
      startTime: string;
      endTime: string;
      progress?: TaskProgress;
    }) {
      return apiFetch<TaskItem>('/tasks', {
        ...baseOptions,
        method: 'POST',
        body: input,
      });
    },
    createWeeklySeries(input: {
      title: string;
      scheduledDate: string;
      startTime: string;
      endTime: string;
      progress?: TaskProgress;
    }) {
      return apiFetch<{ seriesId: string; occurrences: TaskItem[] }>(
        '/task-series',
        {
          ...baseOptions,
          method: 'POST',
          body: input,
        },
      );
    },
    setProgress(taskId: string, progress: TaskProgress) {
      return apiFetch<TaskItem>(`/tasks/${encodeURIComponent(taskId)}/progress`, {
        ...baseOptions,
        method: 'PUT',
        body: { progress },
      });
    },
    updateTask(
      taskId: string,
      patch: {
        title?: string;
        scheduledDate?: string;
        startTime?: string;
        endTime?: string;
      },
    ) {
      return apiFetch<TaskItem>(`/tasks/${encodeURIComponent(taskId)}`, {
        ...baseOptions,
        method: 'PATCH',
        body: patch,
      });
    },
    editSeries(
      seriesId: string,
      anchorTaskId: string,
      selection: {
        scope: 'CURRENT' | 'SELECTED' | 'ALL';
        additionalTaskIds?: string[];
      },
      changes: {
        title?: string;
        scheduledDate?: string;
        startTime?: string;
        endTime?: string;
      },
    ) {
      return apiFetch<TaskItem[]>(
        `/task-series/${encodeURIComponent(seriesId)}/weeks/${encodeURIComponent(anchorTaskId)}`,
        {
          ...baseOptions,
          method: 'PATCH',
          body: { selection, changes },
        },
      );
    },
    deleteTask(taskId: string) {
      return apiFetch<void>(`/tasks/${encodeURIComponent(taskId)}`, {
        ...baseOptions,
        method: 'DELETE',
      });
    },
    deleteSeriesOccurrences(
      seriesId: string,
      spec: {
        scope: 'SELECTED_FUTURE' | 'EXCEPT_DISPLAYED_WEEK' | 'ALL';
        weekStart?: string;
        taskIds?: string[];
      },
    ) {
      return apiFetch<{ deletedCount: number }>(
        `/task-series/${encodeURIComponent(seriesId)}/deletions`,
        {
          ...baseOptions,
          method: 'POST',
          body: spec,
        },
      );
    },
    listTaskNotes(taskId: string, page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<NoteItem>>(
        `/tasks/${encodeURIComponent(taskId)}/notes?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    linkNote(taskId: string, noteId: string) {
      return apiFetch<void>(
        `/tasks/${encodeURIComponent(taskId)}/notes/${encodeURIComponent(noteId)}`,
        { ...baseOptions, method: 'PUT' },
      );
    },
    unlinkNote(taskId: string, noteId: string) {
      return apiFetch<void>(
        `/tasks/${encodeURIComponent(taskId)}/notes/${encodeURIComponent(noteId)}`,
        { ...baseOptions, method: 'DELETE' },
      );
    },
  };
}
