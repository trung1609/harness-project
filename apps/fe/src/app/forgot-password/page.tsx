'use client';

import { AlertCircle, CheckCircle2, Mail, Send } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '../../features/auth/AuthShell';
import { createAuthApiClient } from '../../features/auth/auth-api';

const authApi = createAuthApiClient();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể gửi yêu cầu đặt lại mật khẩu.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu mới."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Email tài khoản
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              id="forgot-email"
              type="email"
              required
              placeholder="ban@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" strokeWidth={1.75} />
          {submitting ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
        </button>
      </form>

      {sent && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.75} />
          <p>
            Nếu tài khoản tồn tại và đang hoạt động, liên kết đặt lại mật khẩu (hiệu lực 30 phút) đã được gửi tới email của bạn.
          </p>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" strokeWidth={1.75} />
          <p>{errorMsg}</p>
        </div>
      )}

      <nav className="mt-6 border-t border-slate-200 pt-4 text-sm">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Quay lại trang đăng nhập
        </Link>
      </nav>
    </AuthShell>
  );
}
