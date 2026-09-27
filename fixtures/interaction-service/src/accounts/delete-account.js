/** Delete a user's account and everything they own, immediately. */
export function deleteAccount(store, userId) {
  if (!store.users.has(userId)) return false;
  store.users.delete(userId);
  store.orders.delete(userId);
  store.files.delete(userId);
  return true;
}
