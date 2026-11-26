export type TaskProgress = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskDisplayStatus =
  | 'NOT_STARTED'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'OVERDUE';

export class InvalidTaskSlotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaskSlotError';
  }
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Normalizes HH:mm or HH:mm:ss to HH:mm:ss and validates same-day 24-hour slot ordering.
 */
export function validateSameDaySlot(
  startTime: string,
  endTime: string,
): { startTime: string; endTime: string } {
  const startMatch = TIME_PATTERN.exec(startTime);
  const endMatch = TIME_PATTERN.exec(endTime);
  if (!startMatch || !endMatch) {
    throw new InvalidTaskSlotError(
      'startTime and endTime must be valid 24-hour times before 24:00',
    );
  }

  const normStart = `${startMatch[1]}:${startMatch[2]}:${startMatch[3] ?? '00'}`;
  const normEnd = `${endMatch[1]}:${endMatch[2]}:${endMatch[3] ?? '00'}`;

  if (normStart >= normEnd) {
    throw new InvalidTaskSlotError(
      'startTime must be strictly earlier than endTime on the same day',
    );
  }

  return { startTime: normStart, endTime: normEnd };
}

/**
 * Validates YYYY-MM-DD calendar date format.
 */
export function validateScheduledDate(dateStr: string): string {
  if (!DATE_PATTERN.test(dateStr)) {
    throw new InvalidTaskSlotError('scheduledDate must be YYYY-MM-DD');
  }
  return dateStr;
}

function toVietnamDayNumber(dateStr: string): number {
  const match = DATE_PATTERN.exec(dateStr);
  if (!match) {
    throw new InvalidTaskSlotError('Invalid date format');
  }
  const utcMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Math.floor(utcMs / MS_PER_DAY);
}

function instantToVietnamDayNumber(instant: Date): number {
  return Math.floor((instant.getTime() + VIETNAM_OFFSET_MS) / MS_PER_DAY);
}

function toVietnamStartInstant(scheduledDate: string, startTime: string): Date {
  return new Date(`${scheduledDate}T${startTime}+07:00`);
}

/**
 * Computes displayStatus and lateDays in Asia/Ho_Chi_Minh (+07:00):
 * completed -> overdue (after Vietnam midnight) -> before scheduled start -> stored progress.
 */
export function computeTaskStatus(
  input: {
    scheduledDate: string;
    startTime: string;
    progress: TaskProgress;
    completedAt: Date | null;
  },
  now: Date = new Date(),
): { displayStatus: TaskDisplayStatus; lateDays: number } {
  const scheduledDay = toVietnamDayNumber(input.scheduledDate);

  if (input.progress === 'DONE' && input.completedAt !== null) {
    const completedDay = instantToVietnamDayNumber(input.completedAt);
    return {
      displayStatus: 'DONE',
      lateDays: Math.max(0, completedDay - scheduledDay),
    };
  }

  const nowDay = instantToVietnamDayNumber(now);
  if (nowDay > scheduledDay) {
    return {
      displayStatus: 'OVERDUE',
      lateDays: nowDay - scheduledDay,
    };
  }

  const startInstant = toVietnamStartInstant(
    input.scheduledDate,
    input.startTime,
  );
  if (now.getTime() < startInstant.getTime()) {
    return {
      displayStatus: 'NOT_STARTED',
      lateDays: 0,
    };
  }

  return {
    displayStatus: input.progress,
    lateDays: 0,
  };
}
