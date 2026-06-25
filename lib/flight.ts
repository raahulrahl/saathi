/**
 * Canonical form of a flight number, for both storage and comparison:
 * trimmed, uppercased, with all spaces and hyphens removed. So "qr 540",
 * "QR-540", and "QR540" all canonicalise to "QR540".
 *
 * Use this at every read AND write site. The write path has always stripped
 * hyphens; if a read/search path strips only whitespace, a searcher who types
 * "QR-540" silently fails to match a stored "QR540" (bugs M02 / L05).
 */
export function canonicalFlight(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * A canonical flight number is two or three alphanumerics (the airline code)
 * followed by 1-4 digits — e.g. "QR540", "6E123". Test against the output of
 * `canonicalFlight`, not raw input.
 */
export const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2}\d{1,4}$/;
