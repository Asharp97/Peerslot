export function isGoogleMeetUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(value)
  );
}
