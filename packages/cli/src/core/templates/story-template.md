---
story_id: {{STORY_ID}}
epic: {{EPIC_ID}}
title: {{TITLE}}
owner: {{OWNER}}
status: ready
estimate: {{ESTIMATE}}
created: {{CREATED}}
updated: {{UPDATED}}
dependencies: {{DEPENDENCIES}}
tdd_mode: {{TDD_MODE}}
test_file: {{TEST_FILE}}
---

# {{STORY_ID}}: {{TITLE}}

**Epic**: {{EPIC_ID}}
**Owner**: {{OWNER}}
**Estimate**: {{ESTIMATE}}
{{TDD_BADGE}}

## Description
{{DESCRIPTION}}

## Acceptance Criteria
{{AC_BULLETS}}

## Architecture Context
<!-- AUTO-FILLED by epic-planner: Extract ONLY relevant architecture sections from docs/04-architecture/ -->
<!-- Include file locations, data models, API endpoints, component specs, testing requirements -->
<!-- Every technical detail MUST cite its source: [Source: architecture/api.md#endpoints] -->

### Data Models & Schemas
<!-- Specific schemas, validation rules, relationships this story uses -->

### API Specifications
<!-- Endpoint details, request/response formats, auth requirements -->

### Component Specifications
<!-- UI component details, props, state management -->

### File Locations & Naming
<!-- Exact paths where new code should be created -->

### Testing Requirements
<!-- Specific test cases, frameworks, patterns from testing-strategy.md -->

### Technical Constraints
<!-- Version requirements, performance considerations, security rules -->

## Technical Notes
<!-- Implementation hints, edge cases, specific approaches to use -->

## Testing Strategy
See: `docs/07-testing/test-cases/{{STORY_ID}}.md`
{{TDD_TEST_FILE_REF}}

## Dependencies
{{DEPENDENCIES}}

## Dev Agent Record
<!-- POPULATED BY DEVELOPMENT AGENT DURING IMPLEMENTATION -->

### Agent Model & Version
<!-- Which AI model was used (e.g., claude-opus, gpt-4o, etc.) -->

### Completion Notes
<!-- What was actually built vs. what was planned -->
<!-- Any deviations from acceptance criteria and why -->
<!-- Actual implementation time vs. estimate -->

### Issues Encountered
<!-- Challenges faced and how they were resolved -->
<!-- Bugs discovered and fixed -->
<!-- Architectural decisions made during implementation -->

### Lessons Learned
<!-- Key insights for next story in this epic -->
<!-- Patterns discovered that other stories should use -->
<!-- Technical debt discovered -->

### Files Modified
<!-- List all files created, modified, or deleted -->
<!-- Help future agents understand the scope -->

### Debug References
<!-- Links to debug logs, test runs, or decision traces -->

## Previous Story Insights
<!-- POPULATED FROM PREVIOUS STORY IN THIS EPIC -->
<!-- Key learnings from {{PREV_STORY_ID}} that apply here -->
<!-- Architectural patterns that worked/didn't work -->
