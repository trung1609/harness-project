'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  History,
  LifeBuoy,
  RefreshCw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createSupportApiClient,
  isViewingUrlExpired,
  validateEvidenceFile,
  type EvidenceViewResponse,
  type SupportRequestItem,
} from '../../features/support/support-api';

const supportApi = createSupportApiClient();
type PageSize = 10 | 20 | 30 | 40 | 50;

export default function SupportPage() {
  const [kind, setKind] = useState<'SUPPORT' | 'BUG_REPORT'>('SUPPORT');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SupportRequestItem | null>(null);

  // History list state
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<PageSize>(10);
  const [history, setHistory] = useState<{
    items: SupportRequestItem[];
    totalItems: number;
  }>({ items: [], totalItems: 0 });
  const [evidenceMap, setEvidenceMap] = useState<
    Record<string, EvidenceViewResponse>
  >({});

  const loadHistory = useCallback(async () => {
    try {
      const res = await supportApi.listOwnRequests(historyPage, historyPageSize);
      setHistory({ items: res.items, totalItems: res.totalItems });
    } catch {
      // Unauthenticated visitors will see empty history until signed in
    }
  }, [historyPage, historyPageSize]);

  useEffect(() => {
    let active = true;
    const fetchLatest = () => {
      void supportApi
        .listOwnRequests(historyPage, historyPageSize)
        .then((res) => {
          if (!active) return;
          setHistory({ items: res.items, totalItems: res.totalItems });
        })
        .catch(() => {
          // Keep existing optimistic/loaded state if backend is restarting or unauthenticated
        });
    };

    fetchLatest();
    const timer = window.setInterval(fetchLatest, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [historyPage, historyPageSize]);

  async function submitFlow() {
    setErrorMsg(null);
    setUploadFailed(false);

    if (!file) {
      setErrorMsg('Vui lòng đính kèm một ảnh minh chứng.');
      return;
    }

    const fileErr = validateEvidenceFile(file);
    if (fileErr) {
      setErrorMsg(fileErr);
      return;
    }

    setSubmitting(true);
    try {
      const intent = await supportApi.createUploadIntent();
      const uploadUrl =
        typeof intent.uploadParams.uploadUrl === 'string'
          ? intent.uploadParams.uploadUrl
          : 'https://api.cloudinary.com/v1_1/demo/image/upload';

      const formData = new FormData();
      formData.append('file', file);
      formData.append('public_id', intent.publicId);
      if (typeof intent.uploadParams.apiKey === 'string') {
        formData.append('api_key', intent.uploadParams.apiKey);
      }
      if (typeof intent.uploadParams.timestamp === 'number') {
        formData.append('timestamp', String(intent.uploadParams.timestamp));
      }
      if (typeof intent.uploadParams.signature === 'string') {
        formData.append('signature', intent.uploadParams.signature);
      }
      if (typeof intent.uploadParams.type === 'string') {
        formData.append('type', intent.uploadParams.type);
      }
      if (typeof intent.uploadParams.overwrite === 'string') {
        formData.append('overwrite', intent.uploadParams.overwrite);
      }

      try {
        await supportApi.uploadDirectToCloudinary(uploadUrl, formData);
      } catch (uploadErr: unknown) {
        setUploadFailed(true);
        throw uploadErr;
      }

      const created = await supportApi.submitRequest({
        kind,
        text,
        intentId: intent.intentId,
      });
      setSubmitted(created);
      setHistory((prev) => ({
        items: [created, ...prev.items.filter((i) => i.id !== created.id)].slice(
          0,
          historyPageSize,
        ),
        totalItems: prev.totalItems + 1,
      }));
      setText('');
      setFile(null);
      await loadHistory();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể gửi yêu cầu hỗ trợ.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitFlow();
  }

  async function handleLoadEvidence(requestId: string) {
    setErrorMsg(null);
    try {
      const view = await supportApi.getOwnEvidenceUrl(requestId);
      setEvidenceMap((prev) => ({ ...prev, [requestId]: view }));
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể tải liên kết ảnh.',
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Link
            href="/workspace"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Quay lại không gian làm việc
          </Link>

          <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <header className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <LifeBuoy className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  Gửi yêu cầu hỗ trợ &amp; báo lỗi
                </h1>
                <p className="text-sm text-slate-600">
                  Đính kèm một ảnh minh chứng (PNG, JPG/JPEG, WebP tối đa 10 MB).
                </p>
              </div>
            </header>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="support-kind"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Loại yêu cầu
                </label>
                <select
                  id="support-kind"
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as 'SUPPORT' | 'BUG_REPORT')
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="SUPPORT">Hỗ trợ tài khoản</option>
                  <option value="BUG_REPORT">Báo lỗi ứng dụng</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="support-text"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Nội dung chi tiết
                </label>
                <textarea
                  id="support-text"
                  required
                  rows={4}
                  placeholder="Mô tả vấn đề bạn gặp phải..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="evidence-file"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Ảnh minh chứng (bắt buộc)
                </label>
                <label
                  htmlFor="evidence-file"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 hover:border-blue-400"
                >
                  <Upload className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
                  <span>{file ? file.name : 'Chọn ảnh PNG, JPG hoặc WebP...'}</span>
                </label>
                <input
                  id="evidence-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                {file && previewUrl && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt={file.name}
                        className="h-16 w-16 shrink-0 rounded-md border border-slate-200 bg-white object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Xóa ảnh đã chọn"
                      onClick={() => setFile(null)}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Send className="h-4 w-4" strokeWidth={1.75} />
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </form>

            {errorMsg && (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{errorMsg}</span>
                </div>
                {uploadFailed && (
                  <button
                    type="button"
                    onClick={submitFlow}
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-700 hover:underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Thử tải lại
                  </button>
                )}
              </div>
            )}

            {submitted && (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-sm font-medium text-blue-950">
                <CheckCircle2 className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
                Đã tiếp nhận yêu cầu #{submitted.id.slice(0, 8)} ({submitted.state})
              </div>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <History className="h-4 w-4 text-blue-600" strokeWidth={1.75} />
              Lịch sử báo cáo hỗ trợ ({history.totalItems})
            </h2>
            <select
              aria-label="Số báo cáo mỗi trang"
              value={historyPageSize}
              onChange={(e) => {
                setHistoryPage(1);
                setHistoryPageSize(Number(e.target.value) as PageSize);
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm"
            >
              {[10, 20, 30, 40, 50].map((s) => (
                <option key={s} value={s}>
                  {s} / trang
                </option>
              ))}
            </select>
          </div>

          {history.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Bạn chưa có yêu cầu hỗ trợ nào.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.items.map((item) => {
                const view = evidenceMap[item.id];
                const expired =
                  view !== undefined && isViewingUrlExpired(view.expiresAt);

                return (
                  <li key={item.id} className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        [{item.kind}] #{item.id.slice(0, 8)}
                      </span>
                      <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {item.state}
                      </span>
                    </div>

                    <p className="text-sm whitespace-pre-wrap text-slate-700">
                      {item.text}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        Gửi lúc: {new Date(item.submittedAt).toLocaleString('vi-VN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleLoadEvidence(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5 text-blue-600" strokeWidth={1.75} />
                        {view ? 'Tải lại ảnh minh chứng' : 'Xem ảnh minh chứng'}
                      </button>
                    </div>

                    {view && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        {expired ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-amber-700">
                              Liên kết xem ảnh đã hết hạn.
                            </span>
                            <button
                              type="button"
                              onClick={() => handleLoadEvidence(item.id)}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              Làm mới liên kết
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={view.viewingUrl}
                              alt={`Minh chứng cho yêu cầu ${item.id.slice(0, 8)}`}
                              className="max-h-64 rounded-lg border border-slate-200 bg-white object-contain"
                            />
                            <a
                              href={view.viewingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-xs text-blue-600 hover:underline"
                            >
                              Mở ảnh gốc trong tab mới
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {history.totalItems > historyPageSize && (
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 text-sm">
              <button
                type="button"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-200 px-3 py-1 disabled:opacity-50"
              >
                Trang trước
              </button>
              <span className="text-slate-600">Trang {historyPage}</span>
              <button
                type="button"
                disabled={historyPage * historyPageSize >= history.totalItems}
                onClick={() => setHistoryPage((p) => p + 1)}
                className="rounded border border-slate-200 px-3 py-1 disabled:opacity-50"
              >
                Trang sau
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
