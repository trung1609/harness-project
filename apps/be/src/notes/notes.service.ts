import {
  parsePagination,
  type PaginatedResult,
} from '../lists/pagination.js';
import type { NoteRecord, NotesRepository } from './notes.repository.js';

export class ResourceNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'ResourceNotFoundError';
  }
}

const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Application service for owned notes CRUD, 30-day archive/restore, and paginated listing.
 */
export class NotesService {
  constructor(private readonly notes: NotesRepository) {}

  async createNote(
    ownerId: string,
    input: { title: string; body: string; startsAt: Date },
  ): Promise<NoteRecord> {
    return this.notes.create(ownerId, input);
  }

  async getNote(ownerId: string, noteId: string): Promise<NoteRecord> {
    const note = await this.notes.findOwnedById(ownerId, noteId);
    if (!note) {
      throw new ResourceNotFoundError('Note');
    }
    return note;
  }

  async listNotes(
    ownerId: string,
    rawPage?: unknown,
    rawPageSize?: unknown,
  ): Promise<PaginatedResult<NoteRecord>> {
    const pagination = parsePagination(rawPage, rawPageSize);
    const { items, totalItems } = await this.notes.listOwned(
      ownerId,
      pagination,
    );
    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    };
  }

  async updateNote(
    ownerId: string,
    noteId: string,
    patch: { title?: string; body?: string; startsAt?: Date },
  ): Promise<NoteRecord> {
    const updated = await this.notes.updateOwned(ownerId, noteId, patch);
    if (!updated) {
      throw new ResourceNotFoundError('Note');
    }
    return updated;
  }

  async deleteNote(
    ownerId: string,
    noteId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const deleted = await this.notes.deleteOwned(ownerId, noteId, now);
    if (!deleted) {
      throw new ResourceNotFoundError('Note');
    }
  }

  async listArchivedNotes(
    ownerId: string,
    rawPage?: unknown,
    rawPageSize?: unknown,
    now: Date = new Date(),
  ): Promise<PaginatedResult<NoteRecord>> {
    await this.purgeExpiredNotes(now);
    const pagination = parsePagination(rawPage, rawPageSize);
    const { items, totalItems } = await this.notes.listArchivedOwned(
      ownerId,
      pagination,
    );
    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    };
  }

  async restoreNote(ownerId: string, noteId: string): Promise<NoteRecord> {
    const restored = await this.notes.restoreOwned(ownerId, noteId);
    if (!restored) {
      throw new ResourceNotFoundError('Note');
    }
    return restored;
  }

  async permanentlyDeleteNote(ownerId: string, noteId: string): Promise<void> {
    const deleted = await this.notes.permanentlyDeleteOwned(ownerId, noteId);
    if (!deleted) {
      throw new ResourceNotFoundError('Note');
    }
  }

  async purgeExpiredNotes(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ARCHIVE_RETENTION_MS);
    return this.notes.purgeExpiredArchived(cutoff);
  }
}
