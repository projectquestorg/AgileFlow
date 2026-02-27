#!/usr/bin/env node
/**
 * skill-recommender.js
 *
 * Tech stack detector + recommendation engine for skills.
 * Reads package.json (or other project files) to detect the framework,
 * styling, testing, database, and language. Maps detected stack to
 * curated skills from skills.sh.
 *
 * Follows the signal-detectors.js pattern (detector functions returning recommendations).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getAllCuratedSkills } = require('./skill-catalog');

// =============================================================================
// Tech Stack Detection
// =============================================================================

/**
 * Detect project tech stack from package.json and project files.
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Detected stack with categories
 */
function detectTechStack(projectRoot) {
  const stack = {
    frameworks: [],
    styling: [],
    testing: [],
    databases: [],
    languages: [],
    devops: [],
    security: [],
  };

  // Read package.json
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkg = null;
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      // Ignore parse errors
    }
  }

  if (pkg) {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Framework detection
    if (allDeps.next) stack.frameworks.push('next', 'react');
    else if (allDeps.react) stack.frameworks.push('react');
    if (allDeps.vue || allDeps['vue-router']) stack.frameworks.push('vue');
    if (allDeps.svelte || allDeps['@sveltejs/kit']) stack.frameworks.push('svelte', 'sveltekit');
    if (allDeps['@angular/core']) stack.frameworks.push('angular');
    if (allDeps.express) stack.frameworks.push('express', 'node');
    if (allDeps.fastify) stack.frameworks.push('fastify', 'node');
    if (allDeps.hono) stack.frameworks.push('hono', 'node');
    if (allDeps['react-native'] || allDeps.expo) stack.frameworks.push('react-native', 'mobile');
    if (allDeps.nuxt) stack.frameworks.push('nuxt', 'vue');
    if (allDeps.astro) stack.frameworks.push('astro');
    if (allDeps.remix || allDeps['@remix-run/react']) stack.frameworks.push('remix', 'react');

    // Styling detection
    if (allDeps.tailwindcss) stack.styling.push('tailwind', 'tailwindcss');
    if (allDeps['styled-components']) stack.styling.push('styled-components');
    if (allDeps['@emotion/react']) stack.styling.push('emotion');
    if (allDeps.sass) stack.styling.push('sass');

    // Testing detection
    if (allDeps.jest) stack.testing.push('jest');
    if (allDeps.vitest) stack.testing.push('vitest', 'vite');
    if (allDeps.playwright || allDeps['@playwright/test']) stack.testing.push('playwright', 'e2e');
    if (allDeps.cypress) stack.testing.push('cypress', 'e2e');
    if (allDeps.mocha) stack.testing.push('mocha');

    // Database detection
    if (allDeps.prisma || allDeps['@prisma/client']) stack.databases.push('prisma', 'orm');
    if (allDeps['@supabase/supabase-js']) stack.databases.push('supabase', 'postgres');
    if (allDeps.mongoose || allDeps.mongodb) stack.databases.push('mongodb', 'nosql');
    if (allDeps.pg || allDeps.postgres) stack.databases.push('postgresql', 'postgres');
    if (allDeps.redis || allDeps.ioredis) stack.databases.push('redis', 'cache');
    if (allDeps.drizzle || allDeps['drizzle-orm']) stack.databases.push('drizzle', 'orm');
    if (allDeps.knex) stack.databases.push('knex', 'sql');
    if (allDeps.sequelize) stack.databases.push('sequelize', 'orm');
    if (allDeps.typeorm) stack.databases.push('typeorm', 'orm');

    // Language detection
    if (allDeps.typescript) stack.languages.push('typescript', 'ts');
    if (allDeps['@apollo/server'] || allDeps['@apollo/client'] || allDeps.graphql) {
      stack.frameworks.push('graphql', 'apollo');
    }

    // DevOps detection
    if (allDeps.docker || fs.existsSync(path.join(projectRoot, 'Dockerfile'))) {
      stack.devops.push('docker', 'containers');
    }
    if (fs.existsSync(path.join(projectRoot, '.github', 'workflows'))) {
      stack.devops.push('github-actions', 'ci');
    }
    if (allDeps['socket.io'] || allDeps.ws) stack.frameworks.push('websocket', 'real-time');
  }

  // Python detection
  const pyFiles = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];
  for (const f of pyFiles) {
    if (fs.existsSync(path.join(projectRoot, f))) {
      stack.languages.push('python');

      // Check for specific Python frameworks
      try {
        const content = fs.readFileSync(path.join(projectRoot, f), 'utf8');
        if (content.includes('fastapi')) stack.frameworks.push('fastapi', 'python');
        if (content.includes('django')) stack.frameworks.push('django', 'python');
        if (content.includes('flask')) stack.frameworks.push('flask', 'python');
        if (content.includes('pytest')) stack.testing.push('pytest');
        if (content.includes('pydantic')) stack.frameworks.push('pydantic');
      } catch {
        // Ignore read errors
      }
      break;
    }
  }

  // Go detection
  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    stack.languages.push('go', 'golang');
    stack.frameworks.push('go-backend');
  }

  // PHP detection
  if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
    stack.languages.push('php');
  }

  // Docker/K8s detection
  if (fs.existsSync(path.join(projectRoot, 'Dockerfile'))) {
    stack.devops.push('docker');
  }
  if (
    fs.existsSync(path.join(projectRoot, 'k8s')) ||
    fs.existsSync(path.join(projectRoot, 'kubernetes'))
  ) {
    stack.devops.push('kubernetes', 'k8s');
  }
  if (
    fs.existsSync(path.join(projectRoot, 'terraform')) ||
    fs.existsSync(path.join(projectRoot, 'main.tf'))
  ) {
    stack.devops.push('terraform', 'iac');
  }
  if (fs.existsSync(path.join(projectRoot, 'vercel.json'))) {
    stack.devops.push('vercel', 'deployment');
  }

  // Deduplicate all arrays
  for (const key of Object.keys(stack)) {
    stack[key] = [...new Set(stack[key])];
  }

  return stack;
}

