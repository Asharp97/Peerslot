import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiProvider } from "@/lib/api-authorization";
import { personalActivitySchema } from "@/lib/personal-activity";
import {
  updatePersonalActivity,
  deletePersonalActivity,
} from "@/lib/personal-activities";
import { personalActivityErrorResponse } from "../error-response";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const input = personalActivitySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success || !input.success)
    return NextResponse.json(
      {
        code: "invalid_activity",
        error:
          "Enter a valid activity ID, name, and optional duration of 1–1440 minutes.",
      },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      activity: await updatePersonalActivity(
        auth.currentUser.user.id,
        id.data,
        input.data,
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
      { error: "Invalid activity ID." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await deletePersonalActivity(auth.currentUser.user.id, id.data),
    );
  } catch (error) {
    return personalActivityErrorResponse(error);
  }
}
