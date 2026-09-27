/** Document format version of every structured Work artifact (not the AgileFlow version). */
export const WORK_SCHEMA_VERSION = 1;

export const DEFAULT_WORK_ROOT = 'docs/agile';

export const STORY_STATUSES = ['backlog', 'ready', 'in-progress', 'in-review', 'blocked', 'done', 'cancelled'] as const;
export const EPIC_STATUSES = ['proposed', 'active', 'done', 'cancelled'] as const;
export const DECISION_STATUSES = ['proposed', 'accepted', 'superseded', 'rejected'] as const;
export const PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;
export const HORIZONS = ['now', 'next', 'later'] as const;

export const ARTIFACT_TYPES = ['epic', 'story', 'decision'] as const;

/** ID prefix per artifact type. */
export const ID_PREFIX = { epic: 'EPIC', story: 'STORY', decision: 'DEC' } as const;

/** The five workspace categories. Individual subdirectories are not configurable. */
export const DIRS = {
  product: '00-product',
  roadmap: '01-roadmap',
  epic: '02-epics',
  story: '03-stories',
  decision: '04-decisions',
} as const;

export const README_FILE = 'README.md';
export const PRODUCT_FILE = 'product.md';
export const ROADMAP_FILE = 'roadmap.md';

/** Crockford Base32 (no I, L, O, U). */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ID_SUFFIX_LENGTH = 8;

/** Story states that are still open work (not done or cancelled). */
export const OPEN_STORY_STATUSES = ['backlog', 'ready', 'in-progress', 'in-review', 'blocked'] as const;

/** Board sections, in display order. */
export const BOARD_STATUSES = ['backlog', 'ready', 'in-progress', 'in-review', 'blocked'] as const;

export const PRIORITY_MEANING: Record<(typeof PRIORITIES)[number], string> = {
  p0: 'urgent / critical',
  p1: 'high',
  p2: 'normal',
  p3: 'low',
};
