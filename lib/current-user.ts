import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { providerProfiles } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function getCurrentUser(request: Request) {
  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return null;
  }

  const { payload } = await auth.api.verifyJWT({ body: { token } });

  if (!payload?.sub) {
    return null;
  }

  const [current] = await db
    .select({ user, provider: providerProfiles })
    .from(user)
    .leftJoin(providerProfiles, eq(providerProfiles.userId, user.id))
    .where(eq(user.id, payload.sub))
    .limit(1);

  if (!current) {
    return null;
  }

  return {
    user: current.user,
    provider: current.provider,
    authentication: "jwt" as const,
    capabilities: {
      canBook: true as const,
      canProvide: current.provider !== null,
    },
  };
}

function getBearerToken(authorization: string | null) {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.trim().split(/\s+/, 2);

  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
