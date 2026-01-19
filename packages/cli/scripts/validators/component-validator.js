#!/usr/bin/env node
/**
 * Component Validator
 *
 * Validates React/Vue/Svelte component files for common issues.
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
 *             command: "node .agileflow/hooks/validators/component-validator.js"
 */

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    // Only validate component files
    if (!filePath || !isComponentFile(filePath)) {
      process.exit(0);
    }

    // Skip if file doesn't exist
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath} (skipping validation)`);
      process.exit(0);
    }

    const issues = validateComponent(filePath);

    if (issues.length > 0) {
      console.error(`Fix these component issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Component validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function isComponentFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const componentExtensions = ['.jsx', '.tsx', '.vue', '.svelte'];

  // Also check for .js/.ts files in component directories
  if (['.js', '.ts'].includes(ext)) {
    const normalizedPath = filePath.toLowerCase();
    return normalizedPath.includes('/components/') ||
           normalizedPath.includes('/pages/') ||
           normalizedPath.includes('/views/');
  }

  return componentExtensions.includes(ext);
}

function validateComponent(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath, ext);

    // Check for empty component
    if (!content.trim()) {
      issues.push('Component file is empty');
      return issues;
    }

    // React/JSX/TSX validation
    if (['.jsx', '.tsx'].includes(ext) || content.includes('React')) {
      issues.push(...validateReactComponent(content, fileName));
    }

    // Vue validation
    if (ext === '.vue') {
      issues.push(...validateVueComponent(content));
    }

    // Svelte validation
    if (ext === '.svelte') {
      issues.push(...validateSvelteComponent(content));
    }

    // General accessibility checks
    issues.push(...validateAccessibility(content));

  } catch (e) {
    issues.push(`Read error: ${e.message}`);
  }

  return issues;
}

function validateReactComponent(content, fileName) {
  const issues = [];

  // Check for component export
  if (!content.includes('export default') && !content.includes('export function') && !content.includes('export const')) {
    issues.push('Component should have an export (export default, export function, or export const)');
  }

  // Check for React import in JSX files
  if (content.includes('React.') && !content.includes("from 'react'") && !content.includes('from "react"')) {
    issues.push('Using React. prefix but React is not imported');
  }

  // Check for proper function/component naming (should match filename for default exports)
  const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;
  if (!pascalCaseRegex.test(fileName) && !fileName.startsWith('use')) {
    // Only warn, don't block - could be a utility file
    console.log(`Note: Component filename "${fileName}" should be PascalCase`);
  }

  // Check for inline styles (prefer CSS modules or styled-components)
  const inlineStyleCount = (content.match(/style=\{\{/g) || []).length;
  if (inlineStyleCount > 5) {
    issues.push(`Too many inline styles (${inlineStyleCount}) - consider using CSS modules or styled-components`);
  }

  // Check for console.log in production code
  if (content.includes('console.log') && !content.includes('// debug') && !content.includes('// DEBUG')) {
    console.log('Note: console.log found - ensure it\'s removed before production');
  }

  // Check for missing key prop in map
  if (content.includes('.map(') && content.includes('<') && !content.includes('key=')) {
    issues.push('Array .map() rendering elements should include key prop');
  }

  return issues;
}

function validateVueComponent(content) {
  const issues = [];

  // Check for required template section
  if (!content.includes('<template>') && !content.includes('<template ')) {
    issues.push('Vue component must have a <template> section');
  }

  // Check for script section
  if (!content.includes('<script') && !content.includes('<script>')) {
    // Not strictly required but recommended
    console.log('Note: Vue component has no <script> section');
  }

  // Check for scoped styles (recommended)
  if (content.includes('<style>') && !content.includes('<style scoped') && !content.includes('scoped>')) {
    console.log('Note: Consider using scoped styles to prevent CSS leaks');
  }

  return issues;
}

function validateSvelteComponent(content) {
  const issues = [];

  // Check for script section
  if (!content.includes('<script') && !content.includes('<script>')) {
    console.log('Note: Svelte component has no <script> section');
  }

  return issues;
}

function validateAccessibility(content) {
  const issues = [];

  // Check for images without alt
  const imgWithoutAlt = content.match(/<img[^>]*(?!alt=)[^>]*>/gi) || [];
  const imgWithEmptyAlt = content.match(/<img[^>]*alt=["']["'][^>]*>/gi) || [];

  if (imgWithoutAlt.length > 0) {
    issues.push(`Found ${imgWithoutAlt.length} <img> tag(s) without alt attribute`);
  }

  // Check for button without type
  if (content.includes('<button') && !content.includes('type=')) {
    console.log('Note: <button> elements should have explicit type attribute');
  }

  // Check for click handlers on non-interactive elements
  const clickOnDiv = content.match(/onClick[^>]*>[^<]*<\/div>/gi) || [];
  if (clickOnDiv.length > 0) {
    issues.push('onClick on <div> detected - use <button> for interactive elements (accessibility)');
  }

  // Check for form inputs without labels
  if (content.includes('<input') && !content.includes('<label') && !content.includes('aria-label')) {
    console.log('Note: <input> elements should have associated <label> or aria-label');
  }

  return issues;
}
