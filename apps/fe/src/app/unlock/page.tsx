'use client';

import { AlertCircle, CheckCircle2, Mail, Send, ShieldAlert } from 'lucide-react';
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

export default function UnlockPage() {
  const token = useSyncExternalStore(subscribeEmpty, readTokenFromLocation, () => '');

  const [email, setEmail] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRequestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await authApi.requestUnlockVerification(email.trim());
      setRequested(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể gửi liên kết xác minh mở khóa.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reasonText.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await authApi.submitUnlockRequestWithToken(token, reasonText.trim());
      setSubmitted(true);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Liên kết mở khóa đã hết hạn hoặc không hợp lệ.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Mở khóa tài khoản"
      subtitle={
        token
          ? 'Nhập giải trình để gửi yêu cầu mở khóa tới quản trị viên.'
          : 'Xác minh quyền sở hữu email đã đăng ký để gửi yêu cầu mở khóa.'
      }
    >
      {token ? (
        submitted ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.75} />
            <p>
              Yêu cầu mở khóa đã được gửi tới quản trị viên. Bạn sẽ nhận được thông báo qua email khi yêu cầu được xử lý.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitUnlock} className="space-y-4">
            <div>
              <label
                htmlFor="unlock-reason"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Nội dung yêu cầu mở khóa
              </label>
              <textarea
                id="unlock-reason"
                required
                rows={4}
                placeholder="Trình bày lý do và cam kết bảo mật tài khoản..."
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" strokeWidth={1.75} />
              {submitting ? 'Đang gửi...' : 'Gửi yêu cầu mở khóa'}
            </button>
          </form>
        )
      ) : (
        <form onSubmit={handleRequestEmail} className="space-y-4">
          <div>
            <label
              htmlFor="unlock-email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Email tài khoản bị khóa
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={1.75}
              />
              <input
                id="unlock-email"
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <ShieldAlert className="h-4 w-4" strokeWidth={1.75} />
            {submitting ? 'Đang gửi...' : 'Gửi liên kết xác minh mở khóa'}
          </button>
        </form>
      )}

      {requested && !token && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" strokeWidth={1.75} />
          <p>
            Nếu tài khoản tồn tại và đang bị khóa, liên kết xác minh ngắn hạn (30 phút) đã được gửi tới email của bạn.
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
