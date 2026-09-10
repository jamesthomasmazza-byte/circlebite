/**
 * Validates a `?returnTo=` query value before ever passing it to navigate(). Only a same-origin
 * relative path is accepted — rejects anything starting with "//" (protocol-relative URL, an
 * open-redirect vector) or without a leading "/" at all (e.g. a full external URL).
 */
export function safeReturnTo(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}
