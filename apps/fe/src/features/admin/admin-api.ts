import { apiFetch, type ApiFetchOptions } from '../../lib/api/client';
import type { PaginatedResponse } from '../notes/notes-api';
import type {
  EvidenceViewResponse,
  SupportRequestItem,
} from '../support/support-api';

export interface AdminUserItem {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  activatedAt: string | null;
  lockedAt: string | null;
  lockReason?: string | null;
}

export type AdminDecisionAction =
  | 'IN_REVIEW'
  | 'RESOLVED'
  | 'APPROVE_UNLOCK';

export function createAdminApiClient(
  baseOptions: Pick<ApiFetchOptions, 'fetchImpl' | 'baseUrl' | 'cookieSource'> = {},
) {
  return {
    listUsers(page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<AdminUserItem>>(
        `/admin/users?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    setUserLock(userId: string, locked: boolean, reason?: string) {
      return apiFetch<AdminUserItem>(
        `/admin/users/${encodeURIComponent(userId)}/lock`,
        {
          ...baseOptions,
          method: 'PUT',
          body: locked ? { locked, reason } : { locked },
        },
      );
    },
    listSupportRequests(page = 1, pageSize = 10) {
      return apiFetch<PaginatedResponse<SupportRequestItem>>(
        `/admin/support/requests?page=${page}&pageSize=${pageSize}`,
        { ...baseOptions, method: 'GET' },
      );
    },
    getAdminEvidenceUrl(requestId: string) {
      return apiFetch<EvidenceViewResponse>(
        `/admin/support/requests/${encodeURIComponent(requestId)}/evidence`,
        { ...baseOptions, method: 'GET' },
      );
    },
    recordDecision(requestId: string, decision: AdminDecisionAction) {
      return apiFetch<{ request: SupportRequestItem; emailDelivered: boolean }>(
        `/admin/support/requests/${encodeURIComponent(requestId)}/decisions`,
        {
          ...baseOptions,
          method: 'POST',
          body: { decision },
        },
      );
    },
  };
}
