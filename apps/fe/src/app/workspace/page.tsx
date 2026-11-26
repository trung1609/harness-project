'use client';

import { BookOpen, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createAuthApiClient } from '../../features/auth/auth-api';
import { createAuthWorkflow } from '../../features/auth/auth-state';

const api = createAuthApiClient();
const workflow = createAuthWorkflow(api);

export default function WorkspacePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'revoked'>('checking');

  useEffect(() => {
    let active = true;
    void workflow.restoreProtectedSession().then((result) => {
      if (!active) return;
      if (result.kind === 'session_valid') {
        setStatus('ready');
      } else if (result.kind === 'session_revoked') {
        setStatus('revoked');
        router.replace(result.redirectTo);
      } else {
        setStatus('revoked');
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSignOut() {
    await api.signOut();
    router.replace('/login');
  }

  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (status === 'revoked') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-sm text-slate-700">
        <p>Phiên đăng nhập đã hết hạn hoặc bị thu hồi.</p>
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Đăng nhập lại
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <BookOpen className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="text-base font-semibold text-slate-900">
              Không gian làm việc cá nhân
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Không gian làm việc cá nhân
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Phiên đăng nhập hợp lệ. Các màn hình lịch tuần, công việc và ghi chú sẽ được gắn ở IM-09.
        </p>
      </main>
    </div>
  );
}
