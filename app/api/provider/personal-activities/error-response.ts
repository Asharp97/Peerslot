import { NextResponse } from "next/server";
import { PersonalActivityError } from "@/lib/personal-activity";
export function personalActivityErrorResponse(error: unknown) {
  if (error instanceof PersonalActivityError)
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.code === "activity_not_found" ? 404 : 409 },
    );
  throw error;
}
