import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ValidationAppException } from '../common/exceptions/domain-exceptions.js';
import { InvalidPaginationError } from '../lists/pagination.js';
import {
  AuthGuard,
  CsrfGuard,
  Roles,
  RolesGuard,
  type AuthenticatedRequest,
} from '../security/guards.js';
import type { SupportDecisionAction } from './support.repository.js';
import { SupportService } from './support.service.js';

const VALID_DECISIONS = new Set<SupportDecisionAction>([
  'IN_REVIEW',
  'RESOLVED',
  'APPROVE_UNLOCK',
]);

/**
 * Thin HTTP controller for user support requests, evidence upload intents, and ADMIN review actions.
 */
@Controller()
@UseGuards(AuthGuard, CsrfGuard, RolesGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('support/evidence-upload-intents')
  @Roles('USER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createSupportIntent(@Req() req: AuthenticatedRequest) {
    return this.supportService.createUploadIntent(
      req.auth!.account.id,
      'SUPPORT_REQUEST',
    );
  }

  @Get('support/requests')
  @Roles('USER', 'ADMIN')
  async listOwnRequests(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.supportService.listOwnSupportRequests(
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

  @Post('support/requests')
  @Roles('USER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async submitRequest(
    @Req() req: AuthenticatedRequest,
    @Body() body: { kind?: unknown; text?: unknown; intentId?: unknown },
  ) {
    if (
      (body?.kind !== 'SUPPORT' && body?.kind !== 'BUG_REPORT') ||
      typeof body?.text !== 'string' ||
      typeof body?.intentId !== 'string'
    ) {
      throw new ValidationAppException(
        'kind (SUPPORT or BUG_REPORT), text, and intentId are required',
      );
    }
    return this.supportService.submitSupportRequest(req.auth!.account.id, {
      kind: body.kind,
      text: body.text,
      intentId: body.intentId,
    });
  }

  @Get('support/requests/:requestId/evidence')
  @Roles('USER', 'ADMIN')
  async getOwnEvidence(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ) {
    return this.supportService.getEvidenceViewingUrl(
      req.auth!.account.id,
      req.auth!.account.role,
      requestId,
    );
  }

  @Get('admin/support/requests')
  @Roles('ADMIN')
  async listAdminRequests(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.supportService.listSupportRequests(page, pageSize);
    } catch (error: unknown) {
      if (error instanceof InvalidPaginationError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Get('admin/support/requests/:requestId/evidence')
  @Roles('ADMIN')
  async getAdminEvidence(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ) {
    return this.supportService.getEvidenceViewingUrl(
      req.auth!.account.id,
      req.auth!.account.role,
      requestId,
    );
  }

  @Post('admin/support/requests/:requestId/decisions')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async recordDecision(
    @Param('requestId') requestId: string,
    @Body() body: { decision?: unknown },
  ) {
    if (
      typeof body?.decision !== 'string' ||
      !VALID_DECISIONS.has(body.decision as SupportDecisionAction)
    ) {
      throw new ValidationAppException(
        'decision must be IN_REVIEW, RESOLVED, or APPROVE_UNLOCK',
      );
    }
    return this.supportService.recordDecision(
      requestId,
      body.decision as SupportDecisionAction,
    );
  }
}
