import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  ConflictAppException,
  GoneAppException,
  NotFoundAppException,
} from '../common/exceptions/domain-exceptions.js';
import type { PaginationParams } from '../lists/pagination.js';
import type { CloudinaryAssetMetadata } from '../media/cloudinary.adapter.js';

export type SupportIntentPurpose = 'SUPPORT_REQUEST' | 'UNLOCK_REQUEST';
export type SupportRequestKind = 'SUPPORT' | 'BUG_REPORT' | 'UNLOCK';
export type SupportRequestState = 'SUBMITTED' | 'IN_REVIEW' | 'RESOLVED';
export type SupportDecisionAction =
  | 'IN_REVIEW'
  | 'RESOLVED'
  | 'APPROVE_UNLOCK';

export interface UploadIntentRecord {
  id: string;
  requesterId: string;
  purpose: SupportIntentPurpose;
  publicId: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface SupportRequestRecord {
  id: string;
  requesterId: string;
  kind: SupportRequestKind;
  text: string;
  state: SupportRequestState;
  submittedAt: Date;
  reviewedAt: Date | null;
  evidence: {
    id: string;
    cloudinaryAssetId: string;
    publicId: string;
    imageUrl: string;
  } | null;
}

interface IntentRow {
  id: string;
  requester_id: string;
  purpose: SupportIntentPurpose;
  public_id: string;
  expires_at: Date;
  consumed_at: Date | null;
}

interface SupportJoinedRow {
  id: string;
  requester_id: string;
  type: SupportRequestKind;
  request_text: string;
  status: SupportRequestState;
  submitted_at: Date;
  reviewed_at: Date | null;
  evidence_id: string | null;
  cloudinary_asset_id: string | null;
  public_id: string | null;
  image_url: string | null;
}

function mapJoinedRow(row: SupportJoinedRow): SupportRequestRecord {
  return {
    id: row.id,
    requesterId: row.requester_id,
    kind: row.type,
    text: row.request_text,
    state: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    evidence:
      row.evidence_id &&
      row.cloudinary_asset_id &&
      row.public_id &&
      row.image_url
        ? {
            id: row.evidence_id,
            cloudinaryAssetId: row.cloudinary_asset_id,
            publicId: row.public_id,
            imageUrl: row.image_url,
          }
        : null,
  };
}

/**
 * PostgreSQL repository for evidence upload intents, support/unlock requests, and atomic ADMIN decisions.
 */
export class SupportRepository {
  constructor(private readonly pool: Pool) {}

