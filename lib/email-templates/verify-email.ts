import {
  emailText,
  type EmailLocale,
  type EmailTemplate,
  renderPeerSlotEmail,
} from "./shared";

type VerifyEmailTemplateInput = {
  email: string;
  locale: EmailLocale;
  name: string;
  verificationUrl: string;
};

export function verifyEmailTemplate(
  input: VerifyEmailTemplateInput,
): EmailTemplate {
  const copy = input.locale === "tr" ? turkishCopy : englishCopy;
  const layout = {
    locale: input.locale,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: copy.greeting(input.name),
    intro: copy.intro,
    details: [{ label: copy.email, value: input.email }],
    notice: copy.notice,
    cta: { label: copy.cta, url: input.verificationUrl },
    footer: copy.footer,
  };

  return {
    subject: copy.subject,
    html: renderPeerSlotEmail(layout),
    text: emailText(layout),
  };
}

const englishCopy = {
  email: "Account email",
  eyebrow: "Email verification",
  title: "Confirm your email address.",
  greeting: (name: string) => `Hello ${name},`,
  intro:
    "You requested a PeerSlot account with this email address. Confirm your address to finish signing up.",
  notice:
    "This link is valid for one hour. If it expires, return to PeerSlot and sign in to request a new verification email.",
  cta: "Verify email",
  footer:
    "You received this email because this address was used to create or sign in to a PeerSlot account. If this wasn’t you, ignore this message. Never share this link or your password.",
  subject: "Verify your PeerSlot email address",
};

const turkishCopy = {
  email: "Hesap e-postası",
  eyebrow: "E-posta doğrulama",
  title: "E-posta adresinizi doğrulayın.",
  greeting: (name: string) => `Merhaba ${name},`,
  intro:
    "Bu e-posta adresiyle bir PeerSlot hesabı oluşturma talebinde bulundunuz. Kaydınızı tamamlamak için adresinizi doğrulayın.",
  notice:
    "Bu bağlantı bir saat geçerlidir. Süresi dolarsa yeni bir doğrulama e-postası istemek için PeerSlot’a dönüp giriş yapın.",
  cta: "E-postayı doğrula",
  footer:
    "Bu adres PeerSlot hesabı oluşturmak veya giriş yapmak için kullanıldığı için bu e-postayı aldınız. Bu işlemi siz yapmadıysanız mesajı yok sayın. Bağlantıyı veya parolanızı kimseyle paylaşmayın.",
  subject: "PeerSlot e-posta adresinizi doğrulayın",
};
