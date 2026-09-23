export { legacyExport } from './legacy.js';

const COLUMNS = ['id', 'customerId', 'total', 'status'];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** RFC 4180 CSV with a header row. */
export function exportCsv(invoices) {
  const rows = invoices.map((inv) => COLUMNS.map((c) => csvCell(inv[c])).join(','));
  return [COLUMNS.join(','), ...rows].join('\n');
}
