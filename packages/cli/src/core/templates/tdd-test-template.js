/**
 * TDD Test Template for AgileFlow Story Creation
 *
 * This template generates framework-specific test stubs from acceptance criteria.
 * Used by /agileflow:story when TDD=true flag is set.
 *
 * Placeholders:
 * - {{STORY_ID}} - Story identifier (e.g., US-0042)
 * - {{TITLE}} - Story title
 * - {{EPIC}} - Epic identifier (e.g., EP-0010)
 * - {{AC_TESTS}} - Generated test cases from acceptance criteria
 * - {{CREATED}} - ISO timestamp
 */

// Template for Jest/Vitest (JavaScript/TypeScript)
const jestTemplate = `/**
 * TDD Tests for {{STORY_ID}}: {{TITLE}}
 *
 * Story: docs/06-stories/{{EPIC}}/{{STORY_ID}}-*.md
 * Created: {{CREATED}}
 *
 * These tests are generated from acceptance criteria.
 * Implementation goal: Make all tests pass.
 *
 * Workflow:
 * 1. Review each test case (currently skipped)
 * 2. Implement the feature code
 * 3. Remove .skip from tests one at a time
 * 4. Run tests until all pass
 */

describe('{{STORY_ID}}: {{TITLE}}', () => {
{{AC_TESTS}}
});
`;

// Template for individual AC test block (Jest)
const jestAcTemplate = `
  // {{AC_LABEL}}: {{AC_SUMMARY}}
  describe('{{AC_SUMMARY}}', () => {
    it.skip('should {{THEN_CLAUSE}}', () => {
      // Given: {{GIVEN_CLAUSE}}
      // TODO: Set up test preconditions

      // When: {{WHEN_CLAUSE}}
      // TODO: Execute the action

      // Then: {{THEN_CLAUSE}}
      // TODO: Add assertions
      expect(true).toBe(true);
    });
  });
`;

// Template for pytest (Python)
const pytestTemplate = `"""
TDD Tests for {{STORY_ID}}: {{TITLE}}

Story: docs/06-stories/{{EPIC}}/{{STORY_ID}}-*.md
Created: {{CREATED}}

These tests are generated from acceptance criteria.
Implementation goal: Make all tests pass.

Workflow:
1. Review each test case (currently skipped)
2. Implement the feature code
3. Remove @pytest.mark.skip from tests one at a time
4. Run tests until all pass
"""

import pytest

{{AC_TESTS}}
`;

// Template for individual AC test block (pytest)
const pytestAcTemplate = `
# {{AC_LABEL}}: {{AC_SUMMARY}}
class Test{{AC_CLASS_NAME}}:
    @pytest.mark.skip(reason="TDD: Implement feature first")
    def test_{{TEST_NAME}}(self):
        """
        Given: {{GIVEN_CLAUSE}}
        When: {{WHEN_CLAUSE}}
        Then: {{THEN_CLAUSE}}
        """
        # TODO: Set up test preconditions (Given)

        # TODO: Execute the action (When)

        # TODO: Add assertions (Then)
        assert True
`;

// Template for Go tests
const goTestTemplate = `package {{PACKAGE_NAME}}_test

/*
TDD Tests for {{STORY_ID}}: {{TITLE}}

Story: docs/06-stories/{{EPIC}}/{{STORY_ID}}-*.md
Created: {{CREATED}}

These tests are generated from acceptance criteria.
Implementation goal: Make all tests pass.
*/

import (
	"testing"
)

{{AC_TESTS}}
`;

// Template for individual AC test block (Go)
const goAcTemplate = `
// {{AC_LABEL}}: {{AC_SUMMARY}}
func Test{{AC_FUNC_NAME}}(t *testing.T) {
	t.Skip("TDD: Implement feature first")

	// Given: {{GIVEN_CLAUSE}}
	// TODO: Set up test preconditions

	// When: {{WHEN_CLAUSE}}
	// TODO: Execute the action

	// Then: {{THEN_CLAUSE}}
	// TODO: Add assertions
}
`;

// Export templates for use by story.md command
module.exports = {
  jest: {
    file: jestTemplate,
    ac: jestAcTemplate,
    extension: '.test.ts',
    directory: '__tests__'
  },
  vitest: {
    file: jestTemplate, // Same format as Jest
    ac: jestAcTemplate,
    extension: '.test.ts',
    directory: '__tests__'
  },
  pytest: {
    file: pytestTemplate,
    ac: pytestAcTemplate,
    extension: '_test.py',
    directory: 'tests'
  },
  go: {
    file: goTestTemplate,
    ac: goAcTemplate,
    extension: '_test.go',
    directory: ''
  },

  /**
   * Parse acceptance criteria into structured format
   * @param {string} acText - Raw AC text with Given/When/Then
   * @returns {Array} Parsed AC objects
   */
  parseAcceptanceCriteria(acText) {
    const criteria = [];
    const acBlocks = acText.split(/(?=(?:AC\d+|###?\s*AC))/i);

    for (const block of acBlocks) {
      if (!block.trim()) continue;

      // Extract label (AC1, AC2, etc.)
      const labelMatch = block.match(/(?:AC\s*)?(\d+)/i);
      const label = labelMatch ? `AC${labelMatch[1]}` : `AC${criteria.length + 1}`;

      // Extract Given/When/Then
      const givenMatch = block.match(/\*?\*?Given\*?\*?[:\s]+(.+?)(?=\*?\*?When|$)/is);
      const whenMatch = block.match(/\*?\*?When\*?\*?[:\s]+(.+?)(?=\*?\*?Then|$)/is);
      const thenMatch = block.match(/\*?\*?Then\*?\*?[:\s]+(.+?)(?=\*?\*?(?:Given|AC|###)|$)/is);

      if (givenMatch || whenMatch || thenMatch) {
        criteria.push({
          label,
          given: givenMatch ? givenMatch[1].trim() : 'preconditions are met',
          when: whenMatch ? whenMatch[1].trim() : 'action is performed',
          then: thenMatch ? thenMatch[1].trim() : 'expected result occurs',
          summary: this.generateSummary(givenMatch, whenMatch, thenMatch)
        });
      }
    }

    // If no structured AC found, create one from the whole text
    if (criteria.length === 0 && acText.trim()) {
      criteria.push({
        label: 'AC1',
        given: 'the feature is implemented',
        when: 'user interacts with it',
        then: 'expected behavior occurs',
        summary: acText.substring(0, 50).trim()
      });
    }

    return criteria;
  },

  /**
   * Generate a short summary from Given/When/Then
   */
  generateSummary(givenMatch, whenMatch, thenMatch) {
    if (thenMatch) {
      // Use Then clause, truncated
      return thenMatch[1].trim().substring(0, 50).replace(/[^\w\s]/g, '');
    }
    if (whenMatch) {
      return whenMatch[1].trim().substring(0, 50).replace(/[^\w\s]/g, '');
    }
    return 'acceptance criteria';
  },

  /**
   * Convert string to valid function/class name
   */
  toIdentifier(str) {
    return str
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  },

  /**
   * Convert string to PascalCase for class names
   */
  toPascalCase(str) {
    return str
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
};
