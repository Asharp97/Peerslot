import { NextResponse } from "next/server";

import { providerStudentCreateSchema } from "@/lib/provider-appointment";
import {
  createProviderStudent,
  listProviderStudents,
} from "@/lib/provider-appointments";
import { authorizeApiOffering } from "@/lib/api-authorization";

export async function GET(request: Request) {
  const authorization = await authorizeApiOffering(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  return NextResponse.json({
    students: await listProviderStudents(currentUser.user.id),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeApiOffering(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const input = providerStudentCreateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid student", issues: input.error.issues },
      { status: 400 },
    );
  }

  const student = await createProviderStudent(currentUser.user.id, input.data);
  return NextResponse.json({ student }, { status: 201 });
}
