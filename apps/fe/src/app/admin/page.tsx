'use client';

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createAdminApiClient,
  type AdminDecisionAction,
  type AdminUserItem,
} from '../../features/admin/admin-api';
import { ChangePasswordCard } from '../../features/auth/ChangePasswordCard';
import { createAuthApiClient } from '../../features/auth/auth-api';
import {
  isViewingUrlExpired,
  type EvidenceViewResponse,
  type SupportRequestItem,
} from '../../features/support/support-api';
import { ApiError } from '../../lib/api/client';

const adminApi = createAdminApiClient();
const authApi = createAuthApiClient();
type PageSize = 10 | 20 | 30 | 40 | 50;
type AdminSection = 'overview' | 'users' | 'support' | 'password';

function formatRequestKindLabel(kind: SupportRequestItem['kind']): string {
  switch (kind) {
    case 'UNLOCK':
      return 'Yêu cầu mở khóa';
    case 'BUG_REPORT':
      return 'Báo lỗi';
    case 'SUPPORT':
      return 'Hỗ trợ';
  }
}

function formatRequestStateLabel(state: SupportRequestItem['state']): string {
  switch (state) {
    case 'SUBMITTED':
      return 'Chờ xử lý';
    case 'IN_REVIEW':
      return 'Đang xử lý';
    case 'RESOLVED':
      return 'Đã xử lý';
  }
}

function requestStateBadgeClass(state: SupportRequestItem['state']): string {
  switch (state) {
    case 'SUBMITTED':
      return 'border border-amber-200 bg-amber-50 text-amber-700';
    case 'IN_REVIEW':
      return 'border border-blue-200 bg-blue-50 text-blue-700';
    case 'RESOLVED':
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<AdminSection>('overview');
  const [accessState, setAccessState] = useState<
    'loading' | 'ready' | 'forbidden' | 'unauthorized'
  >('loading');

  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState<PageSize>(10);
  const [users, setUsers] = useState<{ items: AdminUserItem[]; totalItems: number }>({
    items: [],
    totalItems: 0,
  });

  const [reqPage, setReqPage] = useState(1);
  const [reqPageSize, setReqPageSize] = useState<PageSize>(10);
  const [requests, setRequests] = useState<{
    items: SupportRequestItem[];
    totalItems: number;
  }>({ items: [], totalItems: 0 });

  const [activeEvidence, setActiveEvidence] = useState<{
    requestId: string;
    view: EvidenceViewResponse;
  } | null>(null);
  const [lockTarget, setLockTarget] = useState<AdminUserItem | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [lockSubmitting, setLockSubmitting] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [uRes, rRes] = await Promise.all([
        adminApi.listUsers(usersPage, usersPageSize),
        adminApi.listSupportRequests(reqPage, reqPageSize),
      ]);
      setUsers({ items: uRes.items, totalItems: uRes.totalItems });
      setRequests({ items: rRes.items, totalItems: rRes.totalItems });
      setAccessState('ready');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessState('forbidden');
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        setAccessState('unauthorized');
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu ADMIN.');
    }
  }, [reqPage, reqPageSize, usersPage, usersPageSize]);

  useEffect(() => {
    let active = true;
    const fetchAdmin = () => {
      void Promise.all([
        adminApi.listUsers(usersPage, usersPageSize),
        adminApi.listSupportRequests(reqPage, reqPageSize),
      ])
        .then(([uRes, rRes]) => {
          if (!active) return;
          setUsers({ items: uRes.items, totalItems: uRes.totalItems });
          setRequests({ items: rRes.items, totalItems: rRes.totalItems });
          setAccessState('ready');
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof ApiError && err.status === 403) {
            setAccessState('forbidden');
            return;
          }
          if (err instanceof ApiError && err.status === 401) {
            setAccessState('unauthorized');
            return;
          }
          setErrorMsg(
            err instanceof Error ? err.message : 'Lỗi tải dữ liệu ADMIN.',
          );
        });
    };
    fetchAdmin();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAdmin();
      }
    }, 4000);
    const onFocus = () => fetchAdmin();
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [reqPage, reqPageSize, usersPage, usersPageSize]);

  async function handleConfirmLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lockTarget || !lockReason.trim()) return;
    setLockSubmitting(true);
    setErrorMsg(null);
    try {
      await adminApi.setUserLock(lockTarget.id, true, lockReason.trim());
      setLockTarget(null);
      setLockReason('');
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể khóa tài khoản.',
      );
    } finally {
      setLockSubmitting(false);
    }
  }

  async function handleUnlockUser(user: AdminUserItem) {
    setErrorMsg(null);
    try {
      await adminApi.setUserLock(user.id, false);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể mở khóa tài khoản.',
      );
    }
  }

  async function handleViewEvidence(requestId: string) {
    setErrorMsg(null);
    try {
      const view = await adminApi.getAdminEvidenceUrl(requestId);
      setActiveEvidence({ requestId, view });
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể lấy ảnh minh chứng.',
      );
    }
  }

  async function handleDecision(requestId: string, decision: AdminDecisionAction) {
    setErrorMsg(null);
    setBusyRequestId(requestId);
    try {
      await adminApi.recordDecision(requestId, decision);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể cập nhật quyết định.',
      );
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleSignOut() {
    try {
      await authApi.signOut();
    } finally {
      router.push('/login');
    }
  }

  if (accessState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Đang kiểm tra quyền quản trị...
      </div>
    );
  }

  if (accessState === 'unauthorized') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Yêu cầu đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">
            Vui lòng đăng nhập bằng tài khoản ADMIN để truy cập trang quản trị.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }

