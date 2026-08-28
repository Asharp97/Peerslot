import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

type ApiAuthorization =
  | { authorized: true; currentUser: CurrentUser }
  | { authorized: false; response: NextResponse };

export async function authorizeApiUser(
  request: Request,
): Promise<ApiAuthorization> {
  const currentUser = await getCurrentUser(request);

  return currentUser
    ? { authorized: true, currentUser }
    : {
        authorized: false,
        response: NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        ),
      };
}

export async function authorizeApiProvider(
  request: Request,
  forbiddenMessage = "Provider setup required",
): Promise<ApiAuthorization> {
  const authorization = await authorizeApiUser(request);

  if (!authorization.authorized) return authorization;

  if (!authorization.currentUser.capabilities.canProvide) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: forbiddenMessage },
        { status: 403 },
      ),
    };
  }

  return authorization;
}
