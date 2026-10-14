/**
 * Current organization membership, fetched from the identity provider. Clerk
 * is authoritative; AgileFlow keeps a mirror and re-verifies it: every
 * shared-state mutation checks upstream, reads may use a mirror verified
 * within the last 60 seconds. When upstream cannot answer, access fails closed.
 */
export interface MembershipInfo {
  role: 'admin' | 'member';
  orgName?: string;
  user?: { displayName?: string; email?: string };
}

export interface MembershipSource {
  /** null = not a member (or the organization/user no longer exists). Throws when upstream is unavailable. */
  fetch(orgId: string, userId: string): Promise<MembershipInfo | null>;
}

export class UpstreamUnavailable extends Error {
  constructor(message = 'The identity provider could not be reached to verify membership.') {
    super(message);
    this.name = 'UpstreamUnavailable';
  }
}

/** Clerk Backend API (CLERK_SECRET_KEY). */
export function clerkMembershipSource(secretKey: string, apiUrl = 'https://api.clerk.com', fetchImpl: typeof fetch = fetch): MembershipSource {
  const get = async (path: string) => {
    let res: Response;
    try {
      res = await fetchImpl(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(5000) });
    } catch {
      throw new UpstreamUnavailable();
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new UpstreamUnavailable(`The identity provider returned HTTP ${res.status} while verifying membership.`);
    return (await res.json()) as Record<string, unknown>;
  };
  return {
    async fetch(orgId, userId) {
      const list = await get(`/v1/organizations/${encodeURIComponent(orgId)}/memberships?user_id=${encodeURIComponent(userId)}&limit=1`);
      const m = (list?.data as Array<Record<string, any>> | undefined)?.find((d) => d.public_user_data?.user_id === userId);
      if (!m) return null;
      const pud = m.public_user_data ?? {};
      return {
        role: String(m.role ?? '').replace(/^org:/, '') === 'admin' ? 'admin' : 'member',
        orgName: m.organization?.name,
        user: {
          displayName: [pud.first_name, pud.last_name].filter(Boolean).join(' ') || pud.identifier,
          email: pud.identifier,
        },
      };
    },
  };
}

/** In-memory directory for development and tests. */
export class DevDirectory implements MembershipSource {
  private members = new Map<string, MembershipInfo>();
  orgNames = new Map<string, string>();
  unavailable = false;
  calls = 0;

  set(orgId: string, userId: string, info: MembershipInfo | null): void {
    const key = `${orgId}\u0000${userId}`;
    if (info) this.members.set(key, info);
    else this.members.delete(key);
  }

  async fetch(orgId: string, userId: string): Promise<MembershipInfo | null> {
    this.calls++;
    if (this.unavailable) throw new UpstreamUnavailable();
    const m = this.members.get(`${orgId}\u0000${userId}`);
    return m ? { ...m, orgName: m.orgName ?? this.orgNames.get(orgId) } : null;
  }
}
