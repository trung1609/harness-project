'use client';

import {
  AlertCircle,
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Filter,
  KeyRound,
  LifeBuoy,
  Link2,
  LogOut,
  Pencil,
  PlayCircle,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChangePasswordCard } from '../../features/auth/ChangePasswordCard';
import { createAuthApiClient } from '../../features/auth/auth-api';
import { createAuthWorkflow } from '../../features/auth/auth-state';
import {
  createNotesApiClient,
  type NoteItem,
} from '../../features/notes/notes-api';
import {
  createTasksApiClient,
  type TaskDisplayStatus,
  type TaskItem,
  type TaskProgress,
  type TimetableWeekResponse,
} from '../../features/tasks/tasks-api';
import {
  currentVietnamMonday,
  filterTasksByStatus,
  formatDateTimeVi,
  formatDisplayDate,
  formatTaskStatusLabel,
  formatVietnameseDayLabel,
  shiftDate,
  todayVietnamDate,
} from '../../features/tasks/workspace-helpers';
import { useToast } from '../../features/ui/ToastProvider';

const authApi = createAuthApiClient();
const authWorkflow = createAuthWorkflow(authApi);
const tasksApi = createTasksApiClient();
const notesApi = createNotesApiClient();

type ActiveTab = 'timetable' | 'tasks' | 'notes' | 'archive';
type PageSize = 10 | 20 | 30 | 40 | 50;

type DeleteConfirmTarget =
  | { kind: 'task'; id: string; label: string }
  | { kind: 'series_except_week'; seriesId: string; label: string }
  | { kind: 'note'; id: string; label: string }
  | { kind: 'note_permanent'; id: string; label: string };

