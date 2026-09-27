import type { ArtifactType } from './types';

export const README_TEMPLATE = `# Agile Work

This directory contains the durable product and work context for this repository.

## Structure

- \`00-product/\` — product problem, users, goals, principles, and definition of done.
- \`01-roadmap/\` — current strategic direction.
- \`02-epics/\` — larger outcome-oriented bodies of work.
- \`03-stories/\` — independently actionable slices of work.
- \`04-decisions/\` — durable product or technical decisions that future work needs to understand.

Epics and stories use YAML frontmatter for machine-readable state.
Do not store temporary plans, agent scratch notes, session logs, generated reports, or implementation journals here.
`;

export const PRODUCT_TEMPLATE = `# Product

## Problem

What problem does this product solve?

## Users

Who are we building for?

## Outcomes

What should users be able to accomplish?

## Principles

What should remain true as the product evolves?

## Non-goals

What are we intentionally not trying to become?

## Definition of Done

A story is done when:
- its acceptance criteria are satisfied;
- relevant verification passes;
- no known blocker remains;
- required review/merge steps for this repository are complete.
`;

export const ROADMAP_TEMPLATE = `# Roadmap

## Now

What outcomes matter right now?

## Next

What becomes important after the current work?

## Later

What directions are likely but intentionally not active yet?
`;

/**
 * Body of a new artifact: the recommended headings, empty. No placeholder
 * checkboxes (they would count as unchecked acceptance criteria).
 */
export function artifactBody(type: ArtifactType, title: string): string {
  const sections =
    type === 'epic'
      ? ['Problem', 'Outcome', 'Scope', 'Non-goals', 'Success', 'Constraints']
      : type === 'story'
        ? ['Why', 'Outcome', 'Acceptance Criteria', 'Constraints']
        : ['Context', 'Decision', 'Why', 'Consequences'];
  return `# ${title}\n\n${sections.map((h) => `## ${h}\n`).join('\n')}`;
}
