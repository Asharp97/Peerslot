import { NextResponse } from "next/server";

import { authorizeApiUser } from "@/lib/api-authorization";
import { providerOnboardingSchema } from "@/lib/provider-onboarding";
import {
  completeProviderOnboarding,
  findProviderSetup,
  ensurePersonalWorkspace,
} from "@/lib/provider-profiles";

export async function GET(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const offersAppointments = currentUser.user.offersAppointments;
  const setup = offersAppointments
    ? await findProviderSetup(currentUser.user.id)
    : await ensurePersonalWorkspace(currentUser.user.id, currentUser.user.name);

  return NextResponse.json({
    offersAppointments,
    status: setup?.bookingPage && (!offersAppointments || setup.profile.setupCompleted) ? "active" : "setup_required",
    user: {
      id: currentUser.user.id,
      email: currentUser.user.email,
      name: currentUser.user.name,
    },
    profile: setup?.profile ?? null,
    bookingPage: setup?.bookingPage ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authorization = await authorizeApiUser(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  if (!currentUser.user.offersAppointments) {
    return NextResponse.json({ error: "Turn on appointment offering in Account settings first." }, { status: 403 });
  }

  const input = providerOnboardingSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!input.success) {
    return NextResponse.json(
      {
        error: "Invalid provider settings",
        issues: input.error.issues,
      },
      { status: 400 },
    );
  }

  const existingSetup = await findProviderSetup(currentUser.user.id);
  const setup = await completeProviderOnboarding(
    currentUser.user.id,
    input.data,
  );

  return NextResponse.json(
    {
      status: "active",
      profile: setup.profile,
      bookingPage: setup.bookingPage,
      capabilities: { canBook: true, canProvide: true },
    },
    { status: existingSetup?.bookingPage ? 200 : 201 },
  );
}
