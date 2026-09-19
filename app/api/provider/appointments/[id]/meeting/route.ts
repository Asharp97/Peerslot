import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiProvider } from "@/lib/api-authorization";
import { ensureAppointmentMeeting } from "@/lib/google-meet";
import {
  enforceRateLimit,
  requireSameOriginJson,
} from "@/lib/request-security";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = requireSameOriginJson(request);
  if (guard) return guard;
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  if (!id.success)
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const providerId = authorization.currentUser.user.id;
  const limited = enforceRateLimit(request, "google-meet-create", {
    limit: 20,
    windowSeconds: 60,
    subject: providerId,
  });
  if (limited) return limited;
  try {
    const meeting = await ensureAppointmentMeeting(providerId, id.data);
    return NextResponse.json(meeting, {
      status: meeting.status === "not_found" ? 404 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ status: "failed" }, { status: 503 });
  }
}
