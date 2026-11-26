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

/**
 * Application service for owned notes CRUD and paginated listing.
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

  async deleteNote(ownerId: string, noteId: string): Promise<void> {
    const deleted = await this.notes.deleteOwned(ownerId, noteId);
    if (!deleted) {
      throw new ResourceNotFoundError('Note');
    }
  }
}
