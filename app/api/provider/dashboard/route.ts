import { NextResponse } from "next/server";

import { authorizeApiOffering } from "@/lib/api-authorization";
import { loadProviderWorkspace } from "@/lib/provider-workspace";

export async function GET(request: Request) {
  const authorization = await authorizeApiOffering(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const workspace = await loadProviderWorkspace(currentUser.user.id);

  if (!workspace) {
    return NextResponse.json(
      { error: "Provider setup required" },
      { status: 404 },
    );
  }

  return NextResponse.json(workspace, {
    headers: { "Cache-Control": "no-store" },
  });
}
