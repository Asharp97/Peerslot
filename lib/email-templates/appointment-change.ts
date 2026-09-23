import {
  appointmentDateTime,
  emailText,
  type EmailLocale,
  type EmailTemplate,
  renderPeerSlotEmail,
} from "./shared";

type AppointmentChangeTemplateInput = {
  change: "rescheduled" | "cancelled";
  endsAt: Date;
  locale: EmailLocale;
  previousEndsAt: Date;
  previousStartsAt: Date;
  providerName: string;
  recipient: "provider" | "student";
  startsAt: Date;
  studentName: string;
  timeZone: string;
  viewUrl: string;
};

export function appointmentChangeTemplate(
  input: AppointmentChangeTemplateInput,
): EmailTemplate {
  const copy = {
    ...copies[input.locale][input.recipient][input.change],
    ...(input.locale === "tr" ? turkishLabels : englishLabels),
  };
  const previous = appointmentDateTime(
    input.previousStartsAt,
    input.previousEndsAt,
    input.timeZone,
    input.locale,
  );
  const next = appointmentDateTime(
    input.startsAt,
    input.endsAt,
    input.timeZone,
    input.locale,
  );
  const layout = {
    locale: input.locale,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: copy.greeting(
      input.recipient === "provider" ? input.providerName : input.studentName,
    ),
    intro: copy.intro(
      input.recipient === "provider" ? input.studentName : input.providerName,
    ),
    details: [
      { label: copy.provider, value: input.providerName },
      { label: copy.client, value: input.studentName },
      ...(input.change === "rescheduled"
        ? [
            { label: copy.previousTime, value: `${previous.date}, ${previous.time}` },
            { label: copy.newTime, value: `${next.date}, ${next.time}` },
          ]
        : [{ label: copy.time, value: `${previous.date}, ${previous.time}` }]),
      { label: copy.timeZone, value: input.timeZone },
    ],
    notice: copy.notice,
    cta: { label: copy.cta, url: input.viewUrl },
    footer: copy.footer,
  };

  return {
    subject: copy.subject,
    html: renderPeerSlotEmail(layout),
    text: emailText(layout),
  };
}

const copies = {
  en: {
    provider: {
      rescheduled: {
        eyebrow: "Appointment changed",
        title: "A client rescheduled an appointment.",
        greeting: (name: string) => `Hello ${name},`,
        intro: (name: string) => `${name} moved an appointment through PeerSlot.`,
        notice: "Your availability was updated with the new time.",
        subject: "PeerSlot: Appointment rescheduled",
      },
      cancelled: {
        eyebrow: "Appointment cancelled",
        title: "A client cancelled an appointment.",
        greeting: (name: string) => `Hello ${name},`,
        intro: (name: string) => `${name} cancelled an appointment through PeerSlot.`,
        notice: "The time is available again according to your booking settings.",
        subject: "PeerSlot: Appointment cancelled",
      },
    },
    student: {
      rescheduled: {
        eyebrow: "Appointment changed",
        title: "Your appointment was rescheduled.",
        greeting: (name: string) => `Hello ${name},`,
        intro: (name: string) => `${name} updated your appointment through PeerSlot.`,
        notice: "Keep this email for the updated appointment details.",
        subject: "PeerSlot: Your appointment was rescheduled",
      },
      cancelled: {
        eyebrow: "Appointment cancelled",
        title: "Your appointment was cancelled.",
        greeting: (name: string) => `Hello ${name},`,
        intro: (name: string) => `${name} cancelled your appointment through PeerSlot.`,
        notice: "No meeting link is available for a cancelled appointment.",
        subject: "PeerSlot: Your appointment was cancelled",
      },
    },
  },
  tr: {
    provider: {
      rescheduled: {
        eyebrow: "Randevu degisikligi",
        title: "Bir danisan randevuyu yeniden planladi.",
        greeting: (name: string) => `Merhaba ${name},`,
        intro: (name: string) => `${name}, PeerSlot üzerinden bir randevuyu tasidi.`,
        notice: "Yeni saat ayarlariniza göre takviminize islendi.",
        subject: "PeerSlot: Randevu yeniden planlandi",
      },
      cancelled: {
        eyebrow: "Randevu iptali",
        title: "Bir danisan randevuyu iptal etti.",
        greeting: (name: string) => `Merhaba ${name},`,
        intro: (name: string) => `${name}, PeerSlot üzerinden bir randevuyu iptal etti.`,
        notice: "Saat, rezervasyon ayarlariniza göre yeniden kullanilabilir.",
        subject: "PeerSlot: Randevu iptal edildi",
      },
    },
    student: {
      rescheduled: {
        eyebrow: "Randevu degisikligi",
        title: "Randevunuz yeniden planlandi.",
        greeting: (name: string) => `Merhaba ${name},`,
        intro: (name: string) => `${name}, PeerSlot üzerinden randevunuzu güncelledi.`,
        notice: "Güncel randevu ayrintilari için bu e-postayi saklayin.",
        subject: "PeerSlot: Randevunuz yeniden planlandi",
      },
      cancelled: {
        eyebrow: "Randevu iptali",
        title: "Randevunuz iptal edildi.",
        greeting: (name: string) => `Merhaba ${name},`,
        intro: (name: string) => `${name}, PeerSlot üzerinden randevunuzu iptal etti.`,
        notice: "Iptal edilen randevu için toplanti baglantisi bulunmaz.",
        subject: "PeerSlot: Randevunuz iptal edildi",
      },
    },
  },
} as const;

const englishLabels = {
  provider: "Provider",
  client: "Client",
  previousTime: "Previous time",
  newTime: "New time",
  time: "Appointment time",
  timeZone: "Time zone",
  cta: "View appointment",
  footer: "This update was sent because the appointment was changed through PeerSlot.",
};

const turkishLabels = {
  provider: "Sağlayıcı",
  client: "Danışan",
  previousTime: "Önceki saat",
  newTime: "Yeni saat",
  time: "Randevu saati",
  timeZone: "Saat dilimi",
  cta: "Randevuyu görüntüle",
  footer: "Bu güncelleme, randevu PeerSlot üzerinden değiştirildiği için gönderildi.",
};

