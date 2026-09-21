import { beforeEach, describe, expect, it, vi } from "vitest";

import LegacyAccountRoute from "@/app/[locale]/account/page";
import LegacyCalendarPage from "@/app/[locale]/provider/appointments/page";
import LegacyStudentsPage from "@/app/[locale]/provider/students/page";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));

describe("legacy workspace links", () => {
  beforeEach(() => redirect.mockClear());

  it.each(["en", "tr"])("preserves the %s locale when opening old appointment links", async (locale) => {
    await LegacyAccountRoute({ params: Promise.resolve({ locale }) });
    expect(redirect).toHaveBeenCalledWith(`/${locale}/my-appointments`);
  });

  it.each(["en", "tr"])("preserves the %s locale when opening the old calendar URL", async (locale) => {
    await LegacyCalendarPage({ params: Promise.resolve({ locale }) });
    expect(redirect).toHaveBeenCalledWith(`/${locale}/provider/calendar`);
  });

  it.each(["en", "tr"])("preserves the %s locale when opening old client links", async (locale) => {
    await LegacyStudentsPage({ params: Promise.resolve({ locale }) });
    expect(redirect).toHaveBeenCalledWith(`/${locale}/provider/clients`);
  });
});
