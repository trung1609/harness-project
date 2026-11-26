import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PaginationParams } from '../lists/pagination.js';

export interface NoteRecord {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  startsAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

interface NoteRow {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  starts_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

function mapNoteRow(row: NoteRow): NoteRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    body: row.body,
    startsAt: row.starts_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

/**
 * PostgreSQL repository for owned notes.
 */
export class NotesRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    ownerId: string,
    input: { title: string; body: string; startsAt: Date },
  ): Promise<NoteRecord> {
    const id = randomUUID();
    const result = await this.pool.query<NoteRow>(
      `INSERT INTO notes (id, owner_id, title, body, starts_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_id, title, body, starts_at, updated_at`,
      [id, ownerId, input.title, input.body, input.startsAt],
    );
    return mapNoteRow(result.rows[0]);
  }

  async findOwnedById(ownerId: string, noteId: string): Promise<NoteRecord | null> {
    const result = await this.pool.query<NoteRow>(
      `SELECT id, owner_id, title, body, starts_at, updated_at, deleted_at
       FROM notes
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [ownerId, noteId],
    );
    return result.rows[0] ? mapNoteRow(result.rows[0]) : null;
  }

  async listOwned(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<{ items: NoteRecord[]; totalItems: number }> {
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM notes WHERE owner_id = $1 AND deleted_at IS NULL`,
      [ownerId],
    );
    const totalItems = Number(countResult.rows[0].total);

    const rowsResult = await this.pool.query<NoteRow>(
      `SELECT id, owner_id, title, body, starts_at, updated_at, deleted_at
       FROM notes
       WHERE owner_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC, id ASC
       LIMIT $2 OFFSET $3`,
      [ownerId, pagination.limit, pagination.offset],
    );

    return {
      items: rowsResult.rows.map(mapNoteRow),
      totalItems,
    };
  }

  async updateOwned(
    ownerId: string,
    noteId: string,
    patch: { title?: string; body?: string; startsAt?: Date },
  ): Promise<NoteRecord | null> {
    const result = await this.pool.query<NoteRow>(
      `UPDATE notes
       SET title = COALESCE($3, title),
           body = COALESCE($4, body),
           starts_at = COALESCE($5, starts_at),
           updated_at = NOW()
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id, owner_id, title, body, starts_at, updated_at, deleted_at`,
      [
        ownerId,
        noteId,
        patch.title ?? null,
        patch.body ?? null,
        patch.startsAt ?? null,
      ],
    );
    return result.rows[0] ? mapNoteRow(result.rows[0]) : null;
  }

  /**
   * Soft-deletes a note into the archive (retained for 30 days).
   */
  async deleteOwned(ownerId: string, noteId: string, now: Date = new Date()): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE notes
       SET deleted_at = $3
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [ownerId, noteId, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listArchivedOwned(
    ownerId: string,
    pagination: PaginationParams,
  ): Promise<{ items: NoteRecord[]; totalItems: number }> {
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM notes
       WHERE owner_id = $1 AND deleted_at IS NOT NULL`,
      [ownerId],
    );
    const totalItems = Number(countResult.rows[0].total);

    const rowsResult = await this.pool.query<NoteRow>(
      `SELECT id, owner_id, title, body, starts_at, updated_at, deleted_at
       FROM notes
       WHERE owner_id = $1 AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id ASC
       LIMIT $2 OFFSET $3`,
      [ownerId, pagination.limit, pagination.offset],
    );

    return {
      items: rowsResult.rows.map(mapNoteRow),
      totalItems,
    };
  }

  async restoreOwned(ownerId: string, noteId: string): Promise<NoteRecord | null> {
    const result = await this.pool.query<NoteRow>(
      `UPDATE notes
       SET deleted_at = NULL, updated_at = NOW()
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NOT NULL
       RETURNING id, owner_id, title, body, starts_at, updated_at, deleted_at`,
      [ownerId, noteId],
    );
    return result.rows[0] ? mapNoteRow(result.rows[0]) : null;
  }

  async permanentlyDeleteOwned(ownerId: string, noteId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM notes
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NOT NULL`,
      [ownerId, noteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async purgeExpiredArchived(cutoff: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM notes
       WHERE deleted_at IS NOT NULL AND deleted_at <= $1`,
      [cutoff],
    );
    return result.rowCount ?? 0;
  }
}
