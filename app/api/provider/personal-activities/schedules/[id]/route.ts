import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiProvider } from "@/lib/api-authorization";
import { personalActivityScheduleSchema } from "@/lib/personal-activity";
import {
  savePersonalActivitySchedule,
  deletePersonalActivitySchedule,
} from "@/lib/personal-activities";
import { personalActivityErrorResponse } from "../../error-response";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const input = personalActivityScheduleSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success || !input.success)
    return NextResponse.json(
      {
        code: "invalid_activity_time",
        error:
          "Choose an activity and an end time after its start, up to 24 hours later.",
      },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      schedule: await savePersonalActivitySchedule(
        auth.currentUser.user.id,
        input.data,
        id.data,
      ),
    });
  } catch (error) {
    return personalActivityErrorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: "Invalid schedule ID." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await deletePersonalActivitySchedule(auth.currentUser.user.id, id.data),
    );
  } catch (error) {
    return personalActivityErrorResponse(error);
  }
}
