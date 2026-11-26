import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  Optional,
  type DynamicModule,
  type NestApplicationOptions,
  type OnModuleDestroy,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { AccountsRepository } from './accounts/accounts.repository.js';
import { AdminUsersController } from './accounts/admin-users.controller.js';
import { ActivationService } from './auth/activation.service.js';
import {
  AuthController,
  COOKIE_SECURE_TOKEN,
  CSRF_SECRET_TOKEN,
} from './auth/auth.controller.js';
import { RedisSessionStore } from './auth/session-store.js';
import { SessionService } from './auth/session.service.js';
import { AppExceptionFilter } from './common/filters/http-exception.filter.js';
import { loadDatabaseConfig } from './config/env.js';
import { createPgPool } from './db/postgres.js';
import { createRedisClient } from './db/redis.js';
import { ActivationMailerService, type MailSender } from './mail/mail.service.js';
import { SmtpMailSender } from './mail/smtp-mail.sender.js';
import {
  SupportMailerService,
  type SupportMailSender,
} from './mail/support-mail.service.js';
import type { CloudinaryAdapter } from './media/cloudinary.adapter.js';
import { NotesController } from './notes/notes.controller.js';
import { NotesRepository } from './notes/notes.repository.js';
import { NotesService } from './notes/notes.service.js';
import { SchedulingController } from './scheduling/scheduling.controller.js';
import { SchedulingRepository } from './scheduling/scheduling.repository.js';
import { SchedulingService } from './scheduling/scheduling.service.js';
import {
  AuthGuard,
  CSRF_GUARD_SECRET,
  CsrfGuard,
  RolesGuard,
} from './security/guards.js';
import { SupportController } from './support/support.controller.js';
import { SupportRepository } from './support/support.repository.js';
import { SupportService } from './support/support.service.js';
import { TasksController } from './tasks/tasks.controller.js';
import { TasksRepository } from './tasks/tasks.repository.js';
import { TasksService } from './tasks/tasks.service.js';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({})
class AppModule implements OnModuleDestroy {
  constructor(
    @Optional() @Inject('PG_POOL') private readonly pool?: Pool,
    @Optional() @Inject('REDIS_CLIENT') private readonly redis?: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }

  static register(): DynamicModule {
    const hasDbEnv = Boolean(
      process.env.DATABASE_URL?.trim() && process.env.REDIS_URL?.trim(),
    );
    if (!hasDbEnv) {
      return {
        module: AppModule,
        controllers: [HealthController],
      };
    }

    const { databaseUrl, redisUrl } = loadDatabaseConfig();
    const pool = createPgPool(databaseUrl);
    const redis = createRedisClient(redisUrl);
    const csrfSecret =
      process.env.CSRF_SECRET?.trim() || 'local-dev-csrf-secret';
    const jwtSecret =
      process.env.JWT_SECRET?.trim() || csrfSecret;
    const secureCookies = process.env.NODE_ENV === 'production';
    const appBaseUrl =
      process.env.APP_BASE_URL?.trim() || 'http://localhost:3000';

    const accountsRepo = new AccountsRepository(pool);
    const notesRepo = new NotesRepository(pool);
    const tasksRepo = new TasksRepository(pool);
    const schedulingRepo = new SchedulingRepository(pool);
    const supportRepo = new SupportRepository(pool);

    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const smtpPort = Number(process.env.SMTP_PORT?.trim() || '465');
    const smtpSender =
      smtpUser && smtpPass
        ? new SmtpMailSender({
            host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
            port: Number.isInteger(smtpPort) ? smtpPort : 465,
            user: smtpUser,
            pass: smtpPass,
            from: process.env.MAIL_FROM?.trim() || smtpUser,
          })
        : null;

    const mailSender: MailSender = smtpSender ?? {
      async sendActivationEmail(to, activationUrl) {
        console.log(`[mail:dev] Activation link for ${to}: ${activationUrl}`);
      },
    };

    const activationMailer = new ActivationMailerService(
      pool,
      redis,
      accountsRepo,
      mailSender,
      (token) => `${appBaseUrl}/activate?token=${encodeURIComponent(token)}`,
    );

    const activationService = new ActivationService(
      accountsRepo,
      redis,
      activationMailer,
      (token) => `${appBaseUrl}/activate?token=${encodeURIComponent(token)}`,
    );

    const sessionStore = new RedisSessionStore(redis, jwtSecret);
    const sessionService = new SessionService(
      accountsRepo,
      activationService,
      sessionStore,
      csrfSecret,
    );

    const notesService = new NotesService(notesRepo);
    const tasksService = new TasksService(tasksRepo, notesRepo);
    const schedulingService = new SchedulingService(schedulingRepo);

    const supportMailSender: SupportMailSender = smtpSender ?? {
      async sendSupportNotification(to, subject) {
        console.log(`[mail:dev] Support notification for ${to}: ${subject}`);
      },
    };
    const supportMailer = new SupportMailerService(pool, supportMailSender);
    const cloudinaryPlaceholder: CloudinaryAdapter = {
      async createSignedUploadParams(publicId, expiresAt) {
        return { publicId, expiresAt: expiresAt.toISOString() };
      },
      async fetchAssetMetadata() {
        return null;
      },
      async createViewingUrl(publicId, expiresAt) {
        return `https://res.cloudinary.com/demo/image/authenticated/${publicId}?exp=${expiresAt.getTime()}`;
      },
      async deleteAsset() {},
    };
    const supportService = new SupportService(
      supportRepo,
      cloudinaryPlaceholder,
      supportMailer,
    );

    const reflector = new Reflector();

    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        NotesController,
        TasksController,
        SchedulingController,
        SupportController,
        AdminUsersController,
      ],
      providers: [
        { provide: 'PG_POOL', useValue: pool },
        { provide: 'REDIS_CLIENT', useValue: redis },
        { provide: CSRF_SECRET_TOKEN, useValue: csrfSecret },
        { provide: CSRF_GUARD_SECRET, useValue: csrfSecret },
        { provide: COOKIE_SECURE_TOKEN, useValue: secureCookies },
        { provide: Reflector, useValue: reflector },
        { provide: AccountsRepository, useValue: accountsRepo },
        { provide: ActivationService, useValue: activationService },
        { provide: SessionService, useValue: sessionService },
        { provide: NotesService, useValue: notesService },
        { provide: TasksService, useValue: tasksService },
        { provide: SchedulingService, useValue: schedulingService },
        { provide: SupportService, useValue: supportService },
        { provide: AuthGuard, useValue: new AuthGuard(sessionService) },
        { provide: CsrfGuard, useValue: new CsrfGuard(csrfSecret) },
        { provide: RolesGuard, useValue: new RolesGuard(reflector) },
      ],
    };
  }
}

export async function createApp(options?: NestApplicationOptions) {
  const app = await NestFactory.create(AppModule.register(), options);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AppExceptionFilter());
  return app;
}
