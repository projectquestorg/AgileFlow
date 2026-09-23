/** Sum line items in cents. Discount is a percentage (0-100). */
export function cartTotal(items, discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const discount = Math.round((subtotal * discountPercent) / 100);
  return subtotal - discount;
}

export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}
