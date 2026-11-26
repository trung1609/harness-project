import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  NotFoundAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';
import {
  InvalidPaginationError,
  parsePagination,
} from '../lists/pagination.js';
import {
  AuthGuard,
  CsrfGuard,
  Roles,
  RolesGuard,
} from '../security/guards.js';
import { AccountsRepository } from './accounts.repository.js';

/**
 * Thin ADMIN controller for listing accounts and locking/unlocking them.
 */
@Controller('admin/users')
@UseGuards(AuthGuard, CsrfGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly accounts: AccountsRepository) {}

  @Get()
  async listUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      const pagination = parsePagination(page, pageSize);
      const { items, totalItems } = await this.accounts.listAccounts(pagination);
      return {
        items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems,
      };
    } catch (error: unknown) {
      if (error instanceof InvalidPaginationError) {
        throw new ValidationAppException(error.message);
      }
      throw error;
    }
  }

  @Put(':userId/lock')
  async setAccountLock(
    @Param('userId') userId: string,
    @Body() body: { locked?: unknown },
  ) {
    if (typeof body?.locked !== 'boolean') {
      throw new ValidationAppException('locked boolean is required');
    }

    const updated = body.locked
      ? await this.accounts.lockAccount(userId)
      : await this.accounts.unlockAccount(userId);

    if (!updated) {
      throw new NotFoundAppException('Account not found');
    }

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      lockedAt: updated.lockedAt,
    };
  }
}
