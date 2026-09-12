/** Keep production email links usable and free of credentials or unsafe schemes. */
export function emailActionUrl(value: string) {
  const url = new URL(value);
  const loopback =
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost");
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        loopback &&
        url.protocol === "http:"
      )) ||
    (process.env.NODE_ENV === "production" && loopback)
  ) {
    throw new Error("Email links must use a public HTTPS URL in production");
  }
  return url.toString();
}

export function emailApplicationUrl(path: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://localhost:3000";
  return emailActionUrl(new URL(path, baseUrl).toString());
}
