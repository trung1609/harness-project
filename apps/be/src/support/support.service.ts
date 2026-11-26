import { randomUUID } from 'node:crypto';
import {
  NotFoundAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';
import {
  parsePagination,
  type PaginatedResult,
} from '../lists/pagination.js';
import type { SupportMailerService } from '../mail/support-mail.service.js';
import {
  validateCloudinaryAsset,
  type CloudinaryAdapter,
} from '../media/cloudinary.adapter.js';
import type {
  SupportDecisionAction,
  SupportIntentPurpose,
  SupportRepository,
  SupportRequestKind,
  SupportRequestRecord,
} from './support.repository.js';

const INTENT_TTL_MS = 10 * 60 * 1000;
const VIEW_URL_TTL_MS = 5 * 60 * 1000;

/**
 * Application service for support/unlock requests, evidence upload verification, viewing URLs, and ADMIN decisions.
 */
export class SupportService {
  constructor(
    private readonly support: SupportRepository,
    private readonly cloudinary: CloudinaryAdapter,
    private readonly mailer: SupportMailerService,
  ) {}

  async createUploadIntent(
    requesterId: string,
    purpose: SupportIntentPurpose,
    now: Date = new Date(),
  ) {
    const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
    const publicId = `support/${requesterId}/${randomUUID()}`;
    const intent = await this.support.createUploadIntent(
      requesterId,
      purpose,
      publicId,
      expiresAt,
    );
    const uploadParams = await this.cloudinary.createSignedUploadParams(
      publicId,
      expiresAt,
    );

    return {
      intentId: intent.id,
      publicId: intent.publicId,
      expiresAt: intent.expiresAt.toISOString(),
      uploadParams,
    };
  }

  async submitSupportRequest(
    requesterId: string,
    input: { kind: 'SUPPORT' | 'BUG_REPORT'; text: string; intentId: string },
    now: Date = new Date(),
  ): Promise<SupportRequestRecord> {
    return this.submitWithEvidence(
      requesterId,
      'SUPPORT_REQUEST',
      input.kind,
      input.text,
      input.intentId,
      now,
    );
  }

  async submitUnlockRequest(
    requesterId: string,
    input: { text: string; intentId: string },
    now: Date = new Date(),
  ): Promise<SupportRequestRecord> {
    return this.submitWithEvidence(
      requesterId,
      'UNLOCK_REQUEST',
      'UNLOCK',
      input.text,
      input.intentId,
      now,
    );
  }

  private async submitWithEvidence(
    requesterId: string,
    expectedPurpose: SupportIntentPurpose,
    kind: SupportRequestKind,
    text: string,
    intentId: string,
    now: Date,
  ): Promise<SupportRequestRecord> {
    if (!text.trim()) {
      throw new ValidationAppException('Request text is required');
    }

    const intent = await this.support.findUploadIntentForRequester(
      requesterId,
      intentId,
      expectedPurpose,
      now,
    );
    const rawAsset = await this.cloudinary.fetchAssetMetadata(intent.publicId);
    const asset = validateCloudinaryAsset(rawAsset, intent.publicId);

    return this.support.submitRequestWithEvidenceTx({
      requesterId,
      intentId: intent.id,
      expectedPurpose,
      kind,
      text: text.trim(),
      asset,
      now,
    });
  }

  async getEvidenceViewingUrl(
    viewerId: string,
    viewerRole: 'ADMIN' | 'USER',
    requestId: string,
    now: Date = new Date(),
  ): Promise<{ viewingUrl: string; expiresAt: string }> {
    const request = await this.support.findRequestWithEvidence(requestId);
    if (!request) {
      throw new NotFoundAppException('Support request not found');
    }
    if (viewerRole !== 'ADMIN' && request.requesterId !== viewerId) {
      throw new NotFoundAppException('Support request not found');
    }

    const expiresAt = new Date(now.getTime() + VIEW_URL_TTL_MS);
    const viewingUrl = await this.cloudinary.createViewingUrl(
      request.evidence.publicId,
      expiresAt,
    );
    return { viewingUrl, expiresAt: expiresAt.toISOString() };
  }

  async listSupportRequests(
    rawPage?: unknown,
    rawPageSize?: unknown,
  ): Promise<PaginatedResult<SupportRequestRecord>> {
    const pagination = parsePagination(rawPage, rawPageSize);
    const { items, totalItems } = await this.support.listRequests(pagination);
    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
    };
  }

  async recordDecision(
    requestId: string,
    decision: SupportDecisionAction,
    now: Date = new Date(),
  ): Promise<{ request: SupportRequestRecord; emailDelivered: boolean }> {
    const txResult = await this.support.recordDecisionTx(
      requestId,
      decision,
      now,
    );

    const subject =
      txResult.notificationType === 'UNLOCK_APPROVED'
        ? 'Your account has been unlocked'
        : 'Update on your support request';
    const body = `Request ${txResult.request.id} status: ${txResult.request.state}`;

    const emailDelivered = await this.mailer.deliverJob(
      txResult.notificationJobId,
      txResult.recipientEmail,
      subject,
      body,
      now,
    );

    return { request: txResult.request, emailDelivered };
  }

  async cleanupAbandonedUploads(now: Date = new Date()): Promise<number> {
    const expired = await this.support.findExpiredUnconsumedIntents(now);
    let cleaned = 0;
    for (const intent of expired) {
      await this.cloudinary.deleteAsset(intent.publicId);
      await this.support.deleteIntent(intent.id);
      cleaned += 1;
    }
    return cleaned;
  }
}
