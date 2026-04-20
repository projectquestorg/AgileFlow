/**
 * `agileflow doctor` — validate config, plugins, skills, hook manifest.
 *
 * Phase 1 stub. The real implementation lands in Phase 5 alongside the
 * skill validator.
 */
async function doctor() {
  // eslint-disable-next-line no-console
  console.log(
    [
      'agileflow doctor — not yet implemented (Phase 5).',
      '',
      'Phase 5 ships: config schema validation, plugin.yaml validation,',
      '               skill frontmatter v2 enforcement (Use-when policy,',
      '               keyword collision detection), hook-manifest cycle',
      '               detection, and an integrity report.',
    ].join('\n'),
  );
  process.exitCode = 2;
}

module.exports = doctor;
