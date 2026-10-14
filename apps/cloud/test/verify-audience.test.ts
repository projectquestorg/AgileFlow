import { describe, expect, it } from 'vitest';
import { verifyAccessToken, type AuthConfig } from '../src/auth/verify';
import { DevIssuer } from '../src/dev/issuer';

const RES = { mcp: 'https://app.test/mcp', cli: 'https://app.test/cli', 'local-control': 'https://app.test/local-control' } as const;

async function setup(audience: AuthConfig['audience']) {
  const issuer = await DevIssuer.create('https://issuer.test');
  const config: AuthConfig = { issuer: issuer.issuer, keys: issuer.keys, resources: { ...RES }, sessionAuthorizedParties: [], audience };
  const tok = (aud?: string | string[], extra: { orgId?: string; typ?: string } = {}) =>
    issuer.accessToken({ userId: 'user_1', orgId: extra.orgId ?? 'org_1', clientId: 'client_cli', audience: aud, scopes: ['user:org:read', 'offline_access'], typ: extra.typ });
  return { config, tok };
}

describe('access-token audience rules', () => {
  it('default (spec) mode still requires aud = the exact resource', async () => {
    const { config, tok } = await setup(undefined);
    await expect(verifyAccessToken(await tok(), 'cli', config)).rejects.toMatchObject({ name: 'AuthError' });
    await expect(verifyAccessToken(await tok(RES.mcp), 'cli', config)).rejects.toMatchObject({ name: 'AuthError' });
    expect((await verifyAccessToken(await tok(RES.cli), 'cli', config)).audienceBound).toBe(true);
  });

  it('Clerk mode accepts a token without aud only as not audience-bound, so client binding must prove the endpoint', async () => {
    const { config, tok } = await setup('exact-or-client-bound');
    const p = await verifyAccessToken(await tok(), 'cli', config);
    expect(p).toMatchObject({ audienceBound: false, clientId: 'client_cli', orgId: 'org_1' });
  });

  it('Clerk mode still rejects a present but different aud (cross-endpoint replay)', async () => {
    const { config, tok } = await setup('exact-or-client-bound');
    await expect(verifyAccessToken(await tok(RES.mcp), 'cli', config)).rejects.toMatchObject({ name: 'AuthError' });
    await expect(verifyAccessToken(await tok('https://other.example/api'), 'mcp', config)).rejects.toMatchObject({ name: 'AuthError' });
    expect((await verifyAccessToken(await tok([RES.cli, 'x']), 'cli', config)).audienceBound).toBe(true);
  });

  it('Clerk mode keeps the organization and token-type requirements', async () => {
    const { config, tok } = await setup('exact-or-client-bound');
    await expect(verifyAccessToken(await tok(undefined, { orgId: '' }), 'cli', config)).rejects.toMatchObject({ reason: 'organization' });
    await expect(verifyAccessToken(await tok(undefined, { typ: 'JWT' }), 'cli', config)).rejects.toMatchObject({ reason: 'token_type' });
  });
});
