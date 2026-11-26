import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { TaskRecord } from '../tasks/tasks.repository.js';
import { addDays, diffDays, monthEndOf } from './vietnam-dates.js';

export class SeriesConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeriesConflictError';
  }
}

export class SeriesNotFoundError extends Error {
  constructor(message: string = 'Task series not found') {
    super(message);
    this.name = 'SeriesNotFoundError';
  }
}

export type SeriesEditScope = 'CURRENT' | 'SELECTED' | 'ALL';
export type SeriesDeleteScope =
  | 'SELECTED_FUTURE'
  | 'EXCEPT_DISPLAYED_WEEK'
  | 'ALL';

interface TaskRow {
  id: string;
  owner_id: string;
  series_id: string | null;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  progress: 'TODO' | 'IN_PROGRESS' | 'DONE';
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const TASK_SELECT = `
  id, owner_id, series_id, title,
  TO_CHAR(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
  start_time::text AS start_time,
  end_time::text AS end_time,
  progress, completed_at, created_at, updated_at
`;

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

/**
 * PostgreSQL repository for monthly weekly series and timetable queries.
 */
export class SchedulingRepository {
  constructor(private readonly pool: Pool) {}

  async createWeeklySeries(
    ownerId: string,
    seriesMonth: string,
    dates: string[],
    input: { title: string; startTime: string; endTime: string },
  ): Promise<{ seriesId: string; occurrences: TaskRecord[] }> {
    const seriesId = randomUUID();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO task_series (id, owner_id, series_month)
         VALUES ($1, $2, $3::date)`,
        [seriesId, ownerId, seriesMonth],
      );

      const occurrences: TaskRecord[] = [];
      for (const scheduledDate of dates) {
        const res = await client.query<TaskRow>(
          `INSERT INTO tasks
             (id, owner_id, series_id, title, scheduled_date, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5::date, $6::time, $7::time)
           RETURNING ${TASK_SELECT}`,
          [
            randomUUID(),
            ownerId,
            seriesId,
            input.title,
            scheduledDate,
            input.startTime,
            input.endTime,
          ],
        );
        occurrences.push(mapTaskRow(res.rows[0]));
      }

      await client.query('COMMIT');
      return { seriesId, occurrences };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listWeekTasks(
    ownerId: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<TaskRecord[]> {
    const res = await this.pool.query<TaskRow>(
      `SELECT ${TASK_SELECT}
       FROM tasks
       WHERE owner_id = $1
         AND scheduled_date BETWEEN $2::date AND $3::date
       ORDER BY scheduled_date ASC, start_time ASC, id ASC`,
      [ownerId, weekStart, weekEnd],
    );
    return res.rows.map(mapTaskRow);
  }

  async editSeriesOccurrences(
    ownerId: string,
    seriesId: string,
    anchorTaskId: string,
    selection: { scope: SeriesEditScope; additionalTaskIds?: string[] },
    changes: {
      title?: string;
      scheduledDate?: string;
      startTime?: string;
      endTime?: string;
    },
  ): Promise<TaskRecord[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const seriesRes = await client.query<{ series_month: string }>(
        `SELECT TO_CHAR(series_month, 'YYYY-MM-DD') AS series_month
         FROM task_series
         WHERE owner_id = $1 AND id = $2
         FOR UPDATE`,
        [ownerId, seriesId],
      );
      if (seriesRes.rows.length === 0) {
        throw new SeriesNotFoundError();
      }
      const seriesMonth = seriesRes.rows[0].series_month;
      const monthEnd = monthEndOf(seriesMonth);

      const occRes = await client.query<TaskRow>(
        `SELECT ${TASK_SELECT}
         FROM tasks
         WHERE owner_id = $1 AND series_id = $2
         ORDER BY scheduled_date ASC, id ASC
         FOR UPDATE`,
        [ownerId, seriesId],
      );
      const allOccurrences = occRes.rows.map(mapTaskRow);
      const byId = new Map(allOccurrences.map((t) => [t.id, t]));

      const anchor = byId.get(anchorTaskId);
      if (!anchor) {
        throw new SeriesNotFoundError('Anchor task not found in series');
      }

      const targetIds = new Set<string>();
      if (selection.scope === 'CURRENT') {
        targetIds.add(anchorTaskId);
      } else if (selection.scope === 'ALL') {
        for (const occ of allOccurrences) {
          targetIds.add(occ.id);
        }
      } else {
        targetIds.add(anchorTaskId);
        for (const extraId of selection.additionalTaskIds ?? []) {
          if (!byId.has(extraId)) {
            throw new SeriesConflictError(
              'Selected occurrence does not belong to the series',
            );
          }
          targetIds.add(extraId);
        }
      }

      const offsetDays = changes.scheduledDate
        ? diffDays(changes.scheduledDate, anchor.scheduledDate)
        : 0;

      const plannedDates = new Map<string, string>();
      const occupiedDates = new Set<string>();

      for (const occ of allOccurrences) {
        if (!targetIds.has(occ.id)) {
          occupiedDates.add(occ.scheduledDate);
          continue;
        }

        let targetDate = occ.scheduledDate;
        if (changes.scheduledDate) {
          targetDate = addDays(occ.scheduledDate, offsetDays);
          if (targetDate < seriesMonth) {
            throw new SeriesConflictError(
              'Date shift cannot move an occurrence into a previous month',
            );
          }
          if (targetDate > monthEnd) {
            targetDate = monthEnd;
          }
        }
        plannedDates.set(occ.id, targetDate);
      }

      for (const [, targetDate] of plannedDates) {
        if (occupiedDates.has(targetDate)) {
          throw new SeriesConflictError(
            'Date shift would place two occurrences on the same date',
          );
        }
        occupiedDates.add(targetDate);
      }

      const updated: TaskRecord[] = [];
      // Clear scheduled_date collision risk when shifting multiple rows by updating via temporary offset if needed
      if (changes.scheduledDate && targetIds.size > 1) {
        let index = 0;
        for (const occ of allOccurrences) {
          if (!targetIds.has(occ.id)) continue;
          index += 1;
          await client.query(
            `UPDATE tasks SET scheduled_date = ($2::date + $3::int) WHERE id = $1`,
            [occ.id, '1900-01-01', index],
          );
        }
      }

      for (const occ of allOccurrences) {
        if (!targetIds.has(occ.id)) {
          continue;
        }
        const nextDate = plannedDates.get(occ.id)!;
        const res = await client.query<TaskRow>(
          `UPDATE tasks
           SET title = COALESCE($3, title),
               scheduled_date = $4::date,
               start_time = COALESCE($5::time, start_time),
               end_time = COALESCE($6::time, end_time),
               updated_at = NOW()
           WHERE owner_id = $1 AND id = $2
           RETURNING ${TASK_SELECT}`,
          [
            ownerId,
            occ.id,
            changes.title ?? null,
            nextDate,
            changes.startTime ?? null,
            changes.endTime ?? null,
          ],
        );
        updated.push(mapTaskRow(res.rows[0]));
      }

      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteSeriesOccurrences(
    ownerId: string,
    seriesId: string,
    spec: {
      scope: SeriesDeleteScope;
      weekStart?: string;
      weekEnd?: string;
      taskIds?: string[];
    },
  ): Promise<{ deletedCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const seriesRes = await client.query(
        `SELECT id FROM task_series WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
        [ownerId, seriesId],
      );
      if (seriesRes.rows.length === 0) {
        throw new SeriesNotFoundError();
      }

