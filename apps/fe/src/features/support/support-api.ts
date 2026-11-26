import { ApiError, apiFetch, type ApiFetchOptions } from '../../lib/api/client';
import type { PaginatedResponse } from '../notes/notes-api';

export const MAX_EVIDENCE_BYTES = 10_000_000;
export const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export interface UploadIntentResponse {
  intentId: string;
  publicId: string;
  expiresAt: string;
  uploadParams: Record<string, unknown>;
}

export interface SupportRequestItem {
  id: string;
  requesterId: string;
  kind: 'SUPPORT' | 'BUG_REPORT' | 'UNLOCK';
  text: string;
  state: 'SUBMITTED' | 'IN_REVIEW' | 'RESOLVED';
  submittedAt: string;
  reviewedAt: string | null;
  evidence?: { id: string } | null;
}

export interface EvidenceViewResponse {
  viewingUrl: string;
  expiresAt: string;
}

export function validateEvidenceFile(file: {
  size: number;
  type: string;
}): string | null {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(file.type)) {
    return 'Chỉ hỗ trợ ảnh định dạng PNG, JPG/JPEG hoặc WebP.';
  }
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    return 'Kích thước ảnh phải lớn hơn 0 và không vượt quá 10 MB (10,000,000 bytes).';
  }
  return null;
}

export function isViewingUrlExpired(
  expiresAt: string,
  nowMs: number = Date.now(),
): boolean {
  const expMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expMs) || nowMs >= expMs;
}

export function createSupportApiClient(
  baseOptions: Pick<ApiFetchOptions, 'fetchImpl' | 'baseUrl' | 'cookieSource'> = {},
) {
  const fetchFn = baseOptions.fetchImpl ?? fetch;

  return {
    createUploadIntent() {
      return apiFetch<UploadIntentResponse>(
        '/support/evidence-upload-intents',
        { ...baseOptions, method: 'POST' },
      );
    },

    async uploadDirectToCloudinary(
      uploadUrl: string,
      formData: FormData,
    ): Promise<void> {
      const response = await fetchFn(uploadUrl, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new ApiError(
          response.status,
          'UPLOAD_FAILED',
          'Tải ảnh lên Cloudinary thất bại. Vui lòng thử lại.',
        );
      }
    },

    submitRequest(input: {
      kind: 'SUPPORT' | 'BUG_REPORT';
      text: string;
      intentId: string;
    }) {
      return apiFetch<SupportRequestItem>('/support/requests', {
        ...baseOptions,
        method: 'POST',
        body: input,
      });
    },

    listOwnRequests(page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<SupportRequestItem>>(
        `/support/requests?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },

    getOwnEvidenceUrl(requestId: string) {
      return apiFetch<EvidenceViewResponse>(
        `/support/requests/${encodeURIComponent(requestId)}/evidence`,
        { ...baseOptions, method: 'GET' },
      );
    },
  };
}
