import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PaginationParams } from '../lists/pagination.js';
import type { NoteRecord } from '../notes/notes.repository.js';
import type { TaskProgress } from './task-status.js';

export interface TaskRecord {
  id: string;
  ownerId: string;
  seriesId: string | null;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  progress: TaskProgress;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskRow {
  id: string;
  owner_id: string;
  series_id: string | null;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  progress: TaskProgress;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface NoteRow {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  starts_at: Date;
  updated_at: Date;
}

function mapTaskRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    seriesId: row.series_id,
    title: row.title,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    progress: row.progress,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TASK_SELECT = `
  id, owner_id, series_id, title,
  TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
  start_time::text AS start_time,
  end_time::text AS end_time,
  progress, completed_at, created_at, updated_at
`;

/**
 * PostgreSQL repository for owned tasks and task-note links.
 */
export class TasksRepository {
  constructor(private readonly pool: Pool) {}

  async createStandalone(
    ownerId: string,
    input: {
      title: string;
      scheduledDate: string;
      startTime: string;
      endTime: string;
      progress?: TaskProgress;
      completedAt?: Date | null;
    },
  ): Promise<TaskRecord> {
    const id = randomUUID();
    const progress = input.progress ?? 'TODO';
    const completedAt = progress === 'DONE' ? (input.completedAt ?? new Date()) : null;
    const result = await this.pool.query<TaskRow>(
      `INSERT INTO tasks (id, owner_id, title, scheduled_date, start_time, end_time, progress, completed_at)
       VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8::timestamptz)
       RETURNING ${TASK_SELECT}`,
      [
        id,
        ownerId,
        input.title,
        input.scheduledDate,
        input.startTime,
        input.endTime,
        progress,
        completedAt,
      ],
    );
    return mapTaskRow(result.rows[0]);
  }

  async findOwnedById(ownerId: string, taskId: string): Promise<TaskRecord | null> {
    const result = await this.pool.query<TaskRow>(
      `SELECT ${TASK_SELECT}
       FROM tasks
       WHERE owner_id = $1 AND id = $2`,
      [ownerId, taskId],
    );
    return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
  }

  async listOwned(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<{ items: TaskRecord[]; totalItems: number }> {
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM tasks WHERE owner_id = $1`,
      [ownerId],
    );
    const totalItems = Number(countResult.rows[0].total);

    const rowsResult = await this.pool.query<TaskRow>(
      `SELECT ${TASK_SELECT}
       FROM tasks
       WHERE owner_id = $1
       ORDER BY scheduled_date ASC, start_time ASC, id ASC
       LIMIT $2 OFFSET $3`,
      [ownerId, pagination.limit, pagination.offset],
    );

    return {
      items: rowsResult.rows.map(mapTaskRow),
      totalItems,
    };
  }

  async updateOwned(
    ownerId: string,
    taskId: string,
    patch: {
      title?: string;
      scheduledDate?: string;
      startTime?: string;
      endTime?: string;
    },
  ): Promise<TaskRecord | null> {
    const result = await this.pool.query<TaskRow>(
      `UPDATE tasks
       SET title = COALESCE($3, title),
           scheduled_date = COALESCE($4::date, scheduled_date),
           start_time = COALESCE($5::time, start_time),
           end_time = COALESCE($6::time, end_time),
           updated_at = NOW()
       WHERE owner_id = $1 AND id = $2
       RETURNING ${TASK_SELECT}`,
      [
        ownerId,
        taskId,
        patch.title ?? null,
        patch.scheduledDate ?? null,
        patch.startTime ?? null,
        patch.endTime ?? null,
      ],
    );
    return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
  }

  async setProgress(
    ownerId: string,
    taskId: string,
    progress: TaskProgress,
    now: Date,
  ): Promise<TaskRecord | null> {
    const result = await this.pool.query<TaskRow>(
      `UPDATE tasks
       SET progress = $3,
           completed_at = CASE
             WHEN $3 = 'DONE' THEN COALESCE(completed_at, $4::timestamptz)
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE owner_id = $1 AND id = $2
       RETURNING ${TASK_SELECT}`,
      [ownerId, taskId, progress, now],
    );
    return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
  }

  async deleteOwned(ownerId: string, taskId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM tasks WHERE owner_id = $1 AND id = $2`,
      [ownerId, taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async linkOwnedNote(
    ownerId: string,
    taskId: string,
    noteId: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO task_notes (owner_id, task_id, note_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (task_id, note_id) DO NOTHING`,
      [ownerId, taskId, noteId],
    );
  }

  async unlinkOwnedNote(
    ownerId: string,
    taskId: string,
    noteId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM task_notes
       WHERE owner_id = $1 AND task_id = $2 AND note_id = $3`,
      [ownerId, taskId, noteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listLinkedNotes(
    ownerId: string,
    taskId: string,
    pagination: PaginationParams,
  ): Promise<{ items: NoteRecord[]; totalItems: number }> {
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM task_notes tn
       JOIN notes n ON n.owner_id = tn.owner_id AND n.id = tn.note_id
       WHERE tn.owner_id = $1 AND tn.task_id = $2 AND n.deleted_at IS NULL`,
      [ownerId, taskId],
    );
    const totalItems = Number(countResult.rows[0].total);

    const rowsResult = await this.pool.query<NoteRow>(
      `SELECT n.id, n.owner_id, n.title, n.body, n.starts_at, n.updated_at
       FROM task_notes tn
       JOIN notes n ON n.owner_id = tn.owner_id AND n.id = tn.note_id
       WHERE tn.owner_id = $1 AND tn.task_id = $2 AND n.deleted_at IS NULL
       ORDER BY n.updated_at DESC, n.id ASC
       LIMIT $3 OFFSET $4`,
      [ownerId, taskId, pagination.limit, pagination.offset],
    );

    return {
      items: rowsResult.rows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        title: row.title,
        body: row.body,
        startsAt: row.starts_at,
        updatedAt: row.updated_at,
      })),
      totalItems,
    };
  }
}
