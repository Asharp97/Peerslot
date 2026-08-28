// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LegalDocument } from "@/components/legal-document";

afterEach(cleanup);

describe("LegalDocument", () => {
  it("accepts standard article properties and custom classes", () => {
    render(<LegalDocument className="legal-copy" data-testid="terms" />);

    expect(screen.getByTestId("terms").classList.contains("legal-copy")).toBe(
      true,
    );
  });

  it("renders a structured and accessible legal document", () => {
    render(
      <LegalDocument
        aria-label="Cookie policy"
        introduction="This policy explains our cookies."
        sections={[
          {
            heading: "Necessary cookies",
            paragraphs: ["These cookies keep the service working."],
            items: ["Authentication", "Language preference"],
          },
        ]}
        title="Cookie Policy"
        updatedAt="Effective 18 August 2026"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Cookie Policy" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Necessary cookies" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
