import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AmbientBlueCanvas } from './AmbientBlueCanvas';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6">
      <AmbientBlueCanvas />
      <div className="relative z-10 mx-auto w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2.5 text-slate-900 transition-colors hover:text-blue-600"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <BookOpen className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="text-base font-semibold tracking-tight">
            Sổ tay cá nhân
          </span>
        </Link>

        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>
          </header>
          {children}
        </section>
      </div>
    </div>
  );
}
