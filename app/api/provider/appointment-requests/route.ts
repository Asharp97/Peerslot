import { NextResponse } from "next/server";

import { authorizeApiProvider } from "@/lib/api-authorization";
import { listPendingProviderAppointments } from "@/lib/provider-appointments";

export async function GET(request: Request) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const appointments = await listPendingProviderAppointments(
    currentUser.user.id,
  );

  return NextResponse.json(
    { appointments },
    { headers: { "Cache-Control": "no-store" } },
  );
}
