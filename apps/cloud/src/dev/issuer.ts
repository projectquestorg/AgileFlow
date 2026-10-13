import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK, type JWTVerifyGetKey } from 'jose';
import crypto from 'node:crypto';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

/**
 * Local stand-in for a Clerk instance, used by tests and `AGILEFLOW_DEV_AUTH=1`.
 * It signs session tokens and OAuth access tokens with an in-memory key so the
 * real verification path (signature, issuer, audience, type, org) runs unchanged.
 * Never enabled in production configuration.
 */
export class DevIssuer {
  private constructor(
    readonly issuer: string,
    private readonly privateKey: PrivateKey,
    readonly jwks: { keys: JWK[] },
    readonly kid: string,
  ) {}

  static async create(issuer = 'https://dev-issuer.agileflow.local'): Promise<DevIssuer> {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const kid = crypto.randomBytes(6).toString('hex');
    const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
    return new DevIssuer(issuer, privateKey, { keys: [jwk] }, kid);
  }

  get keys(): JWTVerifyGetKey {
    return createLocalJWKSet(this.jwks);
  }

  async session(opts: { userId: string; orgId?: string | null; orgRole?: 'admin' | 'member'; azp?: string; ttlSec?: number }): Promise<string> {
    const claims: Record<string, unknown> = { sid: `sess_${crypto.randomBytes(8).toString('hex')}` };
    if (opts.azp) claims.azp = opts.azp;
    if (opts.orgId) claims.o = { id: opts.orgId, rol: opts.orgRole ?? 'member' };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: this.kid, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setSubject(opts.userId)
      .setIssuedAt()
      .setExpirationTime(`${opts.ttlSec ?? 3600}s`)
      .sign(this.privateKey);
  }

  async accessToken(opts: {
    userId: string;
    orgId?: string;
    clientId?: string;
    /** Omit to issue a token without `aud` (as Clerk does for public clients). */
    audience?: string | string[];
    scopes: string[];
    ttlSec?: number;
    typ?: string;
    issuer?: string;
  }): Promise<string> {
    const claims: Record<string, unknown> = { scope: opts.scopes.join(' '), client_id: opts.clientId ?? 'client_dev' };
    if (opts.orgId) claims.org_id = opts.orgId;
    const jwt = new SignJWT(claims);
    if (opts.audience !== undefined) jwt.setAudience(opts.audience);
    return jwt
      .setProtectedHeader({ alg: 'RS256', kid: this.kid, typ: opts.typ ?? 'at+jwt' })
      .setIssuer(opts.issuer ?? this.issuer)
      .setSubject(opts.userId)
      .setIssuedAt()
      .setJti(crypto.randomUUID())
      .setExpirationTime(`${opts.ttlSec ?? 3600}s`)
      .sign(this.privateKey);
  }
}
