import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export class AvatarStorageConfigurationError extends Error {}
export class InvalidAvatarError extends Error {}

function getStorageConfig() {
  const prefix = process.env.VERCEL_ENV === "preview" ? "PREVIEW_" : "";
  const endpoint = process.env[`${prefix}AWS_ENDPOINT_URL_S3`];
  const accessKeyId = process.env[`${prefix}AWS_ACCESS_KEY_ID`];
  const secretAccessKey = process.env[`${prefix}AWS_SECRET_ACCESS_KEY`];
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new AvatarStorageConfigurationError(
      "Neon object storage credentials are not configured",
    );
  }
  if (prefix && endpoint === process.env.AWS_ENDPOINT_URL_S3) {
    throw new AvatarStorageConfigurationError("Preview storage must use a separate Neon branch");
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket: process.env[`${prefix}NEON_STORAGE_BUCKET`] || "avatars",
    region: process.env[`${prefix}AWS_REGION`] || "eu-central-1",
  };
}

function getClient() {
  const config = getStorageConfig();
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: true,
    region: config.region,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, config };
}

export function isAvatarContentType(
  value: string,
): value is (typeof AVATAR_CONTENT_TYPES)[number] {
  return (AVATAR_CONTENT_TYPES as readonly string[]).includes(value);
}

export function avatarUrlForKey(key: string) {
  return `/api/account/avatar?key=${encodeURIComponent(key)}`;
}

export function avatarKeyFromUrl(value: string | null | undefined) {
  if (!value?.startsWith("/api/account/avatar?")) return null;
  try {
    const parsed = new URL(value, "http://peerslot.local");
    const key = parsed.searchParams.get("key");
    return key && isSafeAvatarKey(key) ? key : null;
  } catch {
    return null;
  }
}

export function isSafeAvatarKey(key: string) {
  return /^users\/[a-f0-9]{64}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(key);
}

export function avatarBelongsToUser(key: string, userId: string) {
  return isSafeAvatarKey(key) && key.startsWith(`users/${userFolder(userId)}/`);
}

export async function uploadAvatar(input: {
  userId: string;
  contentType: (typeof AVATAR_CONTENT_TYPES)[number];
  body: Uint8Array;
}) {
  if (!isAvatarContentType(input.contentType) || !input.body.length || input.body.length > AVATAR_MAX_BYTES) {
    throw new InvalidAvatarError("Choose a JPG, PNG, or WebP image up to 2 MB");
  }
  // Decode the image, bound its dimensions, strip metadata and save a compact,
  // static avatar. MIME headers and filename extensions alone are not trusted.
  let body: Buffer;
  try {
    const source = sharp(input.body, { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await source.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new InvalidAvatarError();
    body = await source.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new InvalidAvatarError("The file is not a valid JPG, PNG, or WebP image");
  }
  const { client: s3, config } = getClient();
  const key = `users/${userFolder(input.userId)}/${randomUUID()}.webp`;
  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Body: body,
      CacheControl: "public, max-age=300",
      ContentType: "image/webp",
      Key: key,
    }),
  );
  return key;
}

export async function deleteAvatar(key: string | null | undefined) {
  if (!key || !isSafeAvatarKey(key)) return;
  const { client: s3, config } = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function signedAvatarUrl(key: string) {
  if (!isSafeAvatarKey(key)) return null;
  const { client: s3, config } = getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: 60 * 60 },
  );
}

function userFolder(userId: string) {
  return createHash("sha256").update(userId).digest("hex");
}
