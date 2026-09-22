import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { avatarUrlForKey } from "@/lib/avatar-storage";

export async function updateUserAvatar(userId: string, image: string, previousImage: string | null) {
  const updated = await db.update(user).set({ image, updatedAt: new Date() }).where(and(
    eq(user.id, userId),
    previousImage === null ? isNull(user.image) : eq(user.image, previousImage),
  )).returning({ id: user.id });
  return updated.length > 0;
}

export async function isCurrentAvatar(key: string) {
  const accounts = await db.select({ id: user.id }).from(user)
    .where(eq(user.image, avatarUrlForKey(key))).limit(1);
  return accounts.length > 0;
}
