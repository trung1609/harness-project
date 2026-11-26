export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function readCookie(
  name: string,
  cookieSource?: string,
): string | null {
  const raw =
    cookieSource ?? (typeof document !== 'undefined' ? document.cookie : '');
  if (!raw) {
    return null;
  }
  for (const part of raw.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIndex + 1).trim());
    }
  }
  return null;
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  cookieSource?: string;
  baseUrl?: string;
  skipRefreshOn401?: boolean;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let inflightRefresh: Promise<boolean> | null = null;

async function runSingleFlightRefresh(
  fetchFn: typeof fetch,
  baseUrl: string,
  cookieSource?: string,
): Promise<boolean> {
  if (!inflightRefresh) {
    const csrf = readCookie('csrf_token', cookieSource);
    inflightRefresh = fetchFn(`${baseUrl}/auth/session-refreshes`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    })
      .then((res) => res.ok)
      .finally(() => {
        inflightRefresh = null;
      });
  }
  return inflightRefresh;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as {
      code?: string;
      message?: string;
      requestId?: string;
    };
    return new ApiError(
      res.status,
      data.code ?? 'HTTP_ERROR',
      data.message ?? res.statusText,
      data.requestId,
    );
  } catch {
    return new ApiError(res.status, 'HTTP_ERROR', res.statusText);
  }
}

/**
 * Calls the backend /api/v1 endpoints with credentials, CSRF header on writes, and single refresh retry on 401.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const fetchFn = options.fetchImpl ?? fetch;
  const method = (options.method ?? 'GET').toUpperCase();
  const baseUrl = options.baseUrl ?? '/api/v1';

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie('csrf_token', options.cookieSource);
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const response = await fetchFn(`${baseUrl}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (
    response.status === 401 &&
    !options.skipRefreshOn401 &&
    path !== '/auth/sessions' &&
    path !== '/auth/session-refreshes'
  ) {
    const refreshed = await runSingleFlightRefresh(
      fetchFn,
      baseUrl,
      options.cookieSource,
    );
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefreshOn401: true });
    }
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
