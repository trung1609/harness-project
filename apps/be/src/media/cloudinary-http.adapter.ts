import { createHash } from 'node:crypto';
import type {
  CloudinaryAdapter,
  CloudinaryAssetMetadata,
} from './cloudinary.adapter.js';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function signParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
}

/**
 * Real Cloudinary HTTP adapter using signed uploads and Admin API metadata verification.
 */
export class CloudinaryHttpAdapter implements CloudinaryAdapter {
  constructor(private readonly config: CloudinaryConfig) {}

  async createSignedUploadParams(
    publicId: string,
    expiresAt: Date,
  ): Promise<Record<string, unknown>> {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      overwrite: 'false',
      public_id: publicId,
      timestamp,
      type: 'authenticated',
    };
    const signature = signParams(paramsToSign, this.config.apiSecret);

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`,
      apiKey: this.config.apiKey,
      timestamp,
      signature,
      publicId,
      type: 'authenticated',
      overwrite: 'false',
      expiresAt: expiresAt.toISOString(),
    };
  }

  async fetchAssetMetadata(
    publicId: string,
  ): Promise<CloudinaryAssetMetadata | null> {
    const encodedId = publicId
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    const auth = Buffer.from(
      `${this.config.apiKey}:${this.config.apiSecret}`,
    ).toString('base64');

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/resources/image/authenticated/${encodedId}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
    );

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Cloudinary metadata fetch failed (${res.status})`);
    }

    const data = (await res.json()) as {
      asset_id: string;
      public_id: string;
      secure_url: string;
      type: string;
      format: string;
      bytes: number;
    };

    return {
      assetId: data.asset_id,
      publicId: data.public_id,
      secureUrl: data.secure_url,
      deliveryType: data.type,
      format: data.format,
      bytes: data.bytes,
    };
  }

  async createViewingUrl(publicId: string, expiresAt: Date): Promise<string> {
    const timestamp = Math.floor(expiresAt.getTime() / 1000);
    const paramsToSign = {
      public_id: publicId,
      timestamp,
      type: 'authenticated',
    };
    const signature = signParams(paramsToSign, this.config.apiSecret);

    const query = new URLSearchParams({
      public_id: publicId,
      type: 'authenticated',
      timestamp: String(timestamp),
      api_key: this.config.apiKey,
      signature,
    });
    return `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/download?${query.toString()}`;
  }

  async deleteAsset(publicId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      public_id: publicId,
      timestamp,
      type: 'authenticated',
    };
    const signature = signParams(paramsToSign, this.config.apiSecret);

    const body = new URLSearchParams({
      public_id: publicId,
      type: 'authenticated',
      timestamp: String(timestamp),
      api_key: this.config.apiKey,
      signature,
    });

    await fetch(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/destroy`,
      {
        method: 'POST',
        body,
      },
    );
  }
}
