import {
  Body,
  Controller,
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
  ConflictAppException,
  NotFoundAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';
import {
  AuthGuard,
  CsrfGuard,
  Roles,
  RolesGuard,
  type AuthenticatedRequest,
} from '../security/guards.js';
import { InvalidTaskSlotError } from '../tasks/task-status.js';
import {
  SeriesConflictError,
  SeriesNotFoundError,
  type SeriesDeleteScope,
  type SeriesEditScope,
} from './scheduling.repository.js';
import { SchedulingService } from './scheduling.service.js';
import { InvalidScheduleDateError } from './vietnam-dates.js';

/**
 * Thin HTTP controller for timetable week queries and weekly recurring series edits/deletions.
 */
@Controller()
@UseGuards(AuthGuard, CsrfGuard, RolesGuard)
@Roles('USER', 'ADMIN')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('timetable/weeks')
  async getWeek(
    @Req() req: AuthenticatedRequest,
    @Query('weekStart') weekStart?: string,
  ) {
    if (!weekStart) {
      throw new ValidationAppException('weekStart is required');
    }
    try {
      return await this.schedulingService.getTimetableWeek(
        req.auth!.account.id,
        weekStart,
      );
    } catch (error: unknown) {
      if (error instanceof InvalidScheduleDateError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Post('task-series')
  @HttpCode(HttpStatus.CREATED)
  async createSeries(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      title?: unknown;
      scheduledDate?: unknown;
      startTime?: unknown;
      endTime?: unknown;
      progress?: unknown;
    },
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

    const progress =
      body.progress === 'TODO' ||
      body.progress === 'IN_PROGRESS' ||
      body.progress === 'DONE'
        ? body.progress
        : undefined;

    try {
      return await this.schedulingService.createWeeklySeries(
        req.auth!.account.id,
        {
          title: body.title.trim(),
          scheduledDate: body.scheduledDate,
          startTime: body.startTime,
          endTime: body.endTime,
          progress,
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof InvalidScheduleDateError ||
        error instanceof InvalidTaskSlotError
      ) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Patch('task-series/:seriesId/weeks/:anchorTaskId')
  async editSeries(
    @Req() req: AuthenticatedRequest,
    @Param('seriesId') seriesId: string,
    @Param('anchorTaskId') anchorTaskId: string,
    @Body()
    body: {
      selection?: { scope: SeriesEditScope; additionalTaskIds?: string[] };
      changes?: {
        title?: string;
        scheduledDate?: string;
        startTime?: string;
        endTime?: string;
      };
    },
  ) {
    if (!body?.selection?.scope || !body?.changes) {
      throw new ValidationAppException('selection and changes are required');
    }
    try {
      return await this.schedulingService.editSeries(
        req.auth!.account.id,
        seriesId,
        anchorTaskId,
        body.selection,
        body.changes,
      );
    } catch (error: unknown) {
      if (error instanceof SeriesNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      if (error instanceof SeriesConflictError) {
        throw new ConflictAppException(error.message, 'SERIES_CONFLICT');
      }
      if (
        error instanceof InvalidScheduleDateError ||
        error instanceof InvalidTaskSlotError
      ) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Post('task-series/:seriesId/deletions')
  @HttpCode(HttpStatus.OK)
  async deleteSeries(
    @Req() req: AuthenticatedRequest,
    @Param('seriesId') seriesId: string,
    @Body()
    body: {
      scope?: SeriesDeleteScope;
      weekStart?: string;
      taskIds?: string[];
    },
  ) {
    if (!body?.scope) {
      throw new ValidationAppException('scope is required');
    }
    try {
      return await this.schedulingService.deleteSeriesOccurrences(
        req.auth!.account.id,
        seriesId,
        {
          scope: body.scope,
          weekStart: body.weekStart,
          taskIds: body.taskIds,
        },
      );
    } catch (error: unknown) {
      if (error instanceof SeriesNotFoundError) {
        throw new NotFoundAppException(error.message);
      }
      if (error instanceof SeriesConflictError) {
        throw new ConflictAppException(error.message, 'SERIES_CONFLICT');
      }
      if (error instanceof InvalidScheduleDateError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }
}
