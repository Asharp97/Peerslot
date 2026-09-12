import { NextResponse } from "next/server";
import { authorizeApiProvider } from "@/lib/api-authorization";
import {
  personalActivityRangeSchema,
  personalActivityScheduleSchema,
} from "@/lib/personal-activity";
import {
  listPersonalActivityOccurrences,
  savePersonalActivitySchedule,
} from "@/lib/personal-activities";
import { personalActivityErrorResponse } from "../error-response";
export async function GET(request: Request) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const url = new URL(request.url);
  const range = personalActivityRangeSchema.safeParse({
    startsAt: url.searchParams.get("startsAt"),
    endsAt: url.searchParams.get("endsAt"),
  });
  if (!range.success)
    return NextResponse.json(
      { error: "Choose a valid calendar range of up to 45 days." },
      { status: 400 },
    );
  return NextResponse.json(
    {
      activities: await listPersonalActivityOccurrences(
        auth.currentUser.user.id,
        range.data,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const input = personalActivityScheduleSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return NextResponse.json(
      {
        code: "invalid_activity_time",
        error:
          "Choose an activity and an end time after its start, up to 24 hours later.",
      },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      {
        schedule: await savePersonalActivitySchedule(
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
