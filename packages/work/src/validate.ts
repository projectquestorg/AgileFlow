import fs from 'node:fs';
import { evidenceProblems } from './evidence';
import { idType } from './ids';
import { productFile, readmeFile, relToProject, roadmapFile } from './paths';
import { acceptanceCriteria, incompleteDependencies, isOpenStory, storiesForEpic } from './queries';
import { allArtifacts, type WorkScan } from './scanner';
import { findDependencyCycles } from './graph';
import { capList } from './text';

export { findDependencyCycles };
import type { Story, WorkIssue } from './types';

export interface WorkValidation {
  counts: { epics: number; stories: number; decisions: number };
  /** Named checks that passed, for the `check` summary (e.g. "no duplicate IDs"). */
  passed: string[];
  issues: WorkIssue[];
  errors: number;
  warnings: number;
}

const ID_MENTION_RE = /\b(?:EPIC|STORY|DEC)-[0-9A-HJKMNP-TV-Z]{8}\b/g;

export function validateWorkspace(scan: WorkScan): WorkValidation {
  const issues: WorkIssue[] = [];
  const passed: string[] = [];
  const counts = { epics: scan.epics.length, stories: scan.stories.length, decisions: scan.decisions.length };
  const { paths } = scan;

  // Structure
  if (!scan.exists) {
    issues.push({
      level: 'error',
      message: `Work is enabled but ${paths.root}/ does not exist`,
      detail: ['Run `agileflow work init` to create it.'],
    });
  } else {
    for (const file of [readmeFile(paths), productFile(paths), roadmapFile(paths)]) {
      if (!fs.existsSync(file)) {
        issues.push({ level: 'warn', message: `${relToProject(paths, file)} is missing`, detail: ['`agileflow work init` recreates missing starter files without touching others.'] });
      }
    }
  }
  const structureIssues = scan.issues.length;
  issues.push(...scan.issues);
  if (scan.exists && !structureIssues && !issues.length) passed.push('workspace structure valid');

  // Duplicate IDs
  const byId = new Map<string, string[]>();
  for (const a of allArtifacts(scan)) {
    const files = byId.get(a.id);
    if (files) files.push(a.path);
    else byId.set(a.id, [a.path]);
  }
  let duplicates = 0;
  for (const [id, files] of byId) {
    if (files.length < 2) continue;
    duplicates++;
    issues.push({
      level: 'error',
      message: `duplicate ${idType(id) ?? 'work'} id ${id} (${files.length} files)`,
      detail: [...files, 'Commands refuse to act on this ID until every copy but one has a new ID.'],
    });
  }
  if (!duplicates) passed.push('no duplicate IDs');

  const epicIds = new Set(scan.epics.map((e) => e.id));
  const storyIds = new Set(scan.stories.map((s) => s.id));
  const allIds = new Set(byId.keys());

  // Epic references
  let missingEpics = 0;
  for (const story of scan.stories) {
    if (story.epic && !epicIds.has(story.epic)) {
      missingEpics++;
      issues.push({ level: 'error', message: `${story.id} references unknown epic ${story.epic}`, path: story.path });
    }
  }
  if (!missingEpics) passed.push('no missing epic references');

  // Dependencies
  let graphProblems = 0;
  for (const story of scan.stories) {
    for (const dep of story.depends_on ?? []) {
      if (dep === story.id) {
        graphProblems++;
        issues.push({ level: 'error', message: `${story.id} depends on itself`, path: story.path });
      } else if (!storyIds.has(dep)) {
        graphProblems++;
        issues.push({ level: 'error', message: `${story.id} depends on unknown story ${dep}`, path: story.path });
      }
    }
  }
  for (const cycle of findDependencyCycles(scan.stories)) {
    graphProblems++;
    // Long cycles are shortened: the first ids, then `... (N more)`.
    issues.push({ level: 'error', message: 'dependency cycle', detail: [capList([...cycle, cycle[0]!])] });
  }
  if (!graphProblems) passed.push('dependency graph valid');

  // Decision references
  for (const decision of scan.decisions) {
    for (const ref of decision.related ?? []) {
      if (!allIds.has(ref)) {
        issues.push({ level: 'error', message: `${decision.id} references unknown ${ref}`, path: decision.path });
      }
    }
  }

  // Done epics with unfinished stories
  for (const epic of scan.epics) {
    if (epic.status !== 'done') continue;
    const open = storiesForEpic(scan, epic.id).filter(isOpenStory);
    if (open.length) {
      issues.push({
        level: 'error',
        message: `${epic.id} is marked done but has unfinished stories:`,
        detail: open.map((s) => `${s.id}  ${s.status}`),
        path: epic.path,
      });
    }
  }

  // Done stories with unchecked acceptance criteria (warning: never change the status)
  for (const story of scan.stories) {
    if (story.status !== 'done') continue;
    const { unchecked } = acceptanceCriteria(story.body);
    if (unchecked.length) {
      issues.push({
        level: 'warn',
        message: `${story.id} is done but has ${unchecked.length} unchecked acceptance criteri${unchecked.length === 1 ? 'on' : 'a'}`,
        detail: unchecked.map((c) => `[ ] ${c}`),
        path: story.path,
      });
    }
  }

  // Acceptance-criteria evidence blocks that do not parse or point at criteria that no longer exist
  for (const story of scan.stories) {
    if (!story.body.includes('agileflow-evidence')) continue;
    for (const problem of evidenceProblems(story.body)) {
      issues.push({ level: 'warn', message: `${story.id}: ${problem}`, path: story.path });
    }
  }

  // Ready stories whose dependencies are not done
  for (const story of scan.stories) {
    if (story.status !== 'ready') continue;
    for (const dep of incompleteDependencies(scan, story)) {
      if (!dep.story) continue; // already an error above
      issues.push({
        level: 'warn',
        message: `${story.id} is marked ready but depends on ${dep.story.id} (${dep.story.status})`,
        path: story.path,
      });
    }
  }

  // IDs mentioned in bodies that do not exist (e.g. "Follow DEC-4C8M2Q7K")
  for (const a of allArtifacts(scan)) {
    const unknown = [...new Set(a.body.match(ID_MENTION_RE) ?? [])].filter((id) => !allIds.has(id));
    if (unknown.length) {
      issues.push({ level: 'warn', message: `${a.id} mentions unknown ${unknown.join(', ')}`, path: a.path });
    }
  }

  return {
    counts,
    passed,
    issues,
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
  };
}
