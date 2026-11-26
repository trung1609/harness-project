'use client';

import { AlertCircle, CheckCircle2, KeyRound, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { AuthShell } from '../../features/auth/AuthShell';
import { createAuthApiClient } from '../../features/auth/auth-api';

const authApi = createAuthApiClient();
const subscribeEmpty = () => () => {};

function readTokenFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
}

export default function ResetPasswordPage() {
  const token = useSyncExternalStore(subscribeEmpty, readTokenFromLocation, () => '');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    if (!token) {
      setErrorMsg('Thiếu mã xác thực đặt lại mật khẩu.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.confirmPasswordReset(token, newPassword);
      setDone(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Đặt lại mật khẩu mới"
      subtitle="Nhập mật khẩu mới cho tài khoản của bạn."
    >
      {!token ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu token.
        </div>
      ) : done ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.75} />
            <p>Cập nhật mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.</p>
          </div>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Đi tới trang đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Mật khẩu mới (tối thiểu 8 ký tự)
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Xác nhận mật khẩu mới
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" strokeWidth={1.75} />
            {submitting ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </button>
        </form>
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
