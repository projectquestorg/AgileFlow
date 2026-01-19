#!/usr/bin/env node
/**
 * Migration Validator
 *
 * Validates database migration commands for proper patterns.
 *
 * Exit codes:
 *   0 = Success
 *   2 = Error (Claude will attempt to fix)
 *   1 = Warning (logged but not blocking)
 *
 * Usage in agent hooks:
 *   hooks:
 *     PostToolUse:
 *       - matcher: "Bash"
 *         hooks:
 *           - type: command
 *             command: "node .agileflow/hooks/validators/migration-validator.js"
 */

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const command = context.tool_input?.command;
    const result = context.result || '';

    // Only validate migration-related commands
    if (!command || !isMigrationCommand(command)) {
      process.exit(0);
    }

    const issues = validateMigration(command, result);

    if (issues.length > 0) {
      console.error(`Migration validation issues:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Migration validation passed: ${command.substring(0, 50)}...`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function isMigrationCommand(command) {
  const migrationPatterns = [
    /prisma\s+migrate/i,
    /drizzle-kit/i,
    /typeorm\s+migration/i,
    /knex\s+migrate/i,
    /sequelize\s+db:migrate/i,
    /alembic/i,
    /flyway/i,
    /liquibase/i,
    /rails\s+db:migrate/i,
    /django.*migrate/i,
    /psql.*-f.*\.sql/i,
    /mysql.*<.*\.sql/i,
  ];

  return migrationPatterns.some(pattern => pattern.test(command));
}

function validateMigration(command, result) {
  const issues = [];

  // Check for destructive operations without safeguards
  const destructivePatterns = [
    { pattern: /DROP\s+TABLE/i, message: 'DROP TABLE detected - ensure backup exists and this is intentional' },
    { pattern: /DROP\s+DATABASE/i, message: 'DROP DATABASE detected - this is extremely destructive!' },
    { pattern: /TRUNCATE/i, message: 'TRUNCATE detected - this removes all data permanently' },
    { pattern: /DELETE\s+FROM.*WHERE\s*$/i, message: 'DELETE without WHERE clause detected - will delete all rows' },
    { pattern: /--force|--skip-safe/i, message: 'Force flag used - bypassing safety checks' },
  ];

  for (const { pattern, message } of destructivePatterns) {
    if (pattern.test(command) || pattern.test(result)) {
      issues.push(message);
    }
  }

  // Check for production environment safeguards
  if (/production|prod/i.test(command) && !/--dry-run/i.test(command)) {
    issues.push('Production migration without --dry-run flag - consider dry run first');
  }

  // Check for failed migrations in output
  const failurePatterns = [
    { pattern: /error.*migration/i, message: 'Migration error detected in output' },
    { pattern: /rollback.*failed/i, message: 'Rollback failure detected' },
    { pattern: /constraint.*violation/i, message: 'Database constraint violation' },
    { pattern: /duplicate.*key/i, message: 'Duplicate key error - migration may have partially applied' },
    { pattern: /already exists/i, message: 'Object already exists - migration may need cleanup' },
  ];

  for (const { pattern, message } of failurePatterns) {
    if (pattern.test(result)) {
      issues.push(message);
    }
  }

  // Check for missing rollback strategy
  if (/migrate.*dev|migrate.*run/i.test(command)) {
    // Prisma and similar ORMs
    if (!/down|rollback|reset/i.test(result) && result.includes('migration')) {
      // Just a warning, not blocking
      console.log('Note: Ensure rollback migration exists for this change');
    }
  }

  return issues;
}
