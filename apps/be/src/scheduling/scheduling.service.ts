import {
  computeTaskStatus,
  validateSameDaySlot,
  validateScheduledDate,
} from '../tasks/task-status.js';
import type { TaskView } from '../tasks/tasks.service.js';
import type {
  SchedulingRepository,
  SeriesDeleteScope,
  SeriesEditScope,
} from './scheduling.repository.js';
import {
  generateWeeklyMonthDates,
  monthStartOf,
  resolveTimetableWeekRange,
} from './vietnam-dates.js';

function toTaskView(
  task: Awaited<ReturnType<SchedulingRepository['listWeekTasks']>>[number],
  now: Date,
): TaskView {
  const status = computeTaskStatus(
    {
      scheduledDate: task.scheduledDate,
      startTime: task.startTime,
      progress: task.progress,
      completedAt: task.completedAt,
    },
    now,
  );
  return { ...task, ...status };
}

/**
 * Application service for weekly recurring series and timetable week queries.
 */
export class SchedulingService {
  constructor(private readonly scheduling: SchedulingRepository) {}

  async createWeeklySeries(
    ownerId: string,
    input: {
      title: string;
      scheduledDate: string;
      startTime: string;
      endTime: string;
      progress?: 'TODO' | 'IN_PROGRESS' | 'DONE';
    },
    now: Date = new Date(),
  ): Promise<{ seriesId: string; occurrences: TaskView[] }> {
    const startDate = validateScheduledDate(input.scheduledDate);
    const slot = validateSameDaySlot(input.startTime, input.endTime);
    const seriesMonth = monthStartOf(startDate);
    const dates = generateWeeklyMonthDates(startDate);

    const created = await this.scheduling.createWeeklySeries(
      ownerId,
      seriesMonth,
      dates,
      {
        title: input.title,
        startTime: slot.startTime,
        endTime: slot.endTime,
        progress: input.progress,
        completedAt: input.progress === 'DONE' ? now : null,
      },
    );

    return {
      seriesId: created.seriesId,
      occurrences: created.occurrences.map((occ) => toTaskView(occ, now)),
    };
  }

  async getTimetableWeek(
    ownerId: string,
    weekStartStr: string,
    now: Date = new Date(),
  ): Promise<{
    weekStart: string;
    weekEnd: string;
    dates: string[];
    tasks: TaskView[];
  }> {
    const range = resolveTimetableWeekRange(weekStartStr);
    const tasks = await this.scheduling.listWeekTasks(
      ownerId,
      range.weekStart,
      range.weekEnd,
    );
    return {
      ...range,
      tasks: tasks.map((t) => toTaskView(t, now)),
    };
  }

  async editSeries(
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
    now: Date = new Date(),
  ): Promise<TaskView[]> {
    const scheduledDate = changes.scheduledDate
      ? validateScheduledDate(changes.scheduledDate)
      : undefined;

    let startTime = changes.startTime;
    let endTime = changes.endTime;
    if (startTime !== undefined && endTime !== undefined) {
      const slot = validateSameDaySlot(startTime, endTime);
      startTime = slot.startTime;
      endTime = slot.endTime;
    }

    const updated = await this.scheduling.editSeriesOccurrences(
      ownerId,
      seriesId,
      anchorTaskId,
      selection,
      {
        title: changes.title,
        scheduledDate,
        startTime,
        endTime,
      },
    );
    return updated.map((t) => toTaskView(t, now));
  }

  async deleteSeriesOccurrences(
    ownerId: string,
    seriesId: string,
    spec: {
      scope: SeriesDeleteScope;
      weekStart?: string;
      taskIds?: string[];
    },
  ): Promise<{ deletedCount: number }> {
    if (spec.scope === 'EXCEPT_DISPLAYED_WEEK') {
      if (!spec.weekStart) {
        throw new Error('weekStart is required for EXCEPT_DISPLAYED_WEEK');
      }
      const range = resolveTimetableWeekRange(spec.weekStart);
      return this.scheduling.deleteSeriesOccurrences(ownerId, seriesId, {
        scope: spec.scope,
        weekStart: range.weekStart,
        weekEnd: range.weekEnd,
      });
    }

    return this.scheduling.deleteSeriesOccurrences(ownerId, seriesId, spec);
  }
}
