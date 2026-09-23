export class UserNotFoundError extends Error {
  constructor(id) {
    super(`user not found: ${id}`);
    this.name = 'UserNotFoundError';
    this.userId = id;
  }
}
