import { NextResponse } from "next/server";

import {
  buildAccountExport,
  permanentlyDeleteAccount,
} from "@/lib/account-data";
import { getCurrentUser } from "@/lib/current-user";
import { requireSameOriginJson } from "@/lib/request-security";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
