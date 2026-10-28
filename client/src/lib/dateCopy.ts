// A short date and time for lists — "Oct 28, 9:43 AM" — instead of toLocaleString's
// "10/28/2026, 9:43:58 AM" (2026-10-28 audit). Seconds say nothing a parent needs; the year only
// when it isn't this one. The person's own locale and time zone unless a test pins them.
export function shortDateTime(
  value: string | Date,
  now: Date = new Date(),
  opts: { locale?: string; timeZone?: string } = {},
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const yearOf = (d: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: opts.timeZone }).format(d);
  return new Intl.DateTimeFormat(opts.locale, {
    month: "short",
    day: "numeric",
    year: yearOf(date) === yearOf(now) ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
  }).format(date);
}
