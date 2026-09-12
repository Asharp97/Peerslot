import {
  appointmentDateTime,
  emailText,
  type EmailLocale,
  type EmailTemplate,
  renderPeerSlotEmail,
} from "./shared";

type NewBookingRequestTemplateInput = {
  comment?: string | null;
  endsAt: Date;
  locale: EmailLocale;
  providerName: string;
  reviewUrl: string;
  startsAt: Date;
  studentEmail: string;
  studentName: string;
  timeZone: string;
};

export function newBookingRequestTemplate(
  input: NewBookingRequestTemplateInput,
): EmailTemplate {
  const { date, time } = appointmentDateTime(
    input.startsAt,
    input.endsAt,
    input.timeZone,
    input.locale,
  );
  const copy = input.locale === "tr" ? turkishCopy : englishCopy;
  const layout = {
    locale: input.locale,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: copy.greeting(input.providerName),
    intro: copy.intro(input.studentName),
    details: [
      { label: copy.student, value: input.studentName },
      { label: copy.email, value: input.studentEmail },
      { label: copy.date, value: date },
      { label: copy.time, value: `${time} · ${input.timeZone}` },
      ...(input.comment
        ? [{ label: copy.comment, value: copy.commentNotice }]
        : []),
    ],
    notice: copy.notice,
    cta: { label: copy.cta, url: input.reviewUrl },
    footer: copy.footer,
  };

  return {
    subject: copy.subject,
    html: renderPeerSlotEmail(layout),
    text: emailText(layout),
  };
}

const englishCopy = {
  eyebrow: "New request",
  title: "New appointment request",
  greeting: (name: string) => `Hello ${name},`,
  intro: (name: string) =>
    `${name} sent a new appointment request. Review the details and accept or decline it from your dashboard.`,
  student: "Student",
  email: "Email",
  date: "Date",
  time: "Time",
  comment: "Student note",
  commentNotice:
    "A note is included in the request. Read it in your dashboard.",
  notice: "This time remains pending until you make a decision.",
  cta: "Review request",
  footer:
    "You received this because this request was made through your PeerSlot booking page.",
  subject: "PeerSlot: New appointment request",
};

const turkishCopy = {
  eyebrow: "Yeni talep",
  title: "Yeni randevu talebi",
  greeting: (name: string) => `Merhaba ${name},`,
  intro: (name: string) =>
    `${name} yeni bir randevu talebi gönderdi. Ayrıntıları inceleyip panelinizden kabul veya reddedebilirsiniz.`,
  student: "Öğrenci",
  email: "E-posta",
  date: "Tarih",
  time: "Saat",
  comment: "Öğrenci notu",
  commentNotice: "Talepte bir not bulunuyor. Panelinizden okuyabilirsiniz.",
  notice: "Siz karar verene kadar bu saat beklemede kalır.",
  cta: "Talebi incele",
  footer:
    "Bu iletiyi, talep PeerSlot rezervasyon sayfanız üzerinden gönderildiği için aldınız.",
  subject: "PeerSlot: Yeni randevu talebi",
};
