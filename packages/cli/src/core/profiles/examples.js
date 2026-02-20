/**
 * IDE Capability Profile - Usage Examples
 *
 * This file demonstrates how to use the profile loader
 * in installers, generators, and feature-detection code.
 *
 * Run: node examples.js
 */

const loader = require('./loader');

console.log('IDE Capability Profile - Usage Examples\n');
console.log('='.repeat(60) + '\n');

// ============================================================
// Example 1: Load a single profile
// ============================================================
console.log('1. LOAD A SINGLE PROFILE\n');

const claudeCodeProfile = loader.load('claude-code');
console.log(`Loaded: ${claudeCodeProfile.ide.displayName}`);
console.log(`Config dir: ${claudeCodeProfile.paths.commands}`);
console.log(`Instructions: ${claudeCodeProfile.paths.instructionsFile}`);
console.log();

// ============================================================
// Example 2: Load all profiles
// ============================================================
console.log('2. LOAD ALL PROFILES\n');

const allProfiles = loader.loadAll();
console.log('Available IDEs:');
Object.keys(allProfiles).sort().forEach(ide => {
  const profile = allProfiles[ide];
  console.log(`  - ${profile.ide.displayName}`);
});
console.log();

// ============================================================
// Example 3: List available profiles
// ============================================================
console.log('3. LIST AVAILABLE PROFILES\n');

const available = loader.listAvailable();
console.log(`Supported IDEs: ${available.join(', ')}`);
console.log();

// ============================================================
// Example 4: Check if IDE is supported
// ============================================================
console.log('4. CHECK IDE SUPPORT\n');

['claude-code', 'cursor', 'unknown-ide'].forEach(ide => {
  const supported = loader.isSupported(ide);
  console.log(`${ide}: ${supported ? '✓ supported' : '✗ not supported'}`);
});
console.log();

// ============================================================
// Example 5: Check specific capability
// ============================================================
console.log('5. CHECK SPECIFIC CAPABILITIES\n');

const capabilities = [
  { ide: 'claude-code', group: 'core', cap: 'planMode' },
  { ide: 'cursor', group: 'core', cap: 'planMode' },
  { ide: 'windsurf', group: 'collaboration', cap: 'taskTracking' },
  { ide: 'codex', group: 'planning', cap: 'planMode' },
];

capabilities.forEach(({ ide, group, cap }) => {
  const has = loader.hasCapability(ide, group, cap);
  const status = has ? '✅' : '❌';
  console.log(`${ide}: ${cap} ${status}`);
});
console.log();

// ============================================================
// Example 6: Get tool name mapping
// ============================================================
console.log('6. TOOL NAME MAPPINGS (IDE-specific equivalents)\n');

const toolAlias = 'bash';
console.log(`Standard tool alias: "${toolAlias}"`);
console.log('IDE-specific names:');
available.forEach(ide => {
  const toolName = loader.getToolName(ide, toolAlias);
  console.log(`  ${ide}: ${toolName || '(not available)'}`);
});
console.log();

// ============================================================
// Example 7: Get all capabilities for an IDE
// ============================================================
console.log('7. ALL CAPABILITIES FOR CURSOR\n');

const cursorCaps = loader.getAllCapabilities('cursor');
const enabledCaps = Object.entries(cursorCaps)
  .filter(([_, enabled]) => enabled)
  .map(([name, _]) => name);

console.log(`Cursor has ${enabledCaps.length} capabilities enabled:`);
enabledCaps.slice(0, 8).forEach(cap => console.log(`  ✓ ${cap}`));
console.log(`  ... and ${enabledCaps.length - 8} more`);
console.log();

// ============================================================
// Example 8: Find IDEs with a capability
// ============================================================
console.log('8. FIND IDEs WITH SPECIFIC CAPABILITY\n');

const idsWithPlanMode = loader.findIDEsWithCapability('planning', 'planMode');
console.log(`IDEs with plan mode: ${idsWithPlanMode.join(', ')}`);

const idsWithTasks = loader.findIDEsWithCapability('collaboration', 'taskTracking');
console.log(`IDEs with task tracking: ${idsWithTasks.join(', ')}`);

const idsWithMCP = loader.findIDEsWithCapability('external', 'mcp');
console.log(`IDEs with MCP: ${idsWithMCP.join(', ')}`);
console.log();

// ============================================================
// Example 9: Compare capability across IDEs
// ============================================================
console.log('9. COMPARE CAPABILITY ACROSS ALL IDEs\n');

