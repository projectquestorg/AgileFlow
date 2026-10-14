import { describe, expect, it } from 'vitest';
import { apiError } from '../../src/cloud/client';

const res = (status: number, body: unknown) => ({ status, body, headers: new Headers() });

describe('connected CLI in grants mode (Clerk)', () => {
  it('turns CAPABILITY_REQUIRED into a dashboard grant hint, never a re-login with scopes', () => {
    const err = apiError(
      res(403, { error: { code: 'CAPABILITY_REQUIRED', message: 'This connection has not been granted "work:write".', capability: 'work:write', grantUrl: 'https://app.example/#/connections/conn_1?grant=work%3Awrite' } }),
      'cli',
    );
    expect(err.message).toContain('(CAPABILITY_REQUIRED)');
    expect(err.hint!.join(' ')).toContain('https://app.example/#/connections/conn_1?grant=work%3Awrite');
    expect(err.hint!.join(' ')).not.toContain('--scope');
  });
  it('explains CLIENT_NOT_ALLOWED', () => {
    const err = apiError(res(403, { error: { code: 'CLIENT_NOT_ALLOWED', message: 'This client is not registered for the AgileFlow cli endpoint.' } }), 'cli');
    expect(err.hint!.join(' ')).toContain('agileflow cloud login');
  });
});
