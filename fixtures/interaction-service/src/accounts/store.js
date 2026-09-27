/** In-memory store: users plus the data they own. */
export function createStore() {
  const users = new Map();
  const orders = new Map();
  const files = new Map();
  return {
    users,
    orders,
    files,
    addUser(user) {
      users.set(user.id, { ...user, deletedAt: null });
      orders.set(user.id, []);
      files.set(user.id, []);
    },
  };
}