// =============================================================================
// Recommendation Engine
// =============================================================================

/**
 * Score a skill against detected tech stack.
 * @param {Object} skill - Curated skill entry
 * @param {Object} stack - Detected tech stack
 * @returns {number} Relevance score (0-100)
 */
function scoreSkill(skill, stack) {
  const allTags = [
    ...stack.frameworks,
    ...stack.styling,
    ...stack.testing,
    ...stack.databases,
    ...stack.languages,
    ...stack.devops,
    ...stack.security,
  ];

  if (allTags.length === 0) return 0;

  let matchCount = 0;
  for (const tag of skill.tags) {
    if (allTags.includes(tag)) {
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  // Score: percentage of skill tags that match, weighted by total matches
  const tagCoverage = matchCount / skill.tags.length;
  return Math.round(tagCoverage * 100);
}

/**
 * Get skill recommendations based on detected tech stack.
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options] - Options
 * @param {string[]} [options.installedSkills] - Names of already-installed skills to filter out
 * @param {number} [options.minScore] - Minimum relevance score (default: 20)
 * @param {number} [options.maxResults] - Maximum results per category (default: 5)
 * @returns {Object} Recommendations with stack info and ranked skills
 */
function getRecommendations(projectRoot, options = {}) {
  const { installedSkills = [], minScore = 20, maxResults = 5 } = options;

  const stack = detectTechStack(projectRoot);
  const allSkills = getAllCuratedSkills();
  const installedSet = new Set(installedSkills.map(n => n.toLowerCase()));

  // Score all skills
  const scored = allSkills
    .map(skill => ({
      ...skill,
      score: scoreSkill(skill, stack),
      installed: installedSet.has(skill.name.toLowerCase()),
    }))
    .filter(s => s.score >= minScore && !s.installed)
    .sort((a, b) => b.score - a.score);

  // Group by category with limits
  const byCategory = {};
  for (const skill of scored) {
    if (!byCategory[skill.category]) {
      byCategory[skill.category] = [];
    }
    if (byCategory[skill.category].length < maxResults) {
      byCategory[skill.category].push(skill);
    }
  }

  return {
    stack,
    recommendations: byCategory,
    totalMatches: scored.length,
  };
}

/**
 * Format recommendations as a display string.
 * @param {Object} result - Result from getRecommendations
 * @returns {string} Formatted display text
 */
function formatRecommendations(result) {
  const { stack, recommendations, totalMatches } = result;

  const lines = [];

  // Show detected stack
  const detected = [];
  if (stack.frameworks.length) detected.push(`Frameworks: ${stack.frameworks.join(', ')}`);
  if (stack.languages.length) detected.push(`Languages: ${stack.languages.join(', ')}`);
  if (stack.databases.length) detected.push(`Databases: ${stack.databases.join(', ')}`);
  if (stack.testing.length) detected.push(`Testing: ${stack.testing.join(', ')}`);
  if (stack.styling.length) detected.push(`Styling: ${stack.styling.join(', ')}`);
  if (stack.devops.length) detected.push(`DevOps: ${stack.devops.join(', ')}`);

  if (detected.length > 0) {
    lines.push('**Detected Tech Stack:**');
    for (const d of detected) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  // Show recommendations by category
  const categories = Object.keys(recommendations);
  if (categories.length === 0) {
    lines.push('No matching skills found for your tech stack.');
    lines.push('Browse the full marketplace: `npx skills find`');
    return lines.join('\n');
  }

  lines.push(`**Recommended Skills (${totalMatches} matches):**`);
  lines.push('');

  for (const category of categories) {
    const skills = recommendations[category];
    lines.push(`### ${category}`);
    lines.push('');
    for (const s of skills) {
      lines.push(`- **${s.name}** (${s.score}% match) - ${s.description}`);
      lines.push(`  Install: \`${s.installCmd}\``);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Browse more: `npx skills find`');

  return lines.join('\n');
}

module.exports = {
  detectTechStack,
  scoreSkill,
  getRecommendations,
  formatRecommendations,
};
