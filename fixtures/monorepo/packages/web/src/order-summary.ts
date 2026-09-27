import type { Order } from '@demo/contracts/src/order';

export const orderOwner = (o: Order) => (o.customerId === null ? `Guest (${o.email})` : o.customerId);
