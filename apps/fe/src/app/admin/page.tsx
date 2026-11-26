'use client';

import {
  CheckCircle2,
  Eye,
  Lock,
  ShieldCheck,
  Unlock,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  createAdminApiClient,
  type AdminDecisionAction,
  type AdminUserItem,
} from '../../features/admin/admin-api';
import {
  isViewingUrlExpired,
  type EvidenceViewResponse,
  type SupportRequestItem,
} from '../../features/support/support-api';
import { ApiError } from '../../lib/api/client';

const adminApi = createAdminApiClient();
type PageSize = 10 | 20 | 30 | 40 | 50;

export default function AdminPage() {
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
    const timer = window.setInterval(fetchAdmin, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [reqPage, reqPageSize, usersPage, usersPageSize]);

  async function handleToggleLock(user: AdminUserItem) {
    setErrorMsg(null);
    try {
      await adminApi.setUserLock(user.id, user.lockedAt === null);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật khóa.');
    }
  }

  async function handleDecision(
    requestId: string,
    decision: AdminDecisionAction,
  ) {
    setErrorMsg(null);
    try {
      await adminApi.recordDecision(requestId, decision);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể xử lý yêu cầu.',
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

  if (accessState === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Đang kiểm tra quyền quản trị...
      </main>
    );
  }

  if (accessState === 'unauthorized' || accessState === 'forbidden') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-sm text-slate-700">
        <p>
          {accessState === 'forbidden'
            ? 'Bạn không có quyền truy cập trang quản trị (ADMIN).'
            : 'Vui lòng đăng nhập bằng tài khoản ADMIN.'}
        </p>
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Đăng nhập
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-blue-600" strokeWidth={1.75} />
            <h1 className="text-xl font-semibold text-slate-900">
              Quản trị hệ thống (ADMIN)
            </h1>
          </div>
          <Link
            href="/workspace"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Không gian cá nhân
          </Link>
        </header>

        {errorMsg && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
            {errorMsg}
          </p>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Users className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
              Tài khoản ({users.totalItems})
            </h2>
            <select
              aria-label="Số tài khoản mỗi trang"
              value={usersPageSize}
              onChange={(e) => {
                setUsersPage(1);
                setUsersPageSize(Number(e.target.value) as PageSize);
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm"
            >
              {[10, 20, 30, 40, 50].map((s) => (
                <option key={s} value={s}>
                  {s} / trang
                </option>
              ))}
            </select>
          </div>

          <ul className="divide-y divide-slate-100 text-sm">
            {users.items.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{u.email}</p>
                  <p className="text-xs text-slate-500">
                    {u.role} · {u.lockedAt ? 'Đang bị khóa' : 'Hoạt động'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleLock(u)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {u.lockedAt ? (
                    <>
                      <Unlock className="h-3.5 w-3.5 text-blue-600" strokeWidth={1.75} />
                      Mở khóa
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5 text-rose-600" strokeWidth={1.75} />
                      Khóa tài khoản
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Yêu cầu hỗ trợ &amp; mở khóa ({requests.totalItems})
            </h2>
            <select
              aria-label="Số yêu cầu mỗi trang"
              value={reqPageSize}
              onChange={(e) => {
                setReqPage(1);
                setReqPageSize(Number(e.target.value) as PageSize);
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm"
            >
              {[10, 20, 30, 40, 50].map((s) => (
                <option key={s} value={s}>
                  {s} / trang
                </option>
              ))}
            </select>
          </div>

          <ul className="divide-y divide-slate-100 text-sm">
            {requests.items.map((req) => (
              <li key={req.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    [{req.kind}] {req.text}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {req.state}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleViewEvidence(req.id)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Xem ảnh minh chứng
                  </button>
                  {req.kind === 'UNLOCK' && req.state !== 'RESOLVED' && (
                    <button
                      type="button"
                      onClick={() => handleDecision(req.id, 'APPROVE_UNLOCK')}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Duyệt mở khóa
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {activeEvidence && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
              {isViewingUrlExpired(activeEvidence.view.expiresAt) ? (
                <button
                  type="button"
                  onClick={() => handleViewEvidence(activeEvidence.requestId)}
                  className="font-medium text-blue-700 hover:underline"
                >
                  Liên kết ảnh đã hết hạn — Bấm để làm mới
                </button>
              ) : (
                <a
                  href={activeEvidence.view.viewingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-blue-700 hover:underline"
                >
                  {activeEvidence.view.viewingUrl}
                </a>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
