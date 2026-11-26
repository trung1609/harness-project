import {
  parsePagination,
  type PaginatedResult,
} from '../lists/pagination.js';
import type { NoteRecord, NotesRepository } from '../notes/notes.repository.js';
import { ResourceNotFoundError } from '../notes/notes.service.js';
import {
  computeTaskStatus,
  validateSameDaySlot,
  validateScheduledDate,
  type TaskDisplayStatus,
  type TaskProgress,
} from './task-status.js';
import type { TaskRecord, TasksRepository } from './tasks.repository.js';

export interface TaskView extends TaskRecord {
  displayStatus: TaskDisplayStatus;
  lateDays: number;
}

function toTaskView(record: TaskRecord, now: Date): TaskView {
  const status = computeTaskStatus(
    {
      scheduledDate: record.scheduledDate,
      startTime: record.startTime,
      progress: record.progress,
      completedAt: record.completedAt,
    },
    now,
  );
  return { ...record, ...status };
}

/**
 * Application service for owned daily tasks, progress transitions, and note links.
 */
export class TasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly notes: NotesRepository,
  ) {}

  async createTask(
    ownerId: string,
    input: {
      title: string;
      scheduledDate: string;
      startTime: string;
      endTime: string;
      progress?: TaskProgress;
    },
    now: Date = new Date(),
  ): Promise<TaskView> {
    const scheduledDate = validateScheduledDate(input.scheduledDate);
    const slot = validateSameDaySlot(input.startTime, input.endTime);

    const created = await this.tasks.createStandalone(ownerId, {
      title: input.title,
      scheduledDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      progress: input.progress,
      completedAt: input.progress === 'DONE' ? now : null,
    });
    return toTaskView(created, now);
  }

  async getTask(
    ownerId: string,
    taskId: string,
    now: Date = new Date(),
  ): Promise<TaskView> {
    const task = await this.tasks.findOwnedById(ownerId, taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task');
    }
    return toTaskView(task, now);
  }

  async listTasks(
    ownerId: string,
    rawPage?: unknown,
    rawPageSize?: unknown,
    now: Date = new Date(),
  ): Promise<PaginatedResult<TaskView>> {
    const pagination = parsePagination(rawPage, rawPageSize);
    const { items, totalItems } = await this.tasks.listOwned(
      ownerId,
      pagination,
    );
    return {
      items: items.map((item) => toTaskView(item, now)),
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    };
  }

  async updateTask(
    ownerId: string,
    taskId: string,
    patch: {
      title?: string;
      scheduledDate?: string;
      startTime?: string;
      endTime?: string;
    },
    now: Date = new Date(),
  ): Promise<TaskView> {
    const existing = await this.tasks.findOwnedById(ownerId, taskId);
    if (!existing) {
      throw new ResourceNotFoundError('Task');
    }

    const scheduledDate = patch.scheduledDate
      ? validateScheduledDate(patch.scheduledDate)
      : undefined;
    const slot = validateSameDaySlot(
      patch.startTime ?? existing.startTime,
      patch.endTime ?? existing.endTime,
    );

    const updated = await this.tasks.updateOwned(ownerId, taskId, {
      title: patch.title,
      scheduledDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    if (!updated) {
      throw new ResourceNotFoundError('Task');
    }
    return toTaskView(updated, now);
  }

  async setProgress(
    ownerId: string,
    taskId: string,
    progress: TaskProgress,
    now: Date = new Date(),
  ): Promise<TaskView> {
    const updated = await this.tasks.setProgress(ownerId, taskId, progress, now);
    if (!updated) {
      throw new ResourceNotFoundError('Task');
    }
    return toTaskView(updated, now);
  }

  async deleteTask(ownerId: string, taskId: string): Promise<void> {
    const deleted = await this.tasks.deleteOwned(ownerId, taskId);
    if (!deleted) {
      throw new ResourceNotFoundError('Task');
    }
  }

  async linkNote(
    ownerId: string,
    taskId: string,
    noteId: string,
  ): Promise<void> {
    const task = await this.tasks.findOwnedById(ownerId, taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task');
    }
    const note = await this.notes.findOwnedById(ownerId, noteId);
    if (!note) {
      throw new ResourceNotFoundError('Note');
    }
    await this.tasks.linkOwnedNote(ownerId, taskId, noteId);
  }

  async unlinkNote(
    ownerId: string,
    taskId: string,
    noteId: string,
  ): Promise<void> {
    const task = await this.tasks.findOwnedById(ownerId, taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task');
    }
    const removed = await this.tasks.unlinkOwnedNote(ownerId, taskId, noteId);
    if (!removed) {
      throw new ResourceNotFoundError('TaskNoteLink');
    }
  }

  async listTaskNotes(
    ownerId: string,
    taskId: string,
    rawPage?: unknown,
    rawPageSize?: unknown,
  ): Promise<PaginatedResult<NoteRecord>> {
    const task = await this.tasks.findOwnedById(ownerId, taskId);
    if (!task) {
      throw new ResourceNotFoundError('Task');
    }
    const pagination = parsePagination(rawPage, rawPageSize);
    const { items, totalItems } = await this.tasks.listLinkedNotes(
      ownerId,
      taskId,
      pagination,
    );
    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    };
  }
}
