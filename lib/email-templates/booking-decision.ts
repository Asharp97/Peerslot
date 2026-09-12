import {
  appointmentDateTime,
  emailText,
  type EmailLocale,
  type EmailTemplate,
  renderPeerSlotEmail,
} from "./shared";

type BookingDecisionTemplateInput = {
  decision: "accept" | "decline";
  endsAt: Date;
  locale: EmailLocale;
  providerName: string;
  startsAt: Date;
  studentName: string;
  timeZone: string;
  viewUrl: string;
};

export function bookingDecisionTemplate(
  input: BookingDecisionTemplateInput,
): EmailTemplate {
  const { date, time } = appointmentDateTime(
    input.startsAt,
    input.endsAt,
    input.timeZone,
    input.locale,
  );
  const copy = copies[input.locale][input.decision];
  const layout = {
    locale: input.locale,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: copy.greeting(input.studentName),
    intro: copy.intro(input.providerName),
    details: [
      { label: copy.provider, value: input.providerName },
      { label: copy.date, value: date },
      { label: copy.time, value: `${time} · ${input.timeZone}` },
      { label: copy.status, value: copy.statusValue },
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
    accept: {
      eyebrow: "Confirmed",
      title: "Your appointment is confirmed.",
      greeting: (name: string) => `Hello ${name},`,
      intro: (provider: string) =>
        `${provider} accepted your appointment request. Your selected time is now confirmed.`,
      provider: "Provider",
      date: "Date",
      time: "Time",
      status: "Status",
      statusValue: "Confirmed",
      notice:
        "Please arrive on time. Keep this email for your appointment details.",
      cta: "View my appointments",
      footer:
        "This confirmation was sent because you requested an appointment through PeerSlot.",
      subject: "PeerSlot: Your appointment is confirmed",
    },
    decline: {
      eyebrow: "Request update",
      title: "Your appointment request was declined.",
      greeting: (name: string) => `Hello ${name},`,
      intro: (provider: string) =>
        `${provider} could not accept this appointment request. Contact your provider if you need to arrange another time.`,
      provider: "Provider",
      date: "Requested date",
      time: "Requested time",
      status: "Status",
      statusValue: "Declined",
      notice: "No appointment was created for this time.",
      cta: "Open PeerSlot",
      footer:
        "This update was sent because you requested an appointment through PeerSlot.",
      subject: "PeerSlot: Your appointment request was declined",
    },
  },
  tr: {
    accept: {
      eyebrow: "Onaylandı",
      title: "Randevunuz onaylandı.",
      greeting: (name: string) => `Merhaba ${name},`,
      intro: (provider: string) =>
        `${provider} randevu talebinizi kabul etti. Seçtiğiniz saat artık onaylandı.`,
      provider: "Sağlayıcı",
      date: "Tarih",
      time: "Saat",
      status: "Durum",
      statusValue: "Onaylandı",
      notice:
        "Lütfen zamanında hazır olun. Randevu ayrıntıları için bu e-postayı saklayın.",
      cta: "Randevularımı görüntüle",
      footer:
        "Bu onay, PeerSlot üzerinden randevu talep ettiğiniz için gönderildi.",
      subject: "PeerSlot: Randevunuz onaylandı",
    },
    decline: {
      eyebrow: "Talep güncellemesi",
      title: "Randevu talebiniz reddedildi.",
      greeting: (name: string) => `Merhaba ${name},`,
      intro: (provider: string) =>
        `${provider} bu randevu talebini kabul edemedi. Başka bir saat ayarlamak için sağlayıcınızla iletişime geçebilirsiniz.`,
      provider: "Sağlayıcı",
      date: "Talep edilen tarih",
      time: "Talep edilen saat",
      status: "Durum",
      statusValue: "Reddedildi",
      notice: "Bu saat için randevu oluşturulmadı.",
      cta: "PeerSlot’u aç",
      footer:
        "Bu güncelleme, PeerSlot üzerinden randevu talep ettiğiniz için gönderildi.",
      subject: "PeerSlot: Randevu talebiniz reddedildi",
    },
  },
} as const;
