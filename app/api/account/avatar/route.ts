import { NextResponse } from "next/server";

import { authorizeApiUser } from "@/lib/api-authorization";
import { isCurrentAvatar, updateUserAvatar } from "@/lib/account-avatar";
import {
  AVATAR_MAX_BYTES,
  avatarBelongsToUser,
  avatarKeyFromUrl,
  avatarUrlForKey,
  deleteAvatar,
  isAvatarContentType,
  isSafeAvatarKey,
  signedAvatarUrl,
  uploadAvatar,
  AvatarStorageConfigurationError,
  InvalidAvatarError,
} from "@/lib/avatar-storage";
import { enforceRateLimit } from "@/lib/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = validateOrigin(request);
  if (originError) return originError;

  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;
  const rateLimit = await enforceRateLimit(request, "account-avatar-upload", {
    limit: 10,
    subject: currentUser.user.id,
    windowSeconds: 60 * 60,
  });
  if (rateLimit) return rateLimit;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return NextResponse.json({ error: "Upload an image using multipart/form-data" }, { status: 415 });
  }
  // Bound the request before parsing, including clients omitting Content-Length.
  const maximumRequestBytes = AVATAR_MAX_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > maximumRequestBytes || !request.body) {
    return NextResponse.json({ error: "Profile pictures must be up to 2 MB" }, { status: 413 });
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumRequestBytes) {
        await reader.cancel();
        return NextResponse.json({ error: "Profile pictures must be up to 2 MB" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return NextResponse.json({ error: "The image upload was interrupted" }, { status: 400 });
  } finally {
    reader.releaseLock();
  }

  const formData = await new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": contentType },
  }).formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }
  if (!isAvatarContentType(file.type)) {
    return NextResponse.json(
      { error: "Profile pictures must be JPG, PNG, or WebP images" },
      { status: 415 },
    );
  }
  if (file.size === 0 || file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: "Profile pictures must be smaller than 2 MB" },
      { status: 413 },
    );
  }

  let key: string | null = null;
  try {
    key = await uploadAvatar({
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      userId: currentUser.user.id,
    });
    const image = avatarUrlForKey(key);
    const updated = await updateUserAvatar(currentUser.user.id, image, currentUser.user.image ?? null);
    if (!updated) {
      await deleteAvatar(key).catch(() => undefined);
      return NextResponse.json({ error: "Your profile picture changed. Refresh and try again." }, { status: 409 });
    }

    const previousKey = avatarKeyFromUrl(currentUser.user.image);
    if (previousKey && previousKey !== key && avatarBelongsToUser(previousKey, currentUser.user.id)) {
      await deleteAvatar(previousKey).catch(() => undefined);
    }

    return NextResponse.json(
      { user: { image } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (key) await deleteAvatar(key).catch(() => undefined);
    if (error instanceof InvalidAvatarError) {
      return NextResponse.json({ error: error.message }, { status: 415 });
    }
    if (error instanceof AvatarStorageConfigurationError) {
      return NextResponse.json(
        { error: "Profile picture storage is not configured" },
        { status: 503 },
      );
    }
    console.error("avatar_upload_failed", { name: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json(
      { error: "We couldn't save your profile picture" },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !isSafeAvatarKey(key)) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  try {
    if (!(await isCurrentAvatar(key))) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }
    const url = await signedAvatarUrl(key);
    if (!url) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    return NextResponse.redirect(url, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof AvatarStorageConfigurationError) {
      return NextResponse.json({ error: "Avatar storage is not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = new URL(
    process.env.BETTER_AUTH_URL ?? new URL(request.url).origin,
  ).origin;
  return origin === allowed
    ? null
    : NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
}
