import { NextResponse } from "next/server";

import { authorizeApiUser } from "@/lib/api-authorization";

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  return NextResponse.json({
    user: currentUser.user,
    provider: currentUser.provider,
    capabilities: currentUser.capabilities,
    authentication: currentUser.authentication,
  });
}
