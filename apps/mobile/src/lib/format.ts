/** Format litres: whole numbers with no decimals, otherwise one decimal. */
export function fmtLitres(v: number): string {
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
}

/** Two-letter initials from a name, e.g. "Ramesh Sahu" -> "RS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
