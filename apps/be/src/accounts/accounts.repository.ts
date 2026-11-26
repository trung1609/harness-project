import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'USER';
  activatedAt: Date | null;
  lockedAt: Date | null;
  sessionGeneration: number;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Email is already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface AccountRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'ADMIN' | 'USER';
  activated_at: Date | null;
  locked_at: Date | null;
  session_generation: number;
}

function mapAccountRow(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    activatedAt: row.activated_at,
    lockedAt: row.locked_at,
    sessionGeneration: row.session_generation,
  };
}

/**
 * PostgreSQL repository for account persistence and activation state.
 */
export class AccountsRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const normalized = normalizeEmail(email);
    const result = await this.pool.query<AccountRow>(
      `SELECT id, email, password_hash, role, activated_at, locked_at, session_generation
       FROM accounts
       WHERE email = $1`,
      [normalized],
    );
    return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT id, email, password_hash, role, activated_at, locked_at, session_generation
       FROM accounts
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
  }

  async createPendingAccount(
    email: string,
    passwordHash: string,
  ): Promise<AccountRecord> {
    const id = randomUUID();
    const normalized = normalizeEmail(email);
    try {
      const result = await this.pool.query<AccountRow>(
        `INSERT INTO accounts (id, email, password_hash, role)
         VALUES ($1, $2, $3, 'USER')
         RETURNING id, email, password_hash, role, activated_at, locked_at, session_generation`,
        [id, normalized, passwordHash],
      );
      return mapAccountRow(result.rows[0]);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async markActivated(accountId: string): Promise<AccountRecord | null> {
    const result = await this.pool.query<AccountRow>(
      `UPDATE accounts
       SET activated_at = COALESCE(activated_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, password_hash, role, activated_at, locked_at, session_generation`,
      [accountId],
    );
    return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
  }

  /**
   * Locks the account and increments session_generation in one atomic update to invalidate existing sessions.
   */
  async lockAccount(accountId: string): Promise<AccountRecord | null> {
    const result = await this.pool.query<AccountRow>(
      `UPDATE accounts
       SET locked_at = COALESCE(locked_at, NOW()),
           session_generation = session_generation + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, password_hash, role, activated_at, locked_at, session_generation`,
      [accountId],
    );
    return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
  }

  /**
   * Unlocks the account for future sign-ins while keeping prior session generations invalid.
   */
  async unlockAccount(accountId: string): Promise<AccountRecord | null> {
    const result = await this.pool.query<AccountRow>(
      `UPDATE accounts
       SET locked_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, password_hash, role, activated_at, locked_at, session_generation`,
      [accountId],
    );
    return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
  }

  /**
   * Lists accounts with safe fields only for ADMIN user management.
   */
  async listAccounts(pagination: {
    limit: number;
    offset: number;
  }): Promise<{
    items: Array<
      Pick<AccountRecord, 'id' | 'email' | 'role' | 'activatedAt' | 'lockedAt'>
    >;
    totalItems: number;
  }> {
    const countRes = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM accounts`,
    );
    const totalItems = Number(countRes.rows[0].total);

    const rowsRes = await this.pool.query<AccountRow>(
      `SELECT id, email, password_hash, role, activated_at, locked_at, session_generation
       FROM accounts
       ORDER BY created_at DESC, id ASC
       LIMIT $1 OFFSET $2`,
      [pagination.limit, pagination.offset],
    );

    return {
      items: rowsRes.rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        activatedAt: row.activated_at,
        lockedAt: row.locked_at,
      })),
      totalItems,
    };
  }
}
