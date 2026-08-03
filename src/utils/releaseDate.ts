/**
 * Release dates are stored as ISO `YYYY-MM-DD` so they sort chronologically in
 * SQLite (TEXT comparison is lexicographic — the source site's display format,
 * "July 11, 2025", sorts alphabetically by month name instead). The GraphQL API
 * keeps serving the display format via `releaseDate` and exposes the raw ISO
 * value as `releaseDateISO`.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_INDEX: Record<string, number> = MONTH_NAMES.reduce(
  (acc, name, i) => {
    acc[name.toLowerCase()] = i;
    return acc;
  },
  {} as Record<string, number>
);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Convert a release date into ISO `YYYY-MM-DD`.
 * Accepts the site's display format ("July 11, 2025") and values that are
 * already ISO. Returns null for anything else — callers decide what to do with
 * unrecognised formats rather than getting a silently wrong date.
 */
export function toISODate(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();

  if (ISO_DATE.test(trimmed)) return trimmed;

  const match = trimmed.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!match) return null;

  const month = MONTH_INDEX[match[1].toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (!day || day > 31 || !year) return null;

  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * Render a stored release date in the site's display format
 * ("2025-07-11" → "July 11, 2025"). Values that aren't ISO are passed through
 * unchanged, so rows written before the ISO migration still read correctly.
 */
export function formatReleaseDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const match = value.trim().match(ISO_DATE);
  if (!match) return value;

  const month = MONTH_NAMES[parseInt(match[2], 10) - 1];
  if (!month) return value;

  return `${month} ${parseInt(match[3], 10)}, ${match[1]}`;
}