  async createUploadIntent(
    requesterId: string,
    purpose: SupportIntentPurpose,
    publicId: string,
    expiresAt: Date,
  ): Promise<UploadIntentRecord> {
    const id = randomUUID();
    const res = await this.pool.query<IntentRow>(
      `INSERT INTO evidence_upload_intents (id, requester_id, purpose, public_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, requester_id, purpose, public_id, expires_at, consumed_at`,
      [id, requesterId, purpose, publicId, expiresAt],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      requesterId: row.requester_id,
      purpose: row.purpose,
      publicId: row.public_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async findUploadIntentForRequester(
    requesterId: string,
    intentId: string,
    expectedPurpose: SupportIntentPurpose,
    now: Date,
  ): Promise<UploadIntentRecord> {
    const res = await this.pool.query<IntentRow>(
      `SELECT id, requester_id, purpose, public_id, expires_at, consumed_at
       FROM evidence_upload_intents
       WHERE id = $1`,
      [intentId],
    );
    const row = res.rows[0];
    if (!row || row.requester_id !== requesterId || row.purpose !== expectedPurpose) {
      throw new NotFoundAppException('Upload intent not found');
    }
    if (row.consumed_at !== null) {
      throw new GoneAppException(
        'Upload intent has already been used',
        'UPLOAD_INTENT_CONSUMED',
      );
    }
    if (row.expires_at.getTime() <= now.getTime()) {
      throw new GoneAppException(
        'Upload intent has expired',
        'UPLOAD_INTENT_EXPIRED',
      );
    }
    return {
      id: row.id,
      requesterId: row.requester_id,
      purpose: row.purpose,
      publicId: row.public_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async submitRequestWithEvidenceTx(input: {
    requesterId: string;
    intentId: string;
    expectedPurpose: SupportIntentPurpose;
    kind: SupportRequestKind;
    text: string;
    asset: CloudinaryAssetMetadata;
    now: Date;
  }): Promise<SupportRequestRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const intentRes = await client.query<IntentRow>(
        `SELECT id, requester_id, purpose, public_id, expires_at, consumed_at
         FROM evidence_upload_intents
         WHERE id = $1
         FOR UPDATE`,
        [input.intentId],
      );
      const intent = intentRes.rows[0];
      if (
        !intent ||
        intent.requester_id !== input.requesterId ||
        intent.purpose !== input.expectedPurpose
      ) {
        throw new NotFoundAppException('Upload intent not found');
      }
      if (intent.consumed_at !== null) {
        throw new GoneAppException(
          'Upload intent has already been used',
          'UPLOAD_INTENT_CONSUMED',
        );
      }
      if (intent.expires_at.getTime() <= input.now.getTime()) {
        throw new GoneAppException(
          'Upload intent has expired',
          'UPLOAD_INTENT_EXPIRED',
        );
      }

      await client.query(
        `UPDATE evidence_upload_intents SET consumed_at = $2 WHERE id = $1`,
        [intent.id, input.now],
      );

      const requestId = randomUUID();
      const evidenceId = randomUUID();

      const reqRes = await client.query<{
        id: string;
        requester_id: string;
        type: SupportRequestKind;
        request_text: string;
        status: SupportRequestState;
        submitted_at: Date;
        reviewed_at: Date | null;
      }>(
        `INSERT INTO support_requests (id, requester_id, type, request_text, status, submitted_at)
         VALUES ($1, $2, $3, $4, 'SUBMITTED', $5)
         RETURNING id, requester_id, type, request_text, status, submitted_at, reviewed_at`,
        [requestId, input.requesterId, input.kind, input.text, input.now],
      );

      const evRes = await client.query<{
        id: string;
        cloudinary_asset_id: string;
        public_id: string;
        image_url: string;
      }>(
        `INSERT INTO support_evidence (id, request_id, cloudinary_asset_id, public_id, image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, cloudinary_asset_id, public_id, image_url`,
        [
          evidenceId,
          requestId,
          input.asset.assetId,
          input.asset.publicId,
          input.asset.secureUrl,
        ],
      );

      await client.query('COMMIT');
      const r = reqRes.rows[0];
      const e = evRes.rows[0];
      return {
        id: r.id,
        requesterId: r.requester_id,
        kind: r.type,
        text: r.request_text,
        state: r.status,
        submittedAt: r.submitted_at,
        reviewedAt: r.reviewed_at,
        evidence: {
          id: e.id,
          cloudinaryAssetId: e.cloudinary_asset_id,
          publicId: e.public_id,
          imageUrl: e.image_url,
        },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findRequestWithEvidence(
    requestId: string,
  ): Promise<SupportRequestRecord | null> {
    const res = await this.pool.query<SupportJoinedRow>(
      `SELECT sr.id, sr.requester_id, sr.type, sr.request_text, sr.status,
              sr.submitted_at, sr.reviewed_at,
              se.id AS evidence_id, se.cloudinary_asset_id, se.public_id, se.image_url
       FROM support_requests sr
       LEFT JOIN support_evidence se ON se.request_id = sr.id
       WHERE sr.id = $1`,
      [requestId],
    );
    return res.rows[0] ? mapJoinedRow(res.rows[0]) : null;
  }

  async listRequests(
    pagination: PaginationParams,
  ): Promise<{ items: SupportRequestRecord[]; totalItems: number }> {
    const countRes = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM support_requests`,
    );
    const totalItems = Number(countRes.rows[0].total);

    const rowsRes = await this.pool.query<SupportJoinedRow>(
      `SELECT sr.id, sr.requester_id, sr.type, sr.request_text, sr.status,
              sr.submitted_at, sr.reviewed_at,
              se.id AS evidence_id, se.cloudinary_asset_id, se.public_id, se.image_url
       FROM support_requests sr
       LEFT JOIN support_evidence se ON se.request_id = sr.id
       ORDER BY sr.submitted_at DESC, sr.id ASC
       LIMIT $1 OFFSET $2`,
      [pagination.limit, pagination.offset],
    );

    return {
      items: rowsRes.rows.map(mapJoinedRow),
      totalItems,
    };
  }

  async listRequestsByRequester(
    requesterId: string,
    pagination: PaginationParams,
  ): Promise<{ items: SupportRequestRecord[]; totalItems: number }> {
    const countRes = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM support_requests
       WHERE requester_id = $1`,
      [requesterId],
    );
    const totalItems = Number(countRes.rows[0].total);

    const rowsRes = await this.pool.query<SupportJoinedRow>(
      `SELECT sr.id, sr.requester_id, sr.type, sr.request_text, sr.status,
              sr.submitted_at, sr.reviewed_at,
              se.id AS evidence_id, se.cloudinary_asset_id, se.public_id, se.image_url
       FROM support_requests sr
       LEFT JOIN support_evidence se ON se.request_id = sr.id
       WHERE sr.requester_id = $1
       ORDER BY sr.submitted_at DESC, sr.id ASC
       LIMIT $2 OFFSET $3`,
      [requesterId, pagination.limit, pagination.offset],
    );

    return {
      items: rowsRes.rows.map(mapJoinedRow),
      totalItems,
    };
  }

  async recordDecisionTx(
    requestId: string,
    decision: SupportDecisionAction,
    now: Date,
  ): Promise<{
    request: SupportRequestRecord;
    notificationJobId: string;
    recipientEmail: string;
    notificationType: 'SUPPORT_DECISION' | 'UNLOCK_APPROVED';
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query<{
        id: string;
        requester_id: string;
        type: SupportRequestKind;
        status: SupportRequestState;
      }>(
        `SELECT id, requester_id, type, status
         FROM support_requests
         WHERE id = $1
         FOR UPDATE`,
        [requestId],
      );
      const existing = reqRes.rows[0];
      if (!existing) {
        throw new NotFoundAppException('Support request not found');
      }

      if (decision === 'APPROVE_UNLOCK' && existing.type !== 'UNLOCK') {
        throw new ConflictAppException(
          'Only unlock requests can be approved for unlock',
          'INVALID_DECISION',
        );
      }

      const nextStatus: SupportRequestState =
        decision === 'IN_REVIEW' ? 'IN_REVIEW' : 'RESOLVED';

      await client.query(
        `UPDATE support_requests
         SET status = $2, reviewed_at = $3
         WHERE id = $1`,
        [requestId, nextStatus, now],
      );

      if (decision === 'APPROVE_UNLOCK') {
        await client.query(
          `UPDATE accounts
           SET locked_at = NULL, lock_reason = NULL, updated_at = NOW()
           WHERE id = $1`,
          [existing.requester_id],
        );
      }

      const accountRes = await client.query<{ email: string }>(
        `SELECT email FROM accounts WHERE id = $1`,
        [existing.requester_id],
      );
      const recipientEmail = accountRes.rows[0]?.email ?? '';

      const notificationJobId = randomUUID();
      const notificationType =
        decision === 'APPROVE_UNLOCK' ? 'UNLOCK_APPROVED' : 'SUPPORT_DECISION';

      await client.query(
        `INSERT INTO notification_jobs
           (id, event_id, notification_type, account_id, support_request_id, status, attempt_count, next_attempt_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6)`,
        [
          notificationJobId,
          `support-decision:${notificationJobId}`,
          notificationType,
          existing.requester_id,
          requestId,
          now,
        ],
      );

      await client.query('COMMIT');

      const full = await this.findRequestWithEvidence(requestId);
      return {
        request: full!,
        notificationJobId,
        recipientEmail,
        notificationType,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findExpiredUnconsumedIntents(
    now: Date,
    limit: number = 50,
  ): Promise<UploadIntentRecord[]> {
    const res = await this.pool.query<IntentRow>(
      `SELECT id, requester_id, purpose, public_id, expires_at, consumed_at
       FROM evidence_upload_intents
       WHERE consumed_at IS NULL AND expires_at <= $1
       ORDER BY expires_at ASC
       LIMIT $2`,
      [now, limit],
    );
    return res.rows.map((row) => ({
      id: row.id,
      requesterId: row.requester_id,
      purpose: row.purpose,
      publicId: row.public_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    }));
  }

  async deleteIntent(intentId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM evidence_upload_intents WHERE id = $1`,
      [intentId],
    );
  }
}
