'use node';
import crypto from 'node:crypto';
import { v } from 'convex/values';
import { importJWK, SignJWT, type JWK } from 'jose';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';

/**
 * Development sign-in (AGILEFLOW_DEV_AUTH=1 only): records the dev directory
 * membership (the stand-in for Clerk) and signs a session JWT like
 * src/dev/issuer.ts, with the key from AGILEFLOW_DEV_PRIVATE_JWK (generate it
 * with scripts/convex-dev-keys.mjs; AGILEFLOW_JWKS holds the public half).
 */
export const session = internalAction({
  args: { userId: v.optional(v.any()), orgId: v.optional(v.any()), role: v.optional(v.any()), name: v.optional(v.any()), orgName: v.optional(v.any()) },
  handler: async (ctx, a): Promise<{ token?: string; error?: string }> => {
    if (process.env.AGILEFLOW_DEV_AUTH !== '1') return { error: 'development sign-in is disabled' };
    const raw = process.env.AGILEFLOW_DEV_PRIVATE_JWK;
    const issuer = process.env.CLERK_ISSUER;
    if (!raw || !issuer) return { error: 'AGILEFLOW_DEV_PRIVATE_JWK and CLERK_ISSUER must be set for development sign-in.' };
    if (typeof a.userId !== 'string' || !/^[\w.-]{1,64}$/.test(a.userId)) return { error: 'userId is required.' };
    const orgId = typeof a.orgId === 'string' && a.orgId ? a.orgId : null;
    const role = a.role === 'admin' ? 'admin' : 'member';
    if (orgId) {
      await ctx.runMutation(internal.dev.directorySet, {
        orgId,
        userId: a.userId,
        info: { role, orgName: typeof a.orgName === 'string' ? a.orgName : orgId, user: { displayName: typeof a.name === 'string' ? a.name : a.userId } },
      });
    }
    const jwk = JSON.parse(raw) as JWK;
    const key = await importJWK(jwk, 'RS256');
    const claims: Record<string, unknown> = { sid: `sess_${crypto.randomBytes(8).toString('hex')}` };
    const azp = (process.env.AGILEFLOW_PUBLIC_URL ?? '').replace(/\/+$/, '');
    if (azp) claims.azp = azp;
    if (orgId) claims.o = { id: orgId, rol: role };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })
      .setIssuer(issuer)
      .setSubject(a.userId)
      .setIssuedAt()
      .setExpirationTime('3600s')
      .sign(key);
    return { token };
  },
});