const subAgentComparison = loader.compareCapability('core', 'subAgents');
console.log('Sub-agent support:');
Object.entries(subAgentComparison).forEach(([ide, supported]) => {
  console.log(`  ${ide}: ${supported ? '✅' : '❌'}`);
});
console.log();

// ============================================================
// Example 10: Design pattern - Feature detection in installer
// ============================================================
console.log('10. DESIGN PATTERN: FEATURE-BASED INSTALLATION\n');

function installForIDE(ideId) {
  console.log(`Installing for ${ideId}...\n`);

  const profile = loader.load(ideId);

  // Install commands if supported
  if (profile.paths.commands) {
    console.log(`  → Install commands to: ${profile.paths.commands}`);
  }

  // Install hooks if supported
  if (loader.hasCapability(ideId, 'lifecycle', 'hooks')) {
    console.log(`  → Install lifecycle hooks (${profile.capabilities.lifecycle.hookEvents.length} events)`);
  }

  // Install MCP if supported
  if (loader.hasCapability(ideId, 'external', 'mcp')) {
    const limit = profile.capabilities.external.mcpToolLimit;
    if (limit === 0) {
      console.log(`  → Install MCP tools (unlimited)`);
    } else {
      console.log(`  → Install MCP tools (cap: ${limit})`);
    }
  }

  // Install plan mode prompts if supported
  if (loader.hasCapability(ideId, 'planning', 'planMode')) {
    console.log(`  → Install plan mode instructions`);
  }

  console.log();
}

installForIDE('claude-code');
installForIDE('windsurf');
installForIDE('codex');

// ============================================================
// Example 11: Design pattern - Capability fallback chain
// ============================================================
console.log('11. DESIGN PATTERN: CAPABILITY FALLBACK\n');

function getInteractiveInputMethod(ideId) {
  const profile = loader.load(ideId);

  if (loader.hasCapability(ideId, 'core', 'interactiveInput')) {
    if (loader.getToolName(ideId, 'askUser') === 'AskUserQuestion') {
      return 'Structured menus (AskUserQuestion)';
    } else if (loader.getToolName(ideId, 'askUser')) {
      return `Text input (${loader.getToolName(ideId, 'askUser')})`;
    }
  }

  return 'Conversational clarification';
}

console.log('Interactive input methods by IDE:');
available.forEach(ide => {
  const method = getInteractiveInputMethod(ide);
  console.log(`  ${ide}: ${method}`);
});
console.log();

// ============================================================
// Example 12: Design pattern - Multi-IDE constraint analysis
// ============================================================
console.log('12. DESIGN PATTERN: MULTI-IDE CONSTRAINT ANALYSIS\n');

console.log('Planning a multi-IDE deployment...\n');

const allCaps = loader.loadAll();
const mpcConstraints = [];

available.forEach(ide => {
  const limit = allCaps[ide].capabilities.external.mcpToolLimit;
  if (limit > 0) {
    mpcConstraints.push({ ide, limit });
  }
});

mpcConstraints.sort((a, b) => a.limit - b.limit);

if (mpcConstraints.length > 0) {
  const minLimit = mpcConstraints[0].limit;
  console.log(`Binding constraint (most restrictive IDE): ${minLimit} MCP tools`);
  console.log(`Affected IDEs:`);
  mpcConstraints.forEach(({ ide, limit }) => {
    const marker = limit === minLimit ? '🔴 (CONSTRAINT)' : '🟢';
    console.log(`  ${marker} ${ide}: ${limit} tools`);
  });
}
console.log();

// ============================================================
// Summary
// ============================================================
console.log('='.repeat(60));
console.log('Profile System Ready for Use');
console.log('='.repeat(60));
console.log(`
Available utilities:
  loader.load(ideId)                      - Load single profile
  loader.loadAll()                        - Load all profiles
  loader.listAvailable()                  - List IDE names
  loader.isSupported(ideId)               - Check if IDE supported
  loader.hasCapability(ideId, group, cap) - Check feature support
  loader.getToolName(ideId, alias)        - Get IDE-specific tool name
  loader.getAllCapabilities(ideId)        - Get all IDE capabilities
  loader.findIDEsWithCapability(group, cap) - Find IDEs with feature
  loader.compareCapability(group, cap)    - Compare across all IDEs
  loader.clearCache()                     - Clear cached profiles
`);