      let deletedCount = 0;
      if (spec.scope === 'ALL') {
        const res = await client.query(
          `DELETE FROM tasks WHERE owner_id = $1 AND series_id = $2`,
          [ownerId, seriesId],
        );
        deletedCount = res.rowCount ?? 0;
      } else if (spec.scope === 'EXCEPT_DISPLAYED_WEEK') {
        const res = await client.query(
          `DELETE FROM tasks
           WHERE owner_id = $1
             AND series_id = $2
             AND NOT (scheduled_date BETWEEN $3::date AND $4::date)`,
          [ownerId, seriesId, spec.weekStart, spec.weekEnd],
        );
        deletedCount = res.rowCount ?? 0;
      } else {
        const ids = spec.taskIds ?? [];
        const check = await client.query<{ id: string }>(
          `SELECT id FROM tasks
           WHERE owner_id = $1 AND series_id = $2 AND id = ANY($3::uuid[])`,
          [ownerId, seriesId, ids],
        );
        if (check.rows.length !== ids.length) {
          throw new SeriesConflictError(
            'One or more selected occurrences do not belong to the series',
          );
        }
        const res = await client.query(
          `DELETE FROM tasks
           WHERE owner_id = $1 AND series_id = $2 AND id = ANY($3::uuid[])`,
          [ownerId, seriesId, ids],
        );
        deletedCount = res.rowCount ?? 0;
      }

      await client.query('COMMIT');
      return { deletedCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
