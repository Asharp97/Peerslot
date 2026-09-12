import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiProvider } from "@/lib/api-authorization";
import {
  calendarMoveSchema,
  calendarMoveDeleteSchema,
  CalendarMoveError,
} from "@/lib/calendar-moves";
import {
  moveCalendarBlock,
  removeMovedCalendarBlock,
} from "@/lib/calendar-block-moves";
type Context = { params: Promise<{ id: string }> };
function errorResponse(error: unknown) {
  if (error instanceof CalendarMoveError)
    return NextResponse.json(
      { code: error.code, error: error.message },
      {
        status:
          error.code === "calendar_block_missing"
            ? 404
            : error.code === "calendar_block_conflict"
              ? 409
              : 400,
      },
    );
  throw error;
}
export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const input = calendarMoveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success || !input.success)
    return NextResponse.json(
      { code: "calendar_block_invalid", error: "Invalid calendar move." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await moveCalendarBlock(
        "personal",
        auth.currentUser.user.id,
        id.data,
        input.data,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  const auth = await authorizeApiProvider(request);
  if (!auth.authorized) return auth.response;
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const input = calendarMoveDeleteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success || !input.success)
    return NextResponse.json(
      { code: "calendar_block_invalid", error: "Invalid calendar block." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await removeMovedCalendarBlock(
        "personal",
        auth.currentUser.user.id,
        id.data,
        new Date(input.data.originalStartsAt),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
