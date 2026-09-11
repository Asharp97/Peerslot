import { describe, expect, it } from "vitest";
import { defaultBookingTitle, localizeBookingTitle } from "@/lib/booking-title";

describe("localized booking titles", () => {
  it("creates the default in the onboarding locale", () => {
    expect(defaultBookingTitle("Ceyda", "en")).toBe("Book with Ceyda");
    expect(defaultBookingTitle("Ceyda", "tr")).toBe("Ceyda ile randevu alın");
  });
  it("localizes existing defaults when the page language changes", () => {
    expect(localizeBookingTitle("Book with Ceyda", "Ceyda", "tr")).toBe(
      "Ceyda ile randevu alın",
    );
    expect(localizeBookingTitle("Ceyda ile randevu alın", "Ceyda", "en")).toBe(
      "Book with Ceyda",
    );
  });
  it("preserves a provider's custom title", () => {
    expect(localizeBookingTitle("Geometry lessons", "Ceyda", "tr")).toBe(
      "Geometry lessons",
    );
  });
});
