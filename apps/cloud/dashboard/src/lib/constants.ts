export const STORY_STATUSES = ['backlog', 'ready', 'in-progress', 'in-review', 'blocked', 'done', 'cancelled'] as const;
export const EPIC_STATUSES = ['proposed', 'active', 'done', 'cancelled'] as const;
export const DECISION_STATUSES = ['proposed', 'accepted', 'superseded', 'rejected'] as const;
export const STATUSES: Record<string, readonly string[]> = { story: STORY_STATUSES, epic: EPIC_STATUSES, decision: DECISION_STATUSES };
export const PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;
export const HORIZONS = ['now', 'next', 'later'] as const;
export const NOTE_KINDS = ['comment', 'progress', 'blocker', 'handoff', 'decision-proposal'] as const;

export const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== false && v !== null)) as Partial<T>;

export const idsFrom = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function fmtTime(iso?: string | null) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString();
}

export function relTime(iso?: string | null) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const v = a < 60 ? `${a}s` : a < 3600 ? `${Math.floor(a / 60)}m` : a < 86400 ? `${Math.floor(a / 3600)}h` : `${Math.floor(a / 86400)}d`;
  if (a < 5) return 'just now';
  return future ? `in ${v}` : `${v} ago`;
}

export function actorLabel(a?: { kind: string; userId: string; clientId?: string } | null) {
  if (!a) return 'removed author';
  if (a.kind === 'user') return a.userId;
  return `${a.kind}${a.clientId ? ` (${a.clientId})` : ''} for ${a.userId}`;
}

export const safeHref = (u?: string | null) => {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch {
    return null;
  }
};

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
