/** Fecha ISO (yyyy-MM-dd) → dd/mm/aaaa para todo lo visible al usuario. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
