import type { RootMeta, Signed } from './signing';

/**
 * Registry trust root pinned into this CLI release: the publishers' keys for
 * the official registry. Written by `npm run registry:sign -- root` during the
 * key ceremony (see apps/cli/PUBLISHING.md). While it is null, official
 * packages are verified against the integrity pins only and `verify` reports
 * the registry as unsigned.
 */
export const TRUSTED_ROOT: Signed<RootMeta> | null = null;
