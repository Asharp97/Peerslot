import { emailActionUrl } from "@/lib/email-urls";

export type EmailLocale = "en" | "tr";

export type EmailTemplate = {
  html: string;
  subject: string;
  text: string;
};

type EmailLayoutInput = {
  locale: EmailLocale;
  cta?: { label: string; url: string };
  details?: Array<{ label: string; value: string }>;
  eyebrow: string;
  footer: string;
  greeting: string;
  intro: string;
  notice?: string;
  title: string;
};

export function renderPeerSlotEmail(input: EmailLayoutInput) {
  const actionUrl = input.cta ? emailActionUrl(input.cta.url) : undefined;
  const fallbackLabel =
    input.locale === "tr"
      ? "Düğme çalışmazsa bu bağlantıyı tarayıcınıza kopyalayıp yapıştırın:"
      : "If the button doesn’t work, copy and paste this link into your browser:";
  const detailsHtml = input.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-collapse:separate;border-spacing:0 8px">
        ${input.details
          .map(
            ({ label, value }) => `<tr>
              <td style="width:34%;padding:10px 12px;color:#73736a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;vertical-align:top">${escapeHtml(label)}</td>
              <td style="padding:10px 12px;color:#1a1a1a;font-size:14px;font-weight:700;vertical-align:top">${escapeHtml(value)}</td>
            </tr>`,
          )
          .join("")}
      </table>`
    : "";
  const noticeHtml = input.notice
    ? `<div style="margin-top:24px;border-radius:8px;background:#f4f5f2;padding:17px 18px;color:#2f1f57;font-size:14px;line-height:1.65">${escapeHtml(input.notice)}</div>`
    : "";
  const ctaHtml = input.cta
    ? `<div style="margin-top:26px"><a href="${escapeHtml(actionUrl!)}" style="display:inline-block;border-radius:6px;background:#034f46;padding:13px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(input.cta.label)}</a></div>
       <p style="margin:20px 0 0;color:#55554f;font-size:12px;line-height:1.6">${fallbackLabel}</p>
       <p style="margin:6px 0 0;font-size:12px;line-height:1.6;word-break:break-all;overflow-wrap:anywhere"><a href="${escapeHtml(actionUrl!)}" style="color:#034f46">${escapeHtml(actionUrl!)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="${input.locale}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
  <body style="margin:0;background:#fbfaf4;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;padding:32px 16px">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto">
      <tr>
        <td style="background:#034f46;border-radius:12px 12px 0 0;padding:27px 32px;color:#ffffff">
          <div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffa946">PeerSlot · ${escapeHtml(input.eyebrow)}</div>
          <div style="margin-top:10px;font-family:Georgia,serif;font-size:26px;line-height:1.25;letter-spacing:-.02em">${escapeHtml(input.title)}</div>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid #e7e3d8;border-top:0;border-radius:0 0 12px 12px;padding:32px">
          <p style="margin:0;font-size:18px;line-height:1.55">${escapeHtml(input.greeting)}</p>
          <p style="margin:14px 0 0;color:#55554f;font-size:15px;line-height:1.75">${escapeHtml(input.intro)}</p>
          ${detailsHtml}
          ${noticeHtml}
          ${ctaHtml}
          <div style="margin-top:30px;border-top:1px solid #ece9df;padding-top:18px;color:#85857b;font-size:12px;line-height:1.6">${escapeHtml(input.footer)}</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function appointmentDateTime(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
  locale: EmailLocale,
) {
  const intlLocale = locale === "tr" ? "tr-TR" : "en-GB";
  const date = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "full",
    timeZone,
  }).format(startsAt);
  const time = `${new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(startsAt)}–${new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(endsAt)}`;

  return { date, time };
}

export function emailText(input: EmailLayoutInput) {
  return [
    `PeerSlot · ${input.eyebrow}`,
    input.title,
    "",
    input.greeting,
    input.intro,
    "",
    ...(input.details?.map(({ label, value }) => `${label}: ${value}`) ?? []),
    ...(input.notice ? ["", input.notice] : []),
    ...(input.cta
      ? ["", `${input.cta.label}: ${emailActionUrl(input.cta.url)}`]
      : []),
    "",
    input.footer,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}
