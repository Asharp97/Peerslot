import { NextResponse } from "next/server";
import { authorizeApiProvider } from "@/lib/api-authorization";
import { personalActivitySchema } from "@/lib/personal-activity";
import {
  createPersonalActivity,
  listPersonalActivities,
} from "@/lib/personal-activities";
import { personalActivityErrorResponse } from "./error-response";
export async function GET(request: Request) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  return NextResponse.json(
    { activities: await listPersonalActivities(auth.currentUser.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const input = personalActivitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return NextResponse.json(
      {
        code: "invalid_activity",
        error:
          "Enter a name of 1–100 characters and, optionally, a whole-number duration of 1–1440 minutes.",
      },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      {
        activity: await createPersonalActivity(
          auth.currentUser.user.id,
          input.data,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return personalActivityErrorResponse(error);
  }
}
