import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

export function defaultBookingTitle(name: string, locale: "en" | "tr") {
  return (locale === "tr" ? tr : en).BookingPage.defaultTitle.replace(
    "{name}",
    name,
  );
}

export function localizeBookingTitle(
  title: string,
  name: string,
  locale: "en" | "tr",
) {
  return ["en", "tr"].some(
    (language) => title === defaultBookingTitle(name, language as "en" | "tr"),
  )
    ? defaultBookingTitle(name, locale)
    : title;
}
