import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  NotFoundAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';
import { InvalidPaginationError } from '../lists/pagination.js';
import {
  AuthGuard,
  CsrfGuard,
  Roles,
  RolesGuard,
  type AuthenticatedRequest,
} from '../security/guards.js';
import { NotesService, ResourceNotFoundError } from './notes.service.js';

interface CreateNoteBody {
  title?: unknown;
  body?: unknown;
  startsAt?: unknown;
}

interface UpdateNoteBody {
  title?: unknown;
  body?: unknown;
  startsAt?: unknown;
}

function parseDateInput(value: unknown, fieldName: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationAppException(`${fieldName} must be an ISO timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationAppException(`${fieldName} must be a valid timestamp`);
  }
  return parsed;
}

/**
 * Thin HTTP controller for owned notes CRUD and paginated listing.
 */
@Controller('notes')
@UseGuards(AuthGuard, CsrfGuard, RolesGuard)
@Roles('USER', 'ADMIN')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.notesService.listNotes(
        req.auth!.account.id,
        page,
        pageSize,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidPaginationError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateNoteBody,
  ) {
    if (typeof body?.title !== 'string' || !body.title.trim()) {
      throw new ValidationAppException('title is required');
    }
    const noteBody = typeof body.body === 'string' ? body.body : '';
    const startsAt =
      body.startsAt === undefined
        ? new Date()
        : parseDateInput(body.startsAt, 'startsAt');

    return this.notesService.createNote(req.auth!.account.id, {
      title: body.title.trim(),
      body: noteBody,
      startsAt,
    });
  }

  @Get('archived')
  async listArchived(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.notesService.listArchivedNotes(
        req.auth!.account.id,
        page,
        pageSize,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidPaginationError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Get(':noteId')
  async getOne(
    @Req() req: AuthenticatedRequest,
    @Param('noteId') noteId: string,
  ) {
    try {
      return await this.notesService.getNote(req.auth!.account.id, noteId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Patch(':noteId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('noteId') noteId: string,
    @Body() body: UpdateNoteBody,
  ) {
    const patch: { title?: string; body?: string; startsAt?: Date } = {};
    if (body?.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        throw new ValidationAppException('title must be non-empty');
      }
      patch.title = body.title.trim();
    }
    if (body?.body !== undefined) {
      if (typeof body.body !== 'string') {
        throw new ValidationAppException('body must be a string');
      }
      patch.body = body.body;
    }
    if (body?.startsAt !== undefined) {
      patch.startsAt = parseDateInput(body.startsAt, 'startsAt');
    }

    try {
      return await this.notesService.updateNote(
        req.auth!.account.id,
        noteId,
        patch,
      );
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    try {
      await this.notesService.deleteNote(req.auth!.account.id, noteId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Post(':noteId/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @Req() req: AuthenticatedRequest,
    @Param('noteId') noteId: string,
  ) {
    try {
      return await this.notesService.restoreNote(req.auth!.account.id, noteId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Delete(':noteId/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async permanentlyDelete(
    @Req() req: AuthenticatedRequest,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    try {
      await this.notesService.permanentlyDeleteNote(
        req.auth!.account.id,
        noteId,
      );
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }
}