<<<<<<< Updated upstream
  if (accessState === 'forbidden') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-rose-800">
            Không có quyền truy cập (403)
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Khu vực này chỉ dành cho quản trị viên (ADMIN).
          </p>
=======
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-blue-600" strokeWidth={1.75} />
            <h1 className="text-xl font-semibold text-slate-900">
              Quản trị hệ thống (ADMIN)
            </h1>
          </div>
>>>>>>> Stashed changes
          <Link
            href="/workspace"
            className="mt-4 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Quay lại không gian cá nhân
          </Link>
        </div>
      </main>
    );
  }

  const activeUsersCount = users.items.filter((u) => !u.lockedAt && u.activatedAt).length;
  const lockedUsersCount = users.items.filter((u) => Boolean(u.lockedAt)).length;
  const pendingRequestsCount = requests.items.filter((r) => r.state === 'SUBMITTED').length;

  const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'users', label: 'Quản lý tài khoản', icon: Users, badge: users.totalItems },
    {
      id: 'support',
      label: 'Yêu cầu hỗ trợ & mở khóa',
      icon: LifeBuoy,
      badge: requests.totalItems,
    },
    { id: 'password', label: 'Đổi mật khẩu', icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:min-h-screen lg:w-68 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Quản trị hệ thống (ADMIN)
            </p>
            <p className="text-xs text-slate-500">Sổ tay cá nhân</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </span>
                {typeof item.badge === 'number' && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 border-t border-slate-200 p-3 lg:flex-col lg:items-stretch">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {section === 'overview' && 'Tổng quan hệ thống'}
                {section === 'users' && 'Quản lý tài khoản'}
                {section === 'support' && 'Yêu cầu hỗ trợ & mở khóa'}
                {section === 'password' && 'Đổi mật khẩu quản trị viên'}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Theo dõi tài khoản, xử lý yêu cầu mở khóa và kiểm soát bảo mật hệ thống.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Tự động cập nhật mỗi 4s
              </span>
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Làm mới
              </button>
            </div>
          </header>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={1.75} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Tổng tài khoản
                    </span>
                    <Users className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {users.totalItems}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Đang hoạt động (trang này)
                    </span>
                    <UserCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-emerald-700">
                    {activeUsersCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Đang bị khóa (trang này)
                    </span>
                    <UserX className="h-4 w-4 text-rose-600" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-rose-700">
                    {lockedUsersCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Yêu cầu chờ duyệt
                    </span>
                    <LifeBuoy className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-amber-700">
                    {pendingRequestsCount}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Tài khoản gần đây
                    </h2>
                    <button
                      type="button"
                      onClick={() => setSection('users')}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Xem tất cả
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {users.items.slice(0, 5).map((u) => (
                      <div key={u.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">{u.email}</p>
                          <p className="text-xs text-slate-500">{u.role}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.lockedAt
                              ? 'bg-rose-50 text-rose-700'
                              : u.activatedAt
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {u.lockedAt
                            ? 'Đang bị khóa'
                            : u.activatedAt
                              ? 'Hoạt động'
                              : 'Chờ kích hoạt'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Yêu cầu hỗ trợ & mở khóa
                    </h2>
                    <button
                      type="button"
                      onClick={() => setSection('support')}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Xử lý yêu cầu
                    </button>
                  </div>
                  {requests.items.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                      Chưa có yêu cầu nào.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {requests.items.slice(0, 5).map((req) => (
                        <div key={req.id} className="py-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900">
                              {formatRequestKindLabel(req.kind)}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${requestStateBadgeClass(req.state)}`}
                            >
                              {formatRequestStateLabel(req.state)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                            {req.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* USERS SECTION */}
          {section === 'users' && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Users className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
                  Tài khoản ({users.totalItems})
                </h2>
                <select
                  aria-label="Số tài khoản mỗi trang"
                  value={usersPageSize}
                  onChange={(e) => {
                    setUsersPageSize(Number(e.target.value) as PageSize);
                    setUsersPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  {[10, 20, 30, 40, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / trang
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2.5 pr-4">Email</th>
                      <th className="py-2.5 pr-4">Vai trò</th>
                      <th className="py-2.5 pr-4">Trạng thái</th>
                      <th className="py-2.5 pr-4">Lý do khóa</th>
                      <th className="py-2.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.items.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {u.email}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                              u.role === 'ADMIN'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              u.lockedAt
                                ? 'bg-rose-50 text-rose-700'
                                : u.activatedAt
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {u.lockedAt
                              ? 'Đang bị khóa'
                              : u.activatedAt
                                ? 'Hoạt động'
                                : 'Chờ kích hoạt'}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600">
                          {u.lockedAt ? u.lockReason || 'Không có lý do' : '—'}
                        </td>
                        <td className="py-3 text-right">
                          {u.lockedAt ? (
                            <button
                              type="button"
                              onClick={() => handleUnlockUser(u)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              <Unlock className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Mở khóa
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setLockTarget(u);
                                setLockReason('');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                            >
                              <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Khóa tài khoản
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {users.totalItems > usersPageSize && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span>Trang {usersPage}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={usersPage <= 1}
                      onClick={() => setUsersPage((p) => p - 1)}
                      className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      disabled={usersPage * usersPageSize >= users.totalItems}
                      onClick={() => setUsersPage((p) => p + 1)}
                      className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* SUPPORT REQUESTS SECTION */}
          {section === 'support' && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Yêu cầu hỗ trợ & mở khóa ({requests.totalItems})
                </h2>
                <select
                  aria-label="Số yêu cầu mỗi trang"
                  value={reqPageSize}
                  onChange={(e) => {
                    setReqPageSize(Number(e.target.value) as PageSize);
                    setReqPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  {[10, 20, 30, 40, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / trang
                    </option>
                  ))}
                </select>
              </div>

              {requests.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Hiện chưa có yêu cầu hỗ trợ hoặc mở khóa nào.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {requests.items.map((req) => {
                    const isBusy = busyRequestId === req.id;
                    const isResolved = req.state === 'RESOLVED';
                    return (
                      <div key={req.id} className="space-y-3 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                              {formatRequestKindLabel(req.kind)}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${requestStateBadgeClass(req.state)}`}
                            >
                              {formatRequestStateLabel(req.state)}
                            </span>
                            <span className="text-xs text-slate-400">
                              Gửi lúc {formatDateTime(req.submittedAt)}
                            </span>
                          </div>
                          {req.evidence && (
                            <button
                              type="button"
                              onClick={() => handleViewEvidence(req.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Xem ảnh minh chứng
                            </button>
                          )}
                        </div>

                        <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {req.text}
                        </p>

                        {isResolved ? (
                          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Đã hoàn tất xử lý
                            {req.reviewedAt ? ` (${formatDateTime(req.reviewedAt)})` : ''}
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {req.state === 'SUBMITTED' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDecision(req.id, 'IN_REVIEW')}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Tiếp nhận (Đang xử lý)
                              </button>
                            )}
                            {req.kind === 'UNLOCK' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleDecision(req.id, 'APPROVE_UNLOCK')
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                  Phê duyệt &amp; Mở khóa tài khoản
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleDecision(req.id, 'RESOLVED')}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Đóng yêu cầu (Không mở khóa)
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDecision(req.id, 'RESOLVED')}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                Đánh dấu đã xử lý
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {requests.totalItems > reqPageSize && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span>Trang {reqPage}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={reqPage <= 1}
                      onClick={() => setReqPage((p) => p - 1)}
                      className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      disabled={reqPage * reqPageSize >= requests.totalItems}
                      onClick={() => setReqPage((p) => p + 1)}
                      className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* CHANGE PASSWORD SECTION */}
          {section === 'password' && (
            <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                Cập nhật mật khẩu tài khoản ADMIN
              </h2>
              <ChangePasswordCard />
            </section>
          )}
        </div>
      </main>

      {/* LOCK CONFIRMATION MODAL */}
      {lockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                  <Lock className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <h2 className="text-base font-semibold text-slate-900">
                  Xác nhận khóa tài khoản
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLockTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              Bạn đang khóa tài khoản <strong className="text-slate-900">{lockTarget.email}</strong>. Toàn bộ phiên đăng nhập hiện tại sẽ bị thu hồi ngay lập tức.
            </p>
            <form onSubmit={handleConfirmLock} className="space-y-4">
              <div>
                <label
                  htmlFor="lock-reason"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Lý do khóa tài khoản <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="lock-reason"
                  required
                  rows={3}
                  placeholder="Nhập lý do khóa tài khoản (bắt buộc)..."
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setLockTarget(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={lockSubmitting || !lockReason.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" strokeWidth={1.75} />
                  {lockSubmitting ? 'Đang khóa...' : 'Xác nhận khóa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EVIDENCE MODAL */}
      {activeEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Ảnh minh chứng
              </h3>
              <button
                type="button"
                onClick={() => setActiveEvidence(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            {isViewingUrlExpired(activeEvidence.view.expiresAt) ? (
              <p className="text-sm text-amber-700">
                Liên kết xem ảnh đã hết hạn. Vui lòng nhấn &quot;Xem ảnh&quot; lại.
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeEvidence.view.viewingUrl}
                alt="Minh chứng hỗ trợ"
                className="max-h-96 w-full rounded-lg border border-slate-200 object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
