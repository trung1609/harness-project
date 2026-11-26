'use client';

import { CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '../../features/auth/AuthShell';
import { createAuthApiClient } from '../../features/auth/auth-api';
import { createAuthWorkflow, type AuthOutcome } from '../../features/auth/auth-state';

const workflow = createAuthWorkflow(createAuthApiClient());

function ActivateContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [outcome, setOutcome] = useState<AuthOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!token) return;
    setSubmitting(true);
    try {
      const result = await workflow.activate(token);
      setOutcome(result);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      title="Kích hoạt tài khoản"
      subtitle="Xác nhận liên kết kích hoạt để hoàn tất đăng ký."
    >
      {token ? (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
          {submitting ? 'Đang kích hoạt...' : 'Xác nhận kích hoạt'}
        </button>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Thiếu mã kích hoạt trong liên kết.
        </p>
      )}

      {outcome && 'message' in outcome && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
        >
          {outcome.message}
        </p>
      )}

      {(outcome?.kind === 'activation_expired' || !token) && (
        <form onSubmit={handleResend} className="mt-6 space-y-3 border-t border-slate-200 pt-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Gửi lại liên kết kích hoạt
          </h2>
          <div>
            <label
              htmlFor="resend-email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Email đã đăng ký
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                id="resend-email"
                type="email"
                required
                placeholder="ban@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
            Gửi lại email kích hoạt
          </button>
        </form>
      )}

      <nav className="mt-6 border-t border-slate-200 pt-4 text-sm">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Quay lại trang đăng nhập
        </Link>
      </nav>
    </AuthShell>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Đang tải...
        </main>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
