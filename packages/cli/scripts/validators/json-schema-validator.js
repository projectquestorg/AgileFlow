#!/usr/bin/env node
/**
 * JSON Schema Validator
 *
 * Validates JSON files for proper structure after Write operations.
 *
 * Exit codes:
 *   0 = Success
 *   2 = Error (Claude will attempt to fix)
 *   1 = Warning (logged but not blocking)
 *
 * Usage in agent hooks:
 *   hooks:
 *     PostToolUse:
 *       - matcher: "Write"
 *         hooks:
 *           - type: command
 *             command: "node .agileflow/hooks/validators/json-schema-validator.js"
 */

const fs = require('fs');
const path = require('path');

// Import status constants from single source of truth
const { VALID_STATUSES } = require('../lib/story-state-machine');

// Extended statuses for backward compatibility (maps to canonical values)
// These legacy values are accepted but should be migrated to canonical values
const LEGACY_STATUSES = ['pending', 'done', 'in-progress', 'in-review'];
const ALL_ACCEPTED_STATUSES = [...VALID_STATUSES, ...LEGACY_STATUSES];

let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    // Only validate JSON files
    if (!filePath || !filePath.endsWith('.json')) {
      process.exit(0);
    }

    // Skip if file doesn't exist (might be a create failure)
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath} (skipping validation)`);
      process.exit(0);
    }

    const issues = validateJson(filePath);

    if (issues.length > 0) {
      console.error(`Resolve these JSON issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`JSON validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function validateJson(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check for empty file
    if (!content.trim()) {
      issues.push('File is empty');
      return issues;
    }

    // Try to parse JSON
    const data = JSON.parse(content);

    // Check for common JSON issues
    if (typeof data !== 'object' || data === null) {
      issues.push('Root must be an object or array');
    }

    // Specific checks for known files
    const fileName = path.basename(filePath);

    if (fileName === 'status.json') {
      issues.push(...validateStatusJson(data));
    } else if (fileName === 'package.json') {
      issues.push(...validatePackageJson(data));
    } else if (fileName === 'tsconfig.json') {
      issues.push(...validateTsConfig(data));
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      issues.push(`Invalid JSON syntax: ${e.message}`);
    } else {
      issues.push(`Read error: ${e.message}`);
    }
  }

  return issues;
}

function validateStatusJson(data) {
  const issues = [];

  // Check for required structure - status.json has epics object with embedded stories
  if (!data.epics && !data.current_story && !data.updated) {
    issues.push('status.json should have epics, current_story, or updated field');
  }

  // Validate epics object if present
  if (data.epics) {
    if (typeof data.epics !== 'object' || Array.isArray(data.epics)) {
      issues.push('epics must be an object (not array)');
    } else {
      Object.entries(data.epics).forEach(([epicId, epic]) => {
        if (!epic.title) {
          issues.push(`Epic ${epicId} missing 'title' field`);
        }
        if (epic.stories && !Array.isArray(epic.stories)) {
          issues.push(`Epic ${epicId} stories must be an array`);
        }
      });
    }
  }

  // Validate stories - can be object (map by ID) or array
  if (data.stories) {
    if (Array.isArray(data.stories)) {
      // Array format
      data.stories.forEach((story, index) => {
        if (!story.id) {
          issues.push(`Story at index ${index} missing required 'id' field`);
        }
        if (!story.title && !story.name) {
          issues.push(`Story ${story.id || index} missing 'title' or 'name' field`);
        }
        if (story.status && !ALL_ACCEPTED_STATUSES.includes(story.status)) {
          issues.push(`Story ${story.id || index} has invalid status: ${story.status}`);
        }
      });
    } else if (typeof data.stories === 'object') {
      // Object/map format (keyed by story ID)
      Object.entries(data.stories).forEach(([storyId, story]) => {
        if (!story.title && !story.name) {
          issues.push(`Story ${storyId} missing 'title' or 'name' field`);
        }
        if (story.status && !ALL_ACCEPTED_STATUSES.includes(story.status)) {
          issues.push(`Story ${storyId} has invalid status: ${story.status}`);
        }
      });
    }
  }

  return issues;
}

function validatePackageJson(data) {
  const issues = [];

  if (!data.name) {
    issues.push('package.json requires "name" field');
  }
  if (!data.version) {
    issues.push('package.json requires "version" field');
  }
  if (data.version && !/^\d+\.\d+\.\d+/.test(data.version)) {
    issues.push(`Invalid version format: ${data.version} (expected semver)`);
  }

  return issues;
}

function validateTsConfig(data) {
  const issues = [];

  if (!data.compilerOptions) {
    issues.push('tsconfig.json should have compilerOptions');
  }

  return issues;
}
