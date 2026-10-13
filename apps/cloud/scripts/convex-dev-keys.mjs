#!/usr/bin/env node
// Generates an RS256 keypair for Convex development sign-in (AGILEFLOW_DEV_AUTH=1)
// and prints the environment values to set on the dev deployment:
//   AGILEFLOW_DEV_PRIVATE_JWK  private JWK used by convex/devNode.ts to sign sessions
//   AGILEFLOW_JWKS             matching public JWKS used by convex/http.ts to verify them
// Usage: node apps/cloud/scripts/convex-dev-keys.mjs
//   then: npx convex env set AGILEFLOW_DEV_PRIVATE_JWK '<value>' (and the same for AGILEFLOW_JWKS)
import crypto from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const kid = crypto.randomBytes(6).toString('hex');
const priv = { ...(await exportJWK(privateKey)), kid, alg: 'RS256', use: 'sig' };
const pub = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
console.log(`AGILEFLOW_DEV_PRIVATE_JWK=${JSON.stringify(priv)}`);
console.log(`AGILEFLOW_JWKS=${JSON.stringify({ keys: [pub] })}`);
