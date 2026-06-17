/**
 * Normalise a scanned QR payload to the plain customer code.
 *
 * Backend QR stickers may encode a versioned payload like `JHR-100455:v3`
 * (the regenerate/revoke scheme). The route list, however, carries the plain
 * code `JHR-100455`. The Flutter app matched the raw payload against the
 * plain code, so any reprinted (versioned) sticker failed to match and the
 * milkman was blocked from delivering — a bug surfaced in the audit.
 *
 * Here we strip a trailing `:vN` version suffix (case-insensitive) and
 * upper-case the result, so both bare and versioned stickers resolve to the
 * same customer. The plain code is also what we send to /customers/by-code,
 * which avoids the 404 the versioned string produced.
 */
export function normalizeScannedCode(raw: string): string {
  const trimmed = raw.trim();
  const withoutVersion = trimmed.replace(/:v\d+$/i, '');
  return withoutVersion.toUpperCase();
}
