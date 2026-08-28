import { NextResponse } from "next/server";

import {
  buildAccountExport,
  permanentlyDeleteAccount,
} from "@/lib/account-data";
import { authorizeApiUser } from "@/lib/api-authorization";
import { requireSameOriginJson } from "@/lib/request-security";

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const accountExport = await buildAccountExport(currentUser.user.id);
  if (!accountExport) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(accountExport, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="peerslot-account-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function DELETE(request: Request) {
  const invalidRequest = requireSameOriginJson(request);
  if (invalidRequest) return invalidRequest;

  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const input = (await request.json().catch(() => null)) as {
    confirmation?: unknown;
  } | null;
  if (input?.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm permanent account deletion" },
      { status: 400 },
    );
  }

  const deleted = await permanentlyDeleteAccount(currentUser.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Clear-Site-Data": '"cache", "cookies", "storage"',
    },
  });
}
