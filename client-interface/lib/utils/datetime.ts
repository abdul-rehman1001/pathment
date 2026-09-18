/**
 * Timezone-aware date/time formatting. The golden rule app-wide: a moment in
 * time is stored as a UTC instant; we render it in the VIEWER's timezone with an
 * explicit zone label so nothing is ever ambiguous across regions.
 *
 * The viewer's timezone defaults to the browser's, which is almost always what
 * the user wants. A stored preference can override it.
 */

let overrideZone: string | null = null;

/** Override the viewer timezone (e.g. from the user's saved setting). */
export function setViewerTimeZone(tz: string | null | undefined) {
  overrideZone = tz && tz !== 'UTC' ? tz : null;
}

/** The browser's IANA timezone, e.g. 'Asia/Karachi'. */
export function getBrowserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

/** The timezone we render in for this viewer (override → browser). */
export function getViewerTimeZone(): string {
  return overrideZone || getBrowserTimeZone();
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Jun 10, 2026" in the viewer's zone. */
export function formatDate(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: getViewerTimeZone(), ...opts });
}

/** "2:00 PM PKT" — time + short zone label, in the viewer's zone. */
export function formatTime(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: getViewerTimeZone(), ...opts });
}

/** "Jun 10, 2026, 2:00 PM PKT" — full instant, viewer's zone, with label. */
export function formatDateTime(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: getViewerTimeZone(), ...opts,
  });
}

/**
 * A meeting/slot label: prefer the true instant (`startsAt`) rendered in the
 * viewer's zone with a label; fall back to the legacy day/time strings (which
 * have no zone) when an older record has no instant.
 */
export function formatMeeting(
  startsAt: string | number | Date | null | undefined,
  fallbackDay?: string | null,
  fallbackTime?: string | null,
): string {
  const d = toDate(startsAt);
  if (d) {
    const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: getViewerTimeZone() });
    return `${day} · ${formatTime(d)}`;
  }
  // Legacy record with no instant — show what we have (zone unknown).
  return [fallbackDay, fallbackTime].filter(Boolean).join(' · ') || '—';
}

/**
 * The calendar date 'YYYY-MM-DD' for an instant, IN A SPECIFIC IANA zone.
 * Use for `<input type="date">` values/limits when the date is meaningful in
 * someone else's zone (e.g. a deadline is the MENTEE's calendar day, not the
 * mentor's). `en-CA` formats as YYYY-MM-DD.
 */
export function dateInZone(value: string | number | Date | null | undefined, tz?: string): string {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || getViewerTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Today's calendar date 'YYYY-MM-DD' in a specific zone. */
export function todayInZone(tz?: string): string {
  return dateInZone(new Date(), tz);
}

/** Calendar arithmetic on a bare 'YYYY-MM-DD' (zone-free, DST-safe). */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** A short zone label for an arbitrary IANA zone, e.g. "PKT" / "GMT+5". */
export function zoneLabel(tz?: string): string {
  const zone = tz || getViewerTimeZone();
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone: zone }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || zone;
  } catch { return zone; }
}

/** Split a stored UTC instant into local date + time (HH:MM) for date/time inputs. */
export function splitLocal(iso?: string | number | Date | null): { date: string; time: string } {
  const d = toDate(iso);
  if (!d) return { date: '', time: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/** Short zone label for the viewer, e.g. "PKT" / "GMT+5". */
export function viewerZoneLabel(): string {
  return zoneLabel(getViewerTimeZone());
}
