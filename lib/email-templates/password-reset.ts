import {
  emailText,
  type EmailLocale,
  type EmailTemplate,
  renderPeerSlotEmail,
} from "./shared";

type PasswordResetTemplateInput = {
  email: string;
  locale: EmailLocale;
  name: string;
  resetUrl: string;
};

export function passwordResetTemplate(
  input: PasswordResetTemplateInput,
): EmailTemplate {
  const copy = input.locale === "tr" ? turkishCopy : englishCopy;
  const layout = {
    locale: input.locale,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: copy.greeting(input.name),
    intro: copy.intro,
    details: [{ label: copy.account, value: input.email }],
    notice: copy.notice,
    cta: { label: copy.cta, url: input.resetUrl },
    footer: copy.footer,
  };

  return {
    subject: copy.subject,
    html: renderPeerSlotEmail(layout),
    text: emailText(layout),
  };
}

const englishCopy = {
  eyebrow: "Password reset",
  title: "Create a new password.",
  greeting: (name: string) => `Hello ${name},`,
  intro: "We received a request to reset your PeerSlot password.",
  account: "Account",
  notice: "This link expires in one hour. If you did not request it, you can ignore this email.",
  cta: "Reset password",
  footer: "This security email was sent because a password reset was requested for your PeerSlot account.",
  subject: "PeerSlot: Reset your password",
};

const turkishCopy = {
  eyebrow: "Sifre sifirlama",
  title: "Yeni bir sifre olusturun.",
  greeting: (name: string) => `Merhaba ${name},`,
  intro: "PeerSlot sifrenizi sifirlamak için bir istek aldik.",
  account: "Hesap",
  notice: "Bu baglantinin süresi bir saat içinde dolar. Bu istegi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz.",
  cta: "Sifreyi sifirla",
  footer: "Bu güvenlik e-postasi, PeerSlot hesabiniz için sifre sifirlama istegi yapildigi için gönderildi.",
  subject: "PeerSlot: Sifrenizi sifirlayin",
};


