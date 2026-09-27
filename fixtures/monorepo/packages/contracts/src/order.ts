export interface Order {
  id: string;
  /** null for guest checkout orders. */
  customerId: string | null;
  email: string;
  totalCents: number;
}
