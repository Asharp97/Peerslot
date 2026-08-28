import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

type LegalDocumentProps = ComponentPropsWithoutRef<"article"> & {
  title?: string;
  eyebrow?: string;
  updatedAt?: string;
  introduction?: string;
  sections?: LegalSection[];
};

export function LegalDocument({
  title,
  eyebrow,
  updatedAt,
  introduction,
  sections,
  className,
  ...props
}: LegalDocumentProps) {
  return (
    <article
      className={cn(
        "mx-auto w-full max-w-3xl rounded-[28px] border-2 border-vast-ink bg-white px-6 py-8 text-vast-ink shadow-[6px_6px_0_var(--color-vast-ink)] sm:px-10 sm:py-12",
        className,
      )}
      {...props}
    >
      {(title || eyebrow || updatedAt || introduction) && (
        <header className="mb-10 border-b-2 border-vast-ink/10 pb-8">
          {eyebrow && (
            <p className="mb-3 text-xs font-bold tracking-[0.16em] text-vast-ink uppercase">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="font-serif text-4xl leading-none tracking-[-0.04em] sm:text-5xl">
              {title}
            </h1>
          )}
          {updatedAt && (
            <p className="mt-4 text-sm font-medium text-[#6b6b62]">
              {updatedAt}
            </p>
          )}
          {introduction && (
            <p className="mt-6 text-base leading-7 text-[#4f4f49] sm:text-lg sm:leading-8">
              {introduction}
            </p>
          )}
        </header>
      )}

      {sections?.length ? (
        <div className="space-y-9 text-[15px] leading-7 text-[#4f4f49] sm:text-base sm:leading-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-3 text-xl font-bold tracking-[-0.02em] text-vast-ink sm:text-2xl">
                {section.heading}
              </h2>
              <div className="space-y-3">
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items?.length ? (
                  <ul className="list-disc space-y-2 pl-5 marker:text-vast-ink">
                    {section.items.map((item) => (
                      <li className="pl-1" key={item}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </article>
  );
}
