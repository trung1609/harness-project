import { apiFetch, type ApiFetchOptions } from '../../lib/api/client';

export interface AuthAccount {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface AuthApiClient {
  register(email: string, password: string): Promise<{ status: string }>;
  activate(token: string): Promise<void>;
  resendActivation(email: string): Promise<{ status: string }>;
  signIn(email: string, password: string): Promise<{ account: AuthAccount }>;
  signOut(): Promise<void>;
  checkProtectedSession(): Promise<unknown>;
}

export function createAuthApiClient(
  baseOptions: Pick<ApiFetchOptions, 'fetchImpl' | 'baseUrl' | 'cookieSource'> = {},
): AuthApiClient {
  return {
    register(email: string, password: string) {
      return apiFetch<{ status: string }>('/auth/registrations', {
        ...baseOptions,
        method: 'POST',
        body: { email, password },
      });
    },
    activate(token: string) {
      return apiFetch<void>('/auth/activations', {
        ...baseOptions,
        method: 'POST',
        body: { token },
      });
    },
    resendActivation(email: string) {
      return apiFetch<{ status: string }>('/auth/activation-emails', {
        ...baseOptions,
        method: 'POST',
        body: { email },
      });
    },
    signIn(email: string, password: string) {
      return apiFetch<{ account: AuthAccount }>('/auth/sessions', {
        ...baseOptions,
        method: 'POST',
        body: { email, password },
      });
    },
    signOut() {
      return apiFetch<void>('/auth/sessions/current', {
        ...baseOptions,
        method: 'DELETE',
      });
    },
    checkProtectedSession() {
      return apiFetch<unknown>('/tasks?page=1&pageSize=10', {
        ...baseOptions,
        method: 'GET',
      });
    },
  };
}
