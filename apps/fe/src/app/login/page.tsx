'use client';

import { AlertCircle, Lock, LogIn, Mail, RefreshCw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '../../features/auth/AuthShell';
import { createAuthApiClient } from '../../features/auth/auth-api';
import { createAuthWorkflow, type AuthOutcome } from '../../features/auth/auth-state';

const workflow = createAuthWorkflow(createAuthApiClient());

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [outcome, setOutcome] = useState<AuthOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await workflow.signIn(email, password);
      setOutcome(result);
      if (result.kind === 'signed_in') {
        router.push(result.account.role === 'ADMIN' ? '/admin' : '/workspace');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const result = await workflow.resendActivation(email);
      setOutcome(result);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Đăng nhập"
      subtitle="Truy cập không gian ghi chú và lịch công việc cá nhân."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              id="email"
              type="email"
              required
              placeholder="ban@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Mật khẩu
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" strokeWidth={1.75} />
          {submitting ? 'Đang xử lý...' : 'Đăng nhập'}
        </button>
      </form>

      {outcome && 'message' in outcome && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" strokeWidth={1.75} />
          <div className="space-y-2">
            <p>{outcome.message}</p>
            {outcome.kind === 'pending_account' && (
              <button
                type="button"
                onClick={handleResend}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Gửi lại email kích hoạt
              </button>
            )}
            {outcome.kind === 'locked_account' && (
              <Link
                href={outcome.unlockPath}
                className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700"
              >
                <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
                Yêu cầu mở khóa tài khoản
              </Link>
            )}
          </div>
        </div>
      )}

      <nav className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
        <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
          Chưa có tài khoản? Đăng ký
        </Link>
        <Link href="/unlock" className="hover:text-slate-900">
          Mở khóa
        </Link>
      </nav>
    </AuthShell>
  );
}
