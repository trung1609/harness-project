import type { TaskDisplayStatus, TaskItem } from './tasks-api';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns YYYY-MM-DD for the Monday of the current Vietnam calendar week.
 */
export function currentVietnamMonday(now: Date = new Date()): string {
  const vnDate = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  const day = vnDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(
      vnDate.getUTCFullYear(),
      vnDate.getUTCMonth(),
      vnDate.getUTCDate() + diffToMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Returns YYYY-MM-DD for today in Vietnam time (+07:00).
 */
export function todayVietnamDate(now: Date = new Date()): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = [
  'Chủ Nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];

/**
 * Formats YYYY-MM-DD into dd/MM/yyyy for display.
 */
export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

/**
 * Formats an ISO timestamp into dd/MM/yyyy HH:mm in Asia/Ho_Chi_Minh (+07:00).
 */
export function formatDateTimeVi(isoStr: string): string {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return isoStr;
  const vn = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = vn.getUTCFullYear();
  const hh = String(vn.getUTCHours()).padStart(2, '0');
  const min = String(vn.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Formats YYYY-MM-DD into Vietnamese weekday and dd/MM/yyyy.
 */
export function formatVietnameseDayLabel(dateStr: string): {
  weekday: string;
  shortDate: string;
} {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    weekday: WEEKDAY_NAMES[dow] ?? '',
    shortDate: formatDisplayDate(dateStr),
  };
}

/**
 * Shifts a YYYY-MM-DD date string by deltaDays.
 */
export function shiftDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + deltaDays * MS_PER_DAY);
  return next.toISOString().slice(0, 10);
}

export function formatTaskStatusLabel(
  status: TaskDisplayStatus,
  lateDays: number,
): string {
  switch (status) {
    case 'NOT_STARTED':
      return 'Chưa tới giờ';
    case 'TODO':
      return 'Cần làm';
    case 'IN_PROGRESS':
      return 'Đang làm';
    case 'DONE':
      return lateDays > 0 ? `Hoàn thành (trễ ${lateDays} ngày)` : 'Hoàn thành';
    case 'OVERDUE':
      return `Quá hạn ${lateDays} ngày`;
  }
}

export function filterTasksByStatus(
  tasks: TaskItem[],
  statusFilter: TaskDisplayStatus | 'ALL',
): TaskItem[] {
  if (statusFilter === 'ALL') {
    return tasks;
  }
  return tasks.filter((task) => task.displayStatus === statusFilter);
}
