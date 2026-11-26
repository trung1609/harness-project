'use client';

import { Mail, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '../../features/auth/AuthShell';

export default function UnlockPage() {
  const [email, setEmail] = useState('');
  const [requested, setRequested] = useState(false);

  function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setRequested(true);
  }

  return (
    <AuthShell
      title="Mở khóa tài khoản"
      subtitle="Xác minh quyền sở hữu email đã đăng ký để gửi yêu cầu mở khóa."
    >
      <form onSubmit={handleRequest} className="space-y-4">
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <ShieldAlert className="h-4 w-4" strokeWidth={1.75} />
          Gửi liên kết xác minh mở khóa
        </button>
      </form>

      {requested && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Nếu tài khoản tồn tại và đang bị khóa, liên kết xác minh ngắn hạn sẽ được gửi tới email của bạn để nộp ảnh minh chứng mở khóa.
        </p>
      )}

      <nav className="mt-6 border-t border-slate-200 pt-4 text-sm">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Quay lại trang đăng nhập
        </Link>
      </nav>
    </AuthShell>
  );
}
