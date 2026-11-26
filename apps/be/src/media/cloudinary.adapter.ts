import {
  PayloadTooLargeAppException,
  UnsupportedMediaTypeAppException,
  ValidationAppException,
} from '../common/exceptions/domain-exceptions.js';

export const MAX_EVIDENCE_BYTES = 10_000_000;
export const ALLOWED_EVIDENCE_FORMATS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

export interface CloudinaryAssetMetadata {
  assetId: string;
  publicId: string;
  secureUrl: string;
  deliveryType: string;
  format: string;
  bytes: number;
}

export interface CloudinaryAdapter {
  createSignedUploadParams(
    publicId: string,
    expiresAt: Date,
  ): Promise<Record<string, unknown>>;
  fetchAssetMetadata(publicId: string): Promise<CloudinaryAssetMetadata | null>;
  createViewingUrl(publicId: string, expiresAt: Date): Promise<string>;
  deleteAsset(publicId: string): Promise<void>;
}

/**
 * Validates trusted Cloudinary asset metadata against the assigned public ID, delivery type, format, and 10 MB cap.
 */
export function validateCloudinaryAsset(
  asset: CloudinaryAssetMetadata | null,
  expectedPublicId: string,
): CloudinaryAssetMetadata {
  if (!asset) {
    throw new ValidationAppException(
      'Uploaded evidence asset was not found on storage',
      'EVIDENCE_UPLOAD_MISSING',
    );
  }

  if (asset.publicId !== expectedPublicId) {
    throw new ValidationAppException(
      'Evidence public ID mismatch',
      'EVIDENCE_PUBLIC_ID_MISMATCH',
    );
  }

  if (asset.deliveryType !== 'authenticated') {
    throw new ValidationAppException(
      'Evidence must use authenticated delivery',
      'EVIDENCE_DELIVERY_INVALID',
    );
  }

  const normalizedFormat = asset.format.trim().toLowerCase();
  if (!ALLOWED_EVIDENCE_FORMATS.has(normalizedFormat)) {
    throw new UnsupportedMediaTypeAppException(
      'Supported evidence formats are PNG, JPG/JPEG, and WebP',
      'UNSUPPORTED_IMAGE_FORMAT',
    );
  }

  if (!Number.isFinite(asset.bytes) || asset.bytes <= 0) {
    throw new ValidationAppException(
      'Evidence file is empty',
      'EVIDENCE_EMPTY',
    );
  }

  if (asset.bytes > MAX_EVIDENCE_BYTES) {
    throw new PayloadTooLargeAppException(
      'Evidence exceeds 10,000,000-byte limit',
      'EVIDENCE_TOO_LARGE',
    );
  }

  return asset;
}
