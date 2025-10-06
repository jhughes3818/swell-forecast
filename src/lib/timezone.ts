// lib/timezone.ts
import tzlookup from "tz-lookup";

/** Best-effort timezone for coordinates; falls back to 'UTC' on error. */
export function tzFor(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon);
  } catch {
    return "UTC";
  }
}
