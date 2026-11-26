import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  NotFoundAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';
import { InvalidPaginationError } from '../lists/pagination.js';
import { ResourceNotFoundError } from '../notes/notes.service.js';
import {
  AuthGuard,
  CsrfGuard,
  Roles,
  RolesGuard,
  type AuthenticatedRequest,
} from '../security/guards.js';
import {
  InvalidTaskSlotError,
  type TaskProgress,
} from './task-status.js';
import { TasksService } from './tasks.service.js';

interface CreateTaskBody {
  title?: unknown;
  scheduledDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

interface UpdateTaskBody {
  title?: unknown;
  scheduledDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

interface SetProgressBody {
  progress?: unknown;
}

const VALID_PROGRESS = new Set<TaskProgress>(['TODO', 'IN_PROGRESS', 'DONE']);

/**
 * Thin HTTP controller for owned daily tasks, progress, and note links.
 */
@Controller('tasks')
@UseGuards(AuthGuard, CsrfGuard, RolesGuard)
@Roles('USER', 'ADMIN')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.tasksService.listTasks(
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
    @Body() body: CreateTaskBody,
  ) {
    if (
      typeof body?.title !== 'string' ||
      !body.title.trim() ||
      typeof body.scheduledDate !== 'string' ||
      typeof body.startTime !== 'string' ||
      typeof body.endTime !== 'string'
    ) {
      throw new ValidationAppException(
        'title, scheduledDate, startTime, and endTime are required',
      );
    }

    try {
      return await this.tasksService.createTask(req.auth!.account.id, {
        title: body.title.trim(),
        scheduledDate: body.scheduledDate,
        startTime: body.startTime,
        endTime: body.endTime,
      });
    } catch (error: unknown) {
      if (error instanceof InvalidTaskSlotError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Get(':taskId')
  async getOne(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ) {
    try {
      return await this.tasksService.getTask(req.auth!.account.id, taskId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Patch(':taskId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskBody,
  ) {
    const patch: {
      title?: string;
      scheduledDate?: string;
      startTime?: string;
      endTime?: string;
    } = {};

    if (body?.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        throw new ValidationAppException('title must be non-empty');
      }
      patch.title = body.title.trim();
    }
    if (body?.scheduledDate !== undefined) {
      if (typeof body.scheduledDate !== 'string') {
        throw new ValidationAppException('scheduledDate must be a string');
      }
      patch.scheduledDate = body.scheduledDate;
    }
    if (body?.startTime !== undefined) {
      if (typeof body.startTime !== 'string') {
        throw new ValidationAppException('startTime must be a string');
      }
      patch.startTime = body.startTime;
    }
    if (body?.endTime !== undefined) {
      if (typeof body.endTime !== 'string') {
        throw new ValidationAppException('endTime must be a string');
      }
      patch.endTime = body.endTime;
    }

    try {
      return await this.tasksService.updateTask(
        req.auth!.account.id,
        taskId,
        patch,
      );
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      if (error instanceof InvalidTaskSlotError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Put(':taskId/progress')
  async setProgress(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: SetProgressBody,
  ) {
    if (
      typeof body?.progress !== 'string' ||
      !VALID_PROGRESS.has(body.progress as TaskProgress)
    ) {
      throw new ValidationAppException(
        'progress must be TODO, IN_PROGRESS, or DONE',
      );
    }

    try {
      return await this.tasksService.setProgress(
        req.auth!.account.id,
        taskId,
        body.progress as TaskProgress,
      );
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    try {
      await this.tasksService.deleteTask(req.auth!.account.id, taskId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Get(':taskId/notes')
  async listNotes(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.tasksService.listTaskNotes(
        req.auth!.account.id,
        taskId,
        page,
        pageSize,
      );
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      if (error instanceof InvalidPaginationError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Put(':taskId/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async linkNote(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    try {
      await this.tasksService.linkNote(req.auth!.account.id, taskId, noteId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }

  @Delete(':taskId/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkNote(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    try {
      await this.tasksService.unlinkNote(req.auth!.account.id, taskId, noteId);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      throw error;
    }
  }
}
