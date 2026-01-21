#!/usr/bin/env node
/**
 * Story Format Validator
 *
 * Validates story structure in status.json after Write operations.
 * Ensures stories have required fields and valid values.
 *
 * Exit codes:
 *   0 = Success
 *   2 = Error (Claude will attempt to fix)
 *   1 = Warning (logged but not blocking)
 *
 * Usage in agent hooks (e.g., epic-planner.md):
 *   hooks:
 *     PostToolUse:
 *       - matcher: "Write"
 *         hooks:
 *           - type: command
 *             command: "node .agileflow/hooks/validators/story-format-validator.js"
 */

const fs = require('fs');
const path = require('path');

// Import status constants from single source of truth
const { VALID_STATUSES } = require('../lib/story-state-machine');

let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    // Only validate status.json
    if (!filePath || !filePath.endsWith('status.json')) {
      process.exit(0);
    }

    // Skip if file doesn't exist
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath} (skipping validation)`);
      process.exit(0);
    }

    const issues = validateStoryFormat(filePath);

    if (issues.length > 0) {
      console.error(`Resolve these story format issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Story format validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function validateStoryFormat(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Validate stories array
    if (data.stories) {
      if (!Array.isArray(data.stories)) {
        issues.push('stories must be an array');
        return issues;
      }

      data.stories.forEach((story, index) => {
        const storyIssues = validateSingleStory(story, index);
        issues.push(...storyIssues);
      });

      // Check for duplicate IDs
      const ids = data.stories.map(s => s.id).filter(Boolean);
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (duplicates.length > 0) {
        issues.push(`Duplicate story IDs: ${duplicates.join(', ')}`);
      }
    }

    // Validate epics if present
    if (data.epics) {
      if (!Array.isArray(data.epics)) {
        issues.push('epics must be an array');
      } else {
        data.epics.forEach((epic, index) => {
          if (!epic.id) {
            issues.push(`Epic at index ${index} missing 'id' field`);
          }
          if (!epic.title && !epic.name) {
            issues.push(`Epic ${epic.id || index} missing 'title' or 'name' field`);
          }
        });
      }
    }

    // Validate current_story reference if present
    if (data.current_story) {
      if (typeof data.current_story !== 'string') {
        issues.push('current_story must be a string (story ID)');
      } else if (data.stories) {
        const storyExists = data.stories.some(s => s.id === data.current_story);
        if (!storyExists) {
          issues.push(`current_story "${data.current_story}" not found in stories array`);
        }
      }
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      issues.push(`Invalid JSON: ${e.message}`);
    } else {
      issues.push(`Read error: ${e.message}`);
    }
  }

  return issues;
}

function validateSingleStory(story, index) {
  const issues = [];
  const storyRef = story.id || `index ${index}`;

  // Required fields
  if (!story.id) {
    issues.push(`Story at ${storyRef}: missing 'id' field`);
  } else {
    // ID format validation (US-XXXX or EP-XXXX)
    if (!/^(US|EP|TECH|BUG)-\d{4}$/.test(story.id)) {
      issues.push(
        `Story ${storyRef}: ID should match pattern US-XXXX, EP-XXXX, TECH-XXXX, or BUG-XXXX`
      );
    }
  }

  if (!story.title && !story.name) {
    issues.push(`Story ${storyRef}: missing 'title' or 'name' field`);
  }

  // Status validation (using canonical values from story-state-machine.js)
  // Also accept legacy formats for backward compatibility
  const legacyStatuses = ['pending', 'in-progress', 'in-review'];
  const allAcceptedStatuses = [...VALID_STATUSES, ...legacyStatuses];
  if (story.status && !allAcceptedStatuses.includes(story.status)) {
    issues.push(
      `Story ${storyRef}: invalid status "${story.status}". Valid: ${VALID_STATUSES.join(', ')}`
    );
  }

  // Priority validation
  const validPriorities = ['critical', 'high', 'medium', 'low'];
  if (story.priority && !validPriorities.includes(story.priority)) {
    issues.push(
      `Story ${storyRef}: invalid priority "${story.priority}". Valid: ${validPriorities.join(', ')}`
    );
  }

  // Owner validation (if present)
  if (story.owner) {
    const validOwners = [
      'AG-UI',
      'AG-API',
      'AG-CI',
      'AG-DB',
      'AG-TEST',
      'AG-DOC',
      'AG-SEC',
      'human',
    ];
    if (!validOwners.includes(story.owner)) {
      issues.push(
        `Story ${storyRef}: unknown owner "${story.owner}". Valid: ${validOwners.join(', ')}`
      );
    }
  }

  // Acceptance criteria should be array
  if (story.acceptance_criteria && !Array.isArray(story.acceptance_criteria)) {
    issues.push(`Story ${storyRef}: acceptance_criteria must be an array`);
  }

  // Epic reference validation
  if (story.epic_id) {
    if (!/^EP-\d{4}$/.test(story.epic_id)) {
      issues.push(`Story ${storyRef}: epic_id should match pattern EP-XXXX`);
    }
  }

  return issues;
}
