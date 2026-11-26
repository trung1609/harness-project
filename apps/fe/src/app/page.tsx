import { ArrowRight, BookOpen, CalendarDays, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { AmbientBlueCanvas } from '../features/auth/AmbientBlueCanvas';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <AmbientBlueCanvas />
      <header className="relative z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <BookOpen className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              Sổ tay cá nhân
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Đăng ký
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Sổ tay cá nhân
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Ghi chú và công việc cá nhân theo ngày và lịch tuần Việt Nam, gọn gàng,
            rõ ràng và tách bạch quyền riêng tư.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Bắt đầu ngay
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Đã có tài khoản
            </Link>
          </div>
        </div>

        <section className="mt-16 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <CalendarDays className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">
              Lịch tuần &amp; lặp theo tháng
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Theo dõi công việc theo Thứ Hai–Chủ Nhật, tự động cập nhật trạng thái quá hạn theo giờ Việt Nam.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <FileText className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">
              Ghi chú gắn với công việc
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Lưu trữ ghi chú cá nhân và liên kết trực tiếp với từng đầu việc cần theo dõi.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <ShieldCheck className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">
              Phiên bảo mật &amp; kích hoạt
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Xác thực cookie HttpOnly, chống CSRF và hỗ trợ mở khóa tài khoản minh bạch.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