function remainingArchiveDays(deletedAt?: string | null): number {
  if (!deletedAt) return 30;
  const elapsedMs = Date.now() - new Date(deletedAt).getTime();
  const remaining = Math.ceil((30 * 24 * 60 * 60 * 1000 - elapsedMs) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

function statusBadgeClass(status: TaskDisplayStatus): string {
  switch (status) {
    case 'DONE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'OVERDUE':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'IN_PROGRESS':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'NOT_STARTED':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'TODO':
      return 'bg-amber-50 text-amber-700 border-amber-200';
  }
}

function statusAccentBorder(status: TaskDisplayStatus): string {
  switch (status) {
    case 'DONE':
      return 'border-l-emerald-500';
    case 'OVERDUE':
      return 'border-l-rose-500';
    case 'IN_PROGRESS':
      return 'border-l-blue-600';
    case 'NOT_STARTED':
      return 'border-l-slate-300';
    case 'TODO':
      return 'border-l-amber-400';
  }
}

const PROGRESS_OPTIONS: Array<{
  value: TaskProgress;
  shortLabel: string;
  fullLabel: string;
  activeClass: string;
}> = [
  {
    value: 'TODO',
    shortLabel: 'Chờ',
    fullLabel: 'Cần làm',
    activeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    value: 'IN_PROGRESS',
    shortLabel: 'Làm',
    fullLabel: 'Đang làm',
    activeClass: 'bg-blue-600 text-white border-blue-600',
  },
  {
    value: 'DONE',
    shortLabel: 'Xong',
    fullLabel: 'Hoàn thành',
    activeClass: 'bg-emerald-600 text-white border-emerald-600',
  },
];

function WorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [sessionState, setSessionState] = useState<'checking' | 'ready' | 'revoked'>('checking');
  const queryTab = searchParams.get('tab');
  const tab: ActiveTab =
    queryTab === 'tasks' ||
    queryTab === 'notes' ||
    queryTab === 'archive' ||
    queryTab === 'timetable'
      ? queryTab
      : 'timetable';

  function setTab(nextTab: ActiveTab) {
    router.replace(`/workspace?tab=${nextTab}`, { scroll: false });
  }

  // Timetable state
  const [weekStart, setWeekStart] = useState<string>(() => currentVietnamMonday());
  const [weekData, setWeekData] = useState<TimetableWeekResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskDisplayStatus | 'ALL'>('ALL');
  const todayVn = todayVietnamDate();

  // Create Task Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState<string>(() => todayVietnamDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [taskProgress, setTaskProgress] = useState<TaskProgress>('TODO');
  const [isWeeklySeries, setIsWeeklySeries] = useState(false);

  // Edit Task Modal
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editWeeklySeries, setEditWeeklySeries] = useState(false);
  const [editSeriesScope, setEditSeriesScope] = useState<'CURRENT' | 'ALL'>('ALL');

  // Tasks list state
  const [tasksPage, setTasksPage] = useState(1);
  const [tasksPageSize, setTasksPageSize] = useState<PageSize>(10);
  const [tasksList, setTasksList] = useState<{ items: TaskItem[]; totalItems: number }>({
    items: [],
    totalItems: 0,
  });

  // Notes state
  const [notesPage, setNotesPage] = useState(1);
  const [notesPageSize, setNotesPageSize] = useState<PageSize>(10);
  const [notesList, setNotesList] = useState<{ items: NoteItem[]; totalItems: number }>({
    items: [],
    totalItems: 0,
  });

  // Archived notes state
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedPageSize, setArchivedPageSize] = useState<PageSize>(10);
  const [archivedList, setArchivedList] = useState<{ items: NoteItem[]; totalItems: number }>({
    items: [],
    totalItems: 0,
  });

  // Link note modal & delete/sign-out confirm
  const [linkModalTask, setLinkModalTask] = useState<TaskItem | null>(null);
  const [linkedNotes, setLinkedNotes] = useState<NoteItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteConfirmTarget | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<NoteItem | null>(null);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const loadTimetable = useCallback(async (targetWeek: string) => {
    const data = await tasksApi.getTimetableWeek(targetWeek);
    setWeekData(data);
  }, []);

  const loadTasks = useCallback(async (page: number, pageSize: PageSize) => {
    const data = await tasksApi.listTasks(page, pageSize);
    setTasksList({ items: data.items, totalItems: data.totalItems });
  }, []);

  const loadNotes = useCallback(async (page: number, pageSize: PageSize) => {
    const data = await notesApi.listNotes(page, pageSize);
    setNotesList({ items: data.items, totalItems: data.totalItems });
  }, []);

  const loadArchivedNotes = useCallback(async (page: number, pageSize: PageSize) => {
    const data = await notesApi.listArchivedNotes(page, pageSize);
    setArchivedList({ items: data.items, totalItems: data.totalItems });
  }, []);

  useEffect(() => {
    let active = true;
    void authWorkflow.restoreProtectedSession().then(async (result) => {
      if (!active) return;
      if (result.kind === 'session_valid') {
        setSessionState('ready');
        try {
          await Promise.all([
            loadTimetable(weekStart),
            loadTasks(tasksPage, tasksPageSize),
            loadNotes(notesPage, notesPageSize),
            loadArchivedNotes(archivedPage, archivedPageSize),
          ]);
        } catch (err: unknown) {
          if (active) {
            toast.error(err instanceof Error ? err.message : 'Không thể tải dữ liệu.');
          }
        }
      } else {
        setSessionState('revoked');
        router.replace('/login');
      }
    });
    return () => {
      active = false;
    };
  }, [
    archivedPage,
    archivedPageSize,
    loadArchivedNotes,
    loadNotes,
    loadTasks,
    loadTimetable,
    notesPage,
    notesPageSize,
    router,
    tasksPage,
    tasksPageSize,
    toast,
    weekStart,
  ]);

  async function refreshTasksViews() {
    await Promise.all([
      loadTimetable(weekStart),
      loadTasks(tasksPage, tasksPageSize),
    ]);
  }

  async function handleSignOut() {
    await authApi.signOut();
    router.replace('/login');
  }

  function openCreateModalForDate(dateStr?: string) {
    setTaskDate(dateStr ?? todayVn);
    setTaskTitle('');
    setStartTime('09:00');
    setEndTime('10:00');
    setTaskProgress('TODO');
    setIsWeeklySeries(false);
    setCreateModalOpen(true);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskTitle.trim()) {
      toast.error('Vui lòng nhập tên công việc.');
      return;
    }
    if (startTime >= endTime) {
      toast.error('Giờ bắt đầu phải sớm hơn giờ kết thúc trong cùng ngày.');
      return;
    }
    try {
      if (isWeeklySeries) {
        await tasksApi.createWeeklySeries({
          title: taskTitle.trim(),
          scheduledDate: taskDate,
          startTime,
          endTime,
          progress: taskProgress,
        });
      } else {
        await tasksApi.createTask({
          title: taskTitle.trim(),
          scheduledDate: taskDate,
          startTime,
          endTime,
          progress: taskProgress,
        });
      }
      setCreateModalOpen(false);
      setTaskTitle('');
      toast.success('Đã tạo công việc mới.');
      await refreshTasksViews();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể tạo công việc.');
    }
  }

  function openEditTaskModal(task: TaskItem) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDate(task.scheduledDate);
    setEditStartTime(task.startTime.slice(0, 5));
    setEditEndTime(task.endTime.slice(0, 5));
    setEditWeeklySeries(task.seriesId !== null);
    setEditSeriesScope('ALL');
  }

  async function handleSaveEditTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) return;
    if (!editTitle.trim()) {
      toast.error('Vui lòng nhập tên công việc.');
      return;
    }
    if (editStartTime >= editEndTime) {
      toast.error('Giờ bắt đầu phải sớm hơn giờ kết thúc trong cùng ngày.');
      return;
    }
    try {
      const trimmedTitle = editTitle.trim();
      if (editingTask.seriesId === null && editWeeklySeries) {
        // Convert standalone task to a monthly weekly series
        await tasksApi.createWeeklySeries({
          title: trimmedTitle,
          scheduledDate: editDate,
          startTime: editStartTime,
          endTime: editEndTime,
        });
        await tasksApi.deleteTask(editingTask.id);
      } else if (editingTask.seriesId !== null && !editWeeklySeries) {
        // Convert series back to a single standalone task
        await tasksApi.createTask({
          title: trimmedTitle,
          scheduledDate: editDate,
          startTime: editStartTime,
          endTime: editEndTime,
          progress: editingTask.progress,
        });
        await tasksApi.deleteSeriesOccurrences(editingTask.seriesId, {
          scope: 'ALL',
        });
      } else if (editingTask.seriesId !== null && editWeeklySeries) {
        await tasksApi.editSeries(
          editingTask.seriesId,
          editingTask.id,
          { scope: editSeriesScope },
          {
            title: trimmedTitle,
            scheduledDate: editDate,
            startTime: editStartTime,
            endTime: editEndTime,
          },
        );
      } else {
        await tasksApi.updateTask(editingTask.id, {
          title: trimmedTitle,
          scheduledDate: editDate,
          startTime: editStartTime,
          endTime: editEndTime,
        });
      }
      setEditingTask(null);
      toast.success('Đã cập nhật công việc.');
      await refreshTasksViews();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật công việc.');
    }
  }

  async function handleProgressChange(taskId: string, progress: TaskProgress) {
    try {
      await tasksApi.setProgress(taskId, progress);
      toast.success('Đã cập nhật trạng thái.');
      await refreshTasksViews();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.');
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'task') {
        await tasksApi.deleteTask(deleteTarget.id);
        await refreshTasksViews();
      } else if (deleteTarget.kind === 'series_except_week') {
        await tasksApi.deleteSeriesOccurrences(deleteTarget.seriesId, {
          scope: 'EXCEPT_DISPLAYED_WEEK',
          weekStart,
        });
        await refreshTasksViews();
      } else if (deleteTarget.kind === 'note') {
        await notesApi.deleteNote(deleteTarget.id);
        await Promise.all([
          loadNotes(notesPage, notesPageSize),
          loadArchivedNotes(archivedPage, archivedPageSize),
        ]);
        setDeleteTarget(null);
        toast.success('Đã chuyển ghi chú vào Kho lưu trữ (tự xóa sau 30 ngày).');
        return;
      } else {
        await notesApi.permanentlyDeleteNote(deleteTarget.id);
        await loadArchivedNotes(archivedPage, archivedPageSize);
        setDeleteTarget(null);
        toast.success('Đã xóa vĩnh viễn ghi chú.');
        return;
      }
      setDeleteTarget(null);
      toast.success('Đã xóa thành công.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa mục đã chọn.');
    }
  }

  async function handleRestoreNote(note: NoteItem) {
    try {
      await notesApi.restoreNote(note.id);
      await Promise.all([
        loadNotes(notesPage, notesPageSize),
        loadArchivedNotes(archivedPage, archivedPageSize),
      ]);
      setRestoreTarget(null);
      toast.success(`Đã khôi phục ghi chú "${note.title}".`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể khôi phục ghi chú.');
    }
  }

  async function openLinkNoteModal(task: TaskItem) {
    setLinkModalTask(task);
    setSelectedNoteId('');
    try {
      const res = await tasksApi.listTaskNotes(task.id, 1, 50);
      setLinkedNotes(res.items);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể tải ghi chú đã gắn.');
    }
  }

  async function handleLinkNote() {
    if (!linkModalTask || !selectedNoteId) return;
    try {
      await tasksApi.linkNote(linkModalTask.id, selectedNoteId);
      const res = await tasksApi.listTaskNotes(linkModalTask.id, 1, 50);
      setLinkedNotes(res.items);
      setSelectedNoteId('');
      toast.success('Đã gắn ghi chú.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể liên kết ghi chú.');
    }
  }

  async function handleUnlinkNote(noteId: string) {
    if (!linkModalTask) return;
    try {
      await tasksApi.unlinkNote(linkModalTask.id, noteId);
      setLinkedNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('Đã gỡ liên kết ghi chú.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Không thể hủy liên kết ghi chú.');
    }
  }

  if (sessionState === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (sessionState === 'revoked') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-sm text-slate-700">
        <p>Phiên đăng nhập đã hết hạn hoặc bị thu hồi.</p>
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Đăng nhập lại
        </Link>
      </main>
    );
  }

  const weekTasks = weekData?.tasks ?? [];
  const visibleWeekTasks = filterTasksByStatus(weekTasks, statusFilter);
  const visibleListTasks = filterTasksByStatus(tasksList.items, statusFilter);

  const weekTotal = weekTasks.length;
  const weekInProgress = weekTasks.filter((t) => t.displayStatus === 'IN_PROGRESS').length;
  const weekDone = weekTasks.filter((t) => t.displayStatus === 'DONE').length;
  const weekOverdue = weekTasks.filter((t) => t.displayStatus === 'OVERDUE').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <BookOpen className="h-4.5 w-4.5" strokeWidth={1.75} />
            </span>
            <div>
              <span className="block text-base font-semibold tracking-tight text-slate-900">
                Không gian làm việc cá nhân
              </span>
              <span className="block text-xs text-slate-500">
                Lịch tuần &amp; ghi chú theo giờ Việt Nam
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openCreateModalForDate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Thêm công việc
            </button>
            <Link
              href="/support"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <LifeBuoy className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
              <span className="hidden sm:inline">Hỗ trợ</span>
            </Link>
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">Đổi mật khẩu</span>
            </button>
            <button
              type="button"
              onClick={() => setSignOutConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-7 sm:px-6">
        {/* KPI summary strip */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">Trong tuần</p>
              <p className="text-lg font-semibold text-slate-900">{weekTotal}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <PlayCircle className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">Đang làm</p>
              <p className="text-lg font-semibold text-slate-900">{weekInProgress}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">Hoàn thành</p>
              <p className="text-lg font-semibold text-slate-900">{weekDone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertCircle className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">Quá hạn</p>
              <p className="text-lg font-semibold text-slate-900">{weekOverdue}</p>
            </div>
          </div>
        </section>

        {/* Tabs & filter */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setTab('timetable')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'timetable'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
              Lịch tuần
            </button>
            <button
              type="button"
              onClick={() => setTab('tasks')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'tasks'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <CheckSquare className="h-4 w-4" strokeWidth={1.75} />
              Công việc
            </button>
            <button
              type="button"
              onClick={() => setTab('notes')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'notes'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText className="h-4 w-4" strokeWidth={1.75} />
              Ghi chú
            </button>
            <button
              type="button"
              onClick={() => setTab('archive')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'archive'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Archive className="h-4 w-4" strokeWidth={1.75} />
              Kho lưu trữ
              {archivedList.totalItems > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    tab === 'archive'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {archivedList.totalItems}
                </span>
              )}
            </button>
          </div>

          {tab !== 'notes' && tab !== 'archive' && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              <select
                aria-label="Lọc trạng thái"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskDisplayStatus | 'ALL')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="NOT_STARTED">Chưa tới giờ</option>
                <option value="TODO">Cần làm</option>
                <option value="IN_PROGRESS">Đang làm</option>
                <option value="DONE">Hoàn thành</option>
                <option value="OVERDUE">Quá hạn</option>
              </select>
            </div>
          )}
        </div>

        {/* TAB 1: TIMETABLE */}
        {tab === 'timetable' && (
          <div className="space-y-5">
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4.5 w-4.5 text-blue-600" strokeWidth={1.75} />
                <h1 className="text-base font-semibold text-slate-900">
                  Tuần {formatDisplayDate(weekStart)} →{' '}
                  {formatDisplayDate(weekData?.weekEnd ?? shiftDate(weekStart, 6))}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekStart(currentVietnamMonday())}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  Tuần này
                </button>
                <button
                  type="button"
                  onClick={() => setWeekStart((w) => shiftDate(w, -7))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                  Tuần trước
                </button>
                <button
                  type="button"
                  onClick={() => setWeekStart((w) => shiftDate(w, 7))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Tuần sau
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </section>

            <div className="overflow-x-auto pb-2">
              <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4 xl:min-w-[1260px] xl:grid-cols-7">
              {(weekData?.dates ?? []).map((dateStr) => {
                const dayTasks = visibleWeekTasks.filter(
                  (t) => t.scheduledDate === dateStr,
                );
                const { weekday, shortDate } = formatVietnameseDayLabel(dateStr);
                const isToday = dateStr === todayVn;

                return (
                  <div
                    key={dateStr}
                    className={`flex min-h-[280px] flex-col rounded-xl border bg-white p-3.5 transition-all ${
                      isToday
                        ? 'border-blue-500 bg-blue-50/20 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div>
                        <p
                          className={`flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${
                            isToday ? 'text-blue-700' : 'text-slate-900'
                          }`}
                        >
                          {weekday}
                          {isToday && (
                            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Hôm nay
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">{shortDate}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Thêm việc ngày ${shortDate}`}
                        onClick={() => openCreateModalForDate(dateStr)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>

                    {dayTasks.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-center">
                        <p className="text-xs text-slate-400">Không có lịch</p>
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {dayTasks.map((task) => (
                          <li
                            key={task.id}
                            className={`rounded-lg border border-slate-200 border-l-4 ${statusAccentBorder(
                              task.displayStatus,
                            )} bg-white p-3 text-xs shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-md`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="font-semibold leading-snug text-slate-900">
                                {task.title}
                              </p>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Sửa công việc"
                                  onClick={() => openEditTaskModal(task)}
                                  className="rounded p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                >
                                  <Pencil className="h-3 w-3" strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Xóa"
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'task',
                                      id: task.id,
                                      label: task.title,
                                    })
                                  }
                                  className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                                </button>
                              </div>
                            </div>

                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] whitespace-nowrap text-slate-500">
                              <Clock className="h-3 w-3 shrink-0 text-slate-400" strokeWidth={1.75} />
                              <span>
                                {task.startTime.slice(0, 5)} – {task.endTime.slice(0, 5)}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusBadgeClass(
                                  task.displayStatus,
                                )}`}
                              >
                                {formatTaskStatusLabel(task.displayStatus, task.lateDays)}
                              </span>
                              {task.seriesId && (
                                <span
                                  title="Lặp hàng tuần"
                                  className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-blue-700"
                                >
                                  <Repeat className="h-2.5 w-2.5" strokeWidth={1.75} />
                                  Chuỗi
                                </span>
                              )}
                            </div>

                            {/* Compact single-line status pill selector */}
                            <div className="mt-2.5 grid grid-cols-3 gap-1">
                              {PROGRESS_OPTIONS.map((opt) => {
                                const isActive = task.progress === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    title={opt.fullLabel}
                                    onClick={() => handleProgressChange(task.id, opt.value)}
                                    className={`rounded border px-1 py-1 text-[10px] font-medium whitespace-nowrap transition-all ${
                                      isActive
                                        ? opt.activeClass
                                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    {opt.shortLabel}
                                  </button>
                                );
                              })}
                            </div>

                            {task.seriesId && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: 'series_except_week',
                                    seriesId: task.seriesId!,
                                    label: `các tuần khác của chuỗi "${task.title}" (giữ tuần ${formatDisplayDate(weekStart)})`,
                                  })
                                }
                                className="mt-2 block text-left text-[10px] font-medium text-blue-600 hover:underline"
                              >
                                Giữ tuần này, xóa tuần khác
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: TASKS LIST */}
        {tab === 'tasks' && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-base font-semibold text-slate-900">
                Danh sách công việc ({tasksList.totalItems})
              </h1>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Số dòng mỗi trang"
                  value={tasksPageSize}
                  onChange={(e) => {
                    setTasksPage(1);
                    setTasksPageSize(Number(e.target.value) as PageSize);
                  }}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                >
                  {[10, 20, 30, 40, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / trang
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {visibleListTasks.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                Chưa có công việc nào phù hợp.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleListTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-sm transition-colors hover:bg-slate-50/60"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <p className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
                        {formatDisplayDate(task.scheduledDate)} · {task.startTime.slice(0, 5)}–{task.endTime.slice(0, 5)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                          task.displayStatus,
                        )}`}
                      >
                        {formatTaskStatusLabel(task.displayStatus, task.lateDays)}
                      </span>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        {PROGRESS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            title={opt.fullLabel}
                            onClick={() => handleProgressChange(task.id, opt.value)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                              task.progress === opt.value
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.fullLabel}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditTaskModal(task)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => openLinkNoteModal(task)}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Ghi chú liên kết
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: 'task',
                            id: task.id,
                            label: task.title,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Xóa
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 text-sm">
              <button
                type="button"
                disabled={tasksPage <= 1}
                onClick={() => setTasksPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              >
                Trang trước
              </button>
              <span className="text-slate-600">Trang {tasksPage}</span>
              <button
                type="button"
                disabled={tasksPage * tasksPageSize >= tasksList.totalItems}
                onClick={() => setTasksPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              >
                Trang sau
              </button>
            </div>
          </section>
        )}

        {/* TAB 3: NOTES */}
        {tab === 'notes' && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileText className="h-4.5 w-4.5" strokeWidth={1.75} />
                </span>
                <div>
                  <h1 className="text-base font-semibold text-slate-900">
                    Ghi chú của bạn ({notesList.totalItems})
                  </h1>
                  <p className="text-xs text-slate-500">
                    Quản lý ghi chú cá nhân và liên kết với công việc
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <select
                  aria-label="Số ghi chú mỗi trang"
                  value={notesPageSize}
                  onChange={(e) => {
                    setNotesPage(1);
                    setNotesPageSize(Number(e.target.value) as PageSize);
                  }}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                >
                  {[10, 20, 30, 40, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / trang
                    </option>
                  ))}
                </select>
                <Link
                  href="/notes/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Thêm ghi chú
                </Link>
              </div>
            </div>

            {notesList.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm text-slate-500">Chưa có ghi chú nào.</p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {notesList.items.map((note) => (
                  <li
                    key={note.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {note.title}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <Link
                            href={`/notes/${note.id}`}
                            aria-label="Sửa ghi chú"
                            className="rounded-lg p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </Link>
                          <button
                            type="button"
                            aria-label="Xóa ghi chú"
                            onClick={() =>
                              setDeleteTarget({
                                kind: 'note',
                                id: note.id,
                                label: note.title,
                              })
                            }
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                      {note.body && (
                        <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                          {note.body.replace(/<[^>]+>/g, ' ').trim()}
                        </p>
                      )}
                    </div>
                    <p className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      Tạo lúc: {formatDateTimeVi(note.startsAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ARCHIVE TAB */}
        {tab === 'archive' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Archive className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
                  Kho lưu trữ ghi chú ({archivedList.totalItems})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ghi chú đã xóa sẽ được giữ tại đây 30 ngày trước khi tự động xóa vĩnh viễn.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Số ghi chú lưu trữ mỗi trang"
                  value={archivedPageSize}
                  onChange={(e) => {
                    setArchivedPageSize(Number(e.target.value) as PageSize);
                    setArchivedPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  {[10, 20, 30, 40, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / trang
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={archivedPage <= 1}
                    onClick={() => setArchivedPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                  >
                    Trước
                  </button>
                  <span className="px-2 text-xs text-slate-500">Trang {archivedPage}</span>
                  <button
                    type="button"
                    disabled={archivedPage * archivedPageSize >= archivedList.totalItems}
                    onClick={() => setArchivedPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                  >
                    Sau
                  </button>
                </div>
              </div>
            </div>

            {archivedList.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
                <Archive className="mx-auto mb-2 h-8 w-8 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm text-slate-500">
                  Kho lưu trữ đang trống.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {archivedList.items.map((note) => {
                  const daysLeft = remainingArchiveDays(note.deletedAt);
                  return (
                    <li
                      key={note.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {note.title}
                          </h3>
                          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            Còn {daysLeft} ngày
                          </span>
                        </div>
                        {note.body && (
                          <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                            {note.body.replace(/<[^>]+>/g, ' ').trim()}
                          </p>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => setRestoreTarget(note)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Khôi phục
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              kind: 'note_permanent',
                              id: note.id,
                              label: note.title,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Xóa vĩnh viễn
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>

      {/* CREATE TASK MODAL */}
      {createModalOpen && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Circle className="h-4 w-4 text-blue-600" strokeWidth={2.5} />
                Thêm công việc mới
              </h2>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tên công việc
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: Họp nhóm, Ôn tập..."
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Ngày thực hiện
                </label>
                <input
                  type="date"
                  required
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Bắt đầu
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Kết thúc
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Trạng thái ban đầu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PROGRESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTaskProgress(opt.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                        taskProgress === opt.value
                          ? opt.activeClass
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {opt.fullLabel}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isWeeklySeries}
                  onChange={(e) => setIsWeeklySeries(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Lặp hàng tuần trong cùng tháng</span>
              </label>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Tạo công việc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Pencil className="h-4 w-4 text-blue-600" strokeWidth={2} />
                Chỉnh sửa công việc
              </h2>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <form onSubmit={handleSaveEditTask} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tên công việc
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Ngày thực hiện
                </label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Bắt đầu
                  </label>
                  <input
                    type="time"
                    required
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Kết thúc
                  </label>
                  <input
                    type="time"
                    required
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editWeeklySeries}
                  onChange={(e) => setEditWeeklySeries(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Lặp hàng tuần trong cùng tháng</span>
              </label>
              {editingTask.seriesId !== null && editWeeklySeries && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditSeriesScope('CURRENT')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      editSeriesScope === 'CURRENT'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Chỉ sửa buổi này
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSeriesScope('ALL')}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      editSeriesScope === 'ALL'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Sửa cả chuỗi tháng
                  </button>
                </div>
              )}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK LINKED NOTES MODAL */}
      {linkModalTask && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Link2 className="h-4.5 w-4.5 text-blue-600" strokeWidth={2} />
                Ghi chú của &ldquo;{linkModalTask.title}&rdquo;
              </h2>
              <button
                type="button"
                onClick={() => setLinkModalTask(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <select
                value={selectedNoteId}
                onChange={(e) => setSelectedNoteId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              >
                <option value="">Chọn ghi chú để gắn...</option>
                {notesList.items
                  .filter((n) => !linkedNotes.some((ln) => ln.id === n.id))
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!selectedNoteId}
                onClick={handleLinkNote}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Gắn
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              {linkedNotes.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  Chưa có ghi chú nào được gắn với công việc này.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linkedNotes.map((note) => (
                    <li
                      key={note.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {note.title}
                        </p>
                        {note.body && (
                          <p className="mt-1 text-xs text-slate-600">{note.body}</p>
                        )}
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          {formatDateTimeVi(note.startsAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnlinkNote(note.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                      >
                        Gỡ liên kết
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM SIGN OUT MODAL */}
      {changePasswordOpen && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <h2 className="text-base font-semibold text-slate-900">
                  Đổi mật khẩu
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <ChangePasswordCard
              onSuccess={() => {
                setTimeout(() => setChangePasswordOpen(false), 1200);
              }}
            />
          </div>
        </div>
      )}

      {signOutConfirmOpen && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <LogOut className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Xác nhận đăng xuất
              </h2>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              Bạn có chắc chắn muốn đăng xuất khỏi phiên làm việc hiện tại không?
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSignOutConfirmOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {restoreTarget && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <RotateCcw className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Xác nhận khôi phục
              </h2>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              Bạn có muốn khôi phục ghi chú <strong>{restoreTarget.title}</strong> về danh sách <strong>Ghi chú</strong> không?
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleRestoreNote(restoreTarget)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                Khôi phục
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="animate-modal-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Xác nhận xóa
              </h2>
            </div>
            <p className="mb-5 text-sm text-slate-600">
              {deleteTarget.kind === 'note' ? (
                <>
                  Ghi chú <strong>{deleteTarget.label}</strong> sẽ được chuyển vào{' '}
                  <strong>Kho lưu trữ</strong> và tự động xóa vĩnh viễn sau 30 ngày.
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn xóa vĩnh viễn{' '}
                  <strong>{deleteTarget.label}</strong>? Thao tác này không thể hoàn tác.
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Đang tải...
        </main>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
