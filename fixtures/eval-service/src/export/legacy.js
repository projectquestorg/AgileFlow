/**
 * @deprecated Kept for the v1 reporting integration. Use exportCsv instead.
 *
 * Legacy pipe-delimited export: `id|customer|total|status`, one invoice per line,
 * totals in integer cents.
 */
export function legacyExport(invoices) {
  return invoices.map(toLegacyRow).join('\n');
}

function toLegacyRow(invoice) {
  return [invoice.id, invoice.customerId, Math.round(invoice.total * 100), invoice.status.toUpperCase()].join('|');
}
