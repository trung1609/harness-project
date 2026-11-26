import {
  Archive,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { AmbientBlueCanvas } from '../features/auth/AmbientBlueCanvas';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <AmbientBlueCanvas />

      {/* Top Navigation */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <BookOpen className="h-4.5 w-4.5" strokeWidth={1.75} />
            </span>
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              Sổ tay cá nhân
            </span>
          </Link>

          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
            >
              <span>Đăng ký</span>
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                Không gian làm việc &amp; ghi chú theo giờ Việt Nam
              </div>

              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.15]">
                Sổ tay cá nhân
              </h1>
              <p className="mt-2 text-xl font-medium text-blue-600 sm:text-2xl">
                Gọn gàng, rõ ràng mỗi ngày.
              </p>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Lên lịch công việc theo tuần, liên kết ghi chú chi tiết vào từng đầu việc và lưu trữ an toàn 30 ngày trong không gian riêng tư của bạn.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700"
                >
                  <span>Bắt đầu ngay</span>
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  Đã có tài khoản
                </Link>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-slate-200/80 pt-6">
                <div>
                  <dt className="text-xs text-slate-500">Múi giờ chuẩn</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                    UTC+7 Việt Nam
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Kho lưu trữ</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                    Khôi phục 30 ngày
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Bảo mật phiên</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                    HttpOnly &amp; CSRF
                  </dd>
                </div>
              </dl>
            </div>

            {/* Clean Workspace Preview Card */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                    <span className="text-sm font-semibold text-slate-900">
                      Lịch tuần hiện tại
                    </span>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    Thứ 2 – Chủ Nhật
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Hoàn thiện kế hoạch tuần &amp; tổng kết
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                          09:00 – 10:30 · Hôm nay
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        Hoàn thành
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          Nghiên cứu giải pháp dự án mới
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <Link2 className="h-3.5 w-3.5 text-blue-600" strokeWidth={1.75} />
                          Đã gắn 2 ghi chú chi tiết
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        Đang làm
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-3.5 py-2.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Archive className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} />
                      Ghi chú đã xóa được giữ trong Kho lưu trữ
                    </span>
                    <span className="font-medium text-blue-600">30 ngày</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-t border-slate-200/80 bg-white py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Thiết kế tập trung cho công việc cá nhân
              </h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Mọi thao tác từ lên lịch, ghi chép đến khôi phục dữ liệu đều mạch lạc trên cả máy tính và điện thoại.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">
                  Lịch tuần &amp; lặp theo tháng
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Theo dõi Thứ Hai–Chủ Nhật, tự động đánh dấu quá hạn theo mốc 00:00 giờ Việt Nam.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FileText className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">
                  Ghi chú gắn công việc
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Soạn thảo ghi chú có định dạng và liên kết trực tiếp với từng đầu việc cần theo dõi.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Archive className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">
                  Kho lưu trữ 30 ngày
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Ghi chú khi xóa sẽ vào Kho lưu trữ để khôi phục bất kỳ lúc nào trong 30 ngày.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">
                  Bảo mật phiên &amp; khôi phục
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Cookie HttpOnly, chống CSRF, đổi mật khẩu và đặt lại mật khẩu qua email an toàn.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Simple Workflow Strip */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-blue-200 bg-blue-600 px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">
                Sẵn sàng sắp xếp công việc của bạn?
              </h2>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-blue-100">
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                Tạo tài khoản và kích hoạt qua email chỉ trong vài giây.
              </p>
            </div>
            <Link
              href="/register"
              className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            >
              Tạo tài khoản miễn phí
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
