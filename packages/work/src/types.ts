import { z } from 'zod';
import {
  CROCKFORD_ALPHABET,
  DECISION_STATUSES,
  EPIC_STATUSES,
  HORIZONS,
  ID_SUFFIX_LENGTH,
  PRIORITIES,
  STORY_STATUSES,
} from './constants';

export type StoryStatus = (typeof STORY_STATUSES)[number];
export type EpicStatus = (typeof EPIC_STATUSES)[number];
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Horizon = (typeof HORIZONS)[number];
export type ArtifactType = 'epic' | 'story' | 'decision';

const suffix = `[${CROCKFORD_ALPHABET}]{${ID_SUFFIX_LENGTH}}`;
export const EPIC_ID_RE = new RegExp(`^EPIC-${suffix}$`);
export const STORY_ID_RE = new RegExp(`^STORY-${suffix}$`);
export const DECISION_ID_RE = new RegExp(`^DEC-${suffix}$`);
export const ANY_ID_RE = new RegExp(`^(EPIC|STORY|DEC)-${suffix}$`);

const EpicId = z.string().regex(EPIC_ID_RE, 'must look like EPIC-XXXXXXXX (Crockford Base32)');
const StoryId = z.string().regex(STORY_ID_RE, 'must look like STORY-XXXXXXXX (Crockford Base32)');
const DecisionId = z.string().regex(DECISION_ID_RE, 'must look like DEC-XXXXXXXX (Crockford Base32)');
const AnyId = z.string().regex(ANY_ID_RE, 'must be an EPIC-, STORY-, or DEC- id');
const Title = z.string().trim().min(1, 'must not be empty');
/** Where an imported item came from (e.g. the v4 ID `US-0042`); makes imports idempotent. */
const LegacyId = z.string().trim().min(1, 'must not be empty');

export const PrioritySchema = z.enum(PRIORITIES);
export const HorizonSchema = z.enum(HORIZONS);

/** Epic frontmatter, schema 1. Required: schema, type, id, title, status. */
export const EpicFrontmatterSchema = z
  .object({
    schema: z.literal(1),
    type: z.literal('epic'),
    id: EpicId,
    title: Title,
    status: z.enum(EPIC_STATUSES),
    horizon: HorizonSchema.optional(),
    priority: PrioritySchema.optional(),
    legacy_id: LegacyId.optional(),
  })
  .strict();

/** Story frontmatter, schema 1. Required: schema, type, id, title, status. */
export const StoryFrontmatterSchema = z
  .object({
    schema: z.literal(1),
    type: z.literal('story'),
    id: StoryId,
    title: Title,
    status: z.enum(STORY_STATUSES),
    priority: PrioritySchema.optional(),
    epic: EpicId.optional(),
    depends_on: z.array(StoryId).optional(),
    legacy_id: LegacyId.optional(),
  })
  .strict();

/** Decision frontmatter, schema 1. Required: schema, type, id, title, status. */
export const DecisionFrontmatterSchema = z
  .object({
    schema: z.literal(1),
    type: z.literal('decision'),
    id: DecisionId,
    title: Title,
    status: z.enum(DECISION_STATUSES),
    related: z.array(AnyId).optional(),
  })
  .strict();

export const FRONTMATTER_SCHEMAS = {
  epic: EpicFrontmatterSchema,
  story: StoryFrontmatterSchema,
  decision: DecisionFrontmatterSchema,
} as const;

interface ArtifactBase {
  /** Path relative to the project root, POSIX separators. */
  path: string;
  /** Markdown after the frontmatter, exactly as on disk. */
  body: string;
}

export interface Story extends ArtifactBase {
  schema: 1;
  type: 'story';
  id: string;
  title: string;
  status: StoryStatus;
  priority?: Priority;
  epic?: string;
  depends_on?: string[];
  /** Set by `agileflow work import` (e.g. `US-0042`). */
  legacy_id?: string;
}

export interface Epic extends ArtifactBase {
  schema: 1;
  type: 'epic';
  id: string;
  title: string;
  status: EpicStatus;
  priority?: Priority;
  horizon?: Horizon;
  /** Set by `agileflow work import` (e.g. `EP-0007`). */
  legacy_id?: string;
}

export interface Decision extends ArtifactBase {
  schema: 1;
  type: 'decision';
  id: string;
  title: string;
  status: DecisionStatus;
  related?: string[];
}

export type Artifact = Epic | Story | Decision;

export type WorkIssueLevel = 'error' | 'warn';

/** A problem found while scanning or validating the workspace. */
export interface WorkIssue {
  level: WorkIssueLevel;
  message: string;
  detail?: string[];
  /** Path relative to the project root, when the issue is about one file. */
  path?: string;
  /**
   * What kind of scan issue this is. `misplaced` entries (files or folders
   * that are not part of the layout) and errors block adopting an existing
   * workspace; metadata warnings do not.
   */
  code?: 'misplaced' | 'invalid' | 'metadata';
}

/** Where the workspace lives. */
export interface WorkPaths {
  /** Project root (directory holding agileflow.yaml). */
  projectRoot: string;
  /** Workspace root as configured, relative to the project root (POSIX). */
  root: string;
  /** Absolute workspace root. */
  abs: string;
}
