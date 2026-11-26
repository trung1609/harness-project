export const ALLOWED_PAGE_SIZES = [10, 20, 30, 40, 50] as const;
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];

export class InvalidPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaginationError';
  }
}

export interface PaginationParams {
  page: number;
  pageSize: AllowedPageSize;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: AllowedPageSize;
  totalItems: number;
}

/**
 * Parses and validates 1-based page and allowed pageSize (default 10; allowed: 10, 20, 30, 40, 50).
 */
export function parsePagination(
  rawPage?: unknown,
  rawPageSize?: unknown,
): PaginationParams {
  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    throw new InvalidPaginationError('page must be an integer >= 1');
  }

  const pageSize = rawPageSize === undefined ? 10 : Number(rawPageSize);
  if (
    !Number.isInteger(pageSize) ||
    !(ALLOWED_PAGE_SIZES as readonly number[]).includes(pageSize)
  ) {
    throw new InvalidPaginationError(
      'pageSize must be one of 10, 20, 30, 40, 50',
    );
  }

  const validPageSize = pageSize as AllowedPageSize;
  return {
    page,
    pageSize: validPageSize,
    limit: validPageSize,
    offset: (page - 1) * validPageSize,
  };
}
