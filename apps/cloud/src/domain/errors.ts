export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_EXPIRED'
  | 'DEPENDENCY_INVALID'
  | 'OVERRIDE_REQUIRED'
  | 'CLAIM_CONFLICT'
  | 'CONNECTION_DISABLED'
  | 'CAPABILITY_REQUIRED'
  | 'CLIENT_NOT_ALLOWED'
  | 'CLIENT_WRITES_PAUSED'
  | 'APPROVAL_REQUIRED'
  | 'CONTENT_INCOMPLETE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'OPERATION_EXPIRED'
  | 'PROJECT_ARCHIVED'
  | 'UNSUPPORTED';

const HTTP: Partial<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  DEPENDENCY_INVALID: 400,
  CONTENT_INCOMPLETE: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONNECTION_DISABLED: 403,
  CAPABILITY_REQUIRED: 403,
  CLIENT_NOT_ALLOWED: 403,
  CLIENT_WRITES_PAUSED: 403,
  PROJECT_ARCHIVED: 403,
  APPROVAL_REQUIRED: 403,
  OVERRIDE_REQUIRED: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CLAIM_CONFLICT: 409,
  IDEMPOTENCY_EXPIRED: 410,
  OPERATION_EXPIRED: 410,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  UNSUPPORTED: 422,
};

const RETRYABLE = new Set<ErrorCode>(['VERSION_CONFLICT', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'CLAIM_CONFLICT']);

/** A business failure. Safe to show: never contains another tenant's data or a credential. */
export class AppError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: { currentVersion?: number; [k: string]: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.retryable = RETRYABLE.has(code);
  }
  get status(): number {
    return HTTP[this.code] ?? 400;
  }
  toJSON() {
    return { code: this.code, message: this.message, retryable: this.retryable, ...this.details };
  }
}

/** An OAuth scope the operation needs is missing: HTTP 403 insufficient_scope at the transport boundary. */
export class ScopeError extends Error {
  constructor(readonly required: string[]) {
    super(`This operation needs the OAuth scope(s): ${required.join(', ')}.`);
    this.name = 'ScopeError';
  }
}

export const notFound = (what = 'The requested object') => new AppError('NOT_FOUND', `${what} was not found or is not available to you.`);
