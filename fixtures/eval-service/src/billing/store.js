import { calculateInvoice } from './invoice.js';

export const customers = new Map([
  ['c1', { id: 'c1', name: 'Acme Corp', discountPercent: 10 }],
  ['c2', { id: 'c2', name: 'Globex' }],
]);

const invoices = new Map([
  ['inv_1', { id: 'inv_1', customerId: 'c1', items: [{ sku: 'plan-pro', price: 50, qty: 2 }], status: 'open' }],
  ['inv_2', { id: 'inv_2', customerId: 'c2', items: [{ sku: 'plan-basic', price: 20, qty: 1 }], status: 'open' }],
]);

export function getInvoice(id) {
  const invoice = invoices.get(id);
  if (!invoice) return undefined;
  return { ...invoice, ...calculateInvoice({ items: invoice.items, customer: customers.get(invoice.customerId) }) };
}

/** Mark an invoice paid. Returns false if the invoice does not exist. */
export function markPaid(id, paymentId) {
  const invoice = invoices.get(id);
  if (!invoice) return false;
  invoice.status = 'paid';
  invoice.paymentId = paymentId;
  return true;
}

export function markPaymentFailed(id, reason) {
  const invoice = invoices.get(id);
  if (!invoice) return false;
  invoice.status = 'payment_failed';
  invoice.failureReason = reason;
  return true;
}
