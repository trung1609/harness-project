'use client';

import { CheckCircle2, Lock, Mail, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '../../features/auth/AuthShell';
import { createAuthApiClient } from '../../features/auth/auth-api';
import { createAuthWorkflow, type AuthOutcome } from '../../features/auth/auth-state';

const workflow = createAuthWorkflow(createAuthApiClient());

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [outcome, setOutcome] = useState<AuthOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await workflow.register(email, password);
      setOutcome(result);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Đăng ký tài khoản"
      subtitle="Tạo tài khoản mới và xác nhận qua email kích hoạt."
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
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Mật khẩu (tối thiểu 8 ký tự)
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.75}
            />
            <input
              id="password"
              type="password"
              minLength={8}
              required
              placeholder="Tối thiểu 8 ký tự"
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
          <UserPlus className="h-4 w-4" strokeWidth={1.75} />
          {submitting ? 'Đang tạo...' : 'Đăng ký'}
        </button>
      </form>

      {outcome && 'message' in outcome && (
        <div
          role="status"
          className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
            outcome.kind === 'registered'
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <p>{outcome.message}</p>
        </div>
      )}

      <nav className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Đã có tài khoản? Đăng nhập
        </Link>
      </nav>
    </AuthShell>
  );
}
