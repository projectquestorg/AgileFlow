#!/usr/bin/env node
/**
 * skill-catalog.js
 *
 * Two-tier skill discovery for AgileFlow:
 *
 * Tier 1: Curated picks (~60 vetted skills shipped with AgileFlow)
 *   - Organized by category (Frontend, Backend, Database, Testing, DevOps, Security)
 *   - Each entry has name, repo, description, tags, category, installCmd
 *
 * Tier 2: Live search from skills.sh via `npx skills search <keyword>`
 *   - Users always see curated picks first, then "Browse more on skills.sh"
 */

'use strict';

// =============================================================================
// Curated Skill Catalog
// =============================================================================

/**
 * Create a curated skill entry.
 * @param {string} name - Skill display name
 * @param {string} repo - GitHub owner/repo or registry identifier
 * @param {string} description - Short description
 * @param {string[]} tags - Technology tags for matching
 * @param {string} category - Category grouping
 * @returns {Object} Curated skill entry
 */
function skill(name, repo, description, tags, category) {
  return {
    name,
    repo,
    description,
    tags,
    category,
    installCmd: `npx skills add ${repo}`,
  };
}

/**
 * Full curated catalog of vetted skills.
 * Organized by category for display and filtered by tags for recommendations.
 */
const CURATED_SKILLS = [
  // ===== Frontend (13) =====
  skill(
    'react-best-practices',
    'vercel/agent-skills',
    'React patterns, hooks, and component architecture',
    ['react', 'jsx', 'hooks'],
    'Frontend'
  ),
  skill(
    'next-best-practices',
    'vercel/next-skills',
    'Next.js App Router, RSC, and data fetching patterns',
    ['next', 'nextjs', 'react', 'app-router'],
    'Frontend'
  ),
  skill(
    'web-design-guidelines',
    'vercel/agent-skills',
    'Web design principles and responsive layouts',
    ['design', 'css', 'responsive'],
    'Frontend'
  ),
  skill(
    'frontend-design',
    'anthropics/skills',
    'Frontend design system and component patterns',
    ['frontend', 'design-system', 'components'],
    'Frontend'
  ),
  skill(
    'web-artifacts-builder',
    'anthropics/skills',
    'Build interactive web artifacts and prototypes',
    ['html', 'css', 'javascript', 'prototype'],
    'Frontend'
  ),
  skill(
    'svelte5-sveltekit',
    'claude-skills/sveltekit-svelte5-tailwind-skill',
    'Svelte 5 runes, SvelteKit routing, and Tailwind integration',
    ['svelte', 'sveltekit', 'tailwind'],
    'Frontend'
  ),
  skill(
    'vue-development',
    'alexanderop/claude-skill-vue-development',
    'Vue 3 Composition API and ecosystem patterns',
    ['vue', 'vuejs', 'vue3', 'pinia'],
    'Frontend'
  ),
  skill(
    'typescript-pro',
    'anthropics/skills',
    'Advanced TypeScript patterns, generics, and type utilities',
    ['typescript', 'ts'],
    'Frontend'
  ),
  skill(
    'tailwind-mastery',
    'anthropics/skills',
    'Tailwind CSS utility patterns and custom configurations',
    ['tailwind', 'tailwindcss', 'css'],
    'Frontend'
  ),
  skill(
    'angular-best-practices',
    'anthropics/skills',
    'Angular signals, standalone components, and RxJS patterns',
    ['angular', 'rxjs'],
    'Frontend'
  ),
  skill(
    'component-library',
    'anthropics/skills',
    'Building reusable component libraries with design tokens',
    ['components', 'design-tokens', 'storybook'],
    'Frontend'
  ),
  skill(
    'react-native-guidelines',
    'anthropics/skills',
    'React Native mobile development patterns',
    ['react-native', 'mobile', 'expo'],
    'Frontend'
  ),
  skill(
    'composition-patterns',
    'anthropics/skills',
    'Composition over inheritance in frontend architectures',
    ['composition', 'patterns', 'architecture'],
    'Frontend'
  ),

  // ===== Backend (11) =====
  skill(
    'graphql-api-dev',
    'anthropics/skills',
    'GraphQL schema design, resolvers, and federation',
    ['graphql', 'apollo', 'api'],
    'Backend'
  ),
  skill(
    'apollo-skills',
    'apollographql/skills',
    'Apollo GraphQL server and client best practices',
    ['apollo', 'graphql'],
    'Backend'
  ),
  skill(
    'backend-patterns',
    'affaan-m/everything-claude-code',
    'Comprehensive backend architecture patterns',
    ['backend', 'api', 'architecture'],
    'Backend'
  ),
  skill(
    'express-best-practices',
    'anthropics/skills',
    'Express.js middleware, routing, and error handling',
    ['express', 'expressjs', 'node'],
    'Backend'
  ),
  skill(
    'fastapi-pydantic',
    'anthropics/skills',
    'FastAPI with Pydantic models and dependency injection',
    ['fastapi', 'python', 'pydantic'],
    'Backend'
  ),
  skill(
    'nodejs-patterns',
    'Jeffallan/claude-skills',
    'Node.js patterns for scalable applications',
    ['node', 'nodejs', 'javascript'],
    'Backend'
  ),
  skill(
    'python-backend',
    'greyhaven-ai/claude-code-config',
    'Python backend development with best practices',
    ['python', 'django', 'flask'],
    'Backend'
  ),
  skill(
    'microservices-arch',
    'anthropics/skills',
    'Microservices architecture and communication patterns',
    ['microservices', 'distributed', 'event-driven'],
    'Backend'
  ),
  skill(
    'websocket-patterns',
    'anthropics/skills',
    'WebSocket real-time communication patterns',
    ['websocket', 'ws', 'socket.io', 'real-time'],
    'Backend'
  ),
  skill(
    'api-design-mastery',
    'anthropics/skills',
    'REST API design, versioning, and documentation',
    ['rest', 'api', 'openapi'],
    'Backend'
  ),
  skill(
    'go-backend',
    'anthropics/skills',
    'Go backend patterns with net/http and standard library',
    ['go', 'golang'],
    'Backend'
  ),

  // ===== Database (8) =====
  skill(
    'prisma-orm',
    'mcpmarket/skills',
    'Prisma schema design, migrations, and query patterns',
    ['prisma', 'orm', 'database'],
    'Database'
  ),
  skill(
    'supabase-ops',
    'supabase/agent-skills',
    'Supabase database, auth, storage, and edge functions',
    ['supabase', 'postgres', 'auth'],
    'Database'
  ),
  skill(
    'mongodb-patterns',
    'anthropics/skills',
    'MongoDB schema design, aggregation, and indexing',
    ['mongodb', 'mongoose', 'nosql'],
    'Database'
  ),
  skill(
    'postgresql-advanced',
    'anthropics/skills',
    'PostgreSQL advanced queries, indexing, and performance',
    ['postgresql', 'postgres', 'pg', 'sql'],
    'Database'
  ),
  skill(
    'redis-patterns',
    'anthropics/skills',
    'Redis caching, pub/sub, and data structure patterns',
    ['redis', 'cache', 'pub-sub'],
    'Database'
  ),
  skill(
    'db-migrations',
    'anthropics/skills',
    'Database migration strategies and zero-downtime changes',
    ['migrations', 'database', 'schema'],
    'Database'
  ),
  skill(
    'drizzle-orm',
    'anthropics/skills',
    'Drizzle ORM schema definition and type-safe queries',
    ['drizzle', 'orm', 'typescript'],
    'Database'
  ),
  skill(
    'data-pipelines',
    'K-Dense-AI/claude-scientific-skills',
    'Data pipeline design and ETL patterns',
    ['data', 'pipeline', 'etl'],
    'Database'
  ),

  // ===== Testing (10) =====
  skill(
    'tdd-enforcement',
    'jmagly/claude-skills',
    'Test-driven development workflow and patterns',
    ['tdd', 'testing', 'test-first'],
    'Testing'
  ),
  skill(
    'python-testing',
    'laurigates/claude-plugins',
    'Python testing with pytest, fixtures, and mocks',
    ['pytest', 'python', 'testing'],
    'Testing'
  ),
  skill(
    'playwright-automation',
    'anthropics/skills',
    'Playwright end-to-end testing and browser automation',
    ['playwright', 'e2e', 'testing'],
    'Testing'
  ),
  skill(
    'jest-testing',
    'anthropics/skills',
    'Jest unit and integration testing patterns',
    ['jest', 'testing', 'javascript'],
    'Testing'
  ),
  skill(
    'k6-load-testing',
    'anthropics/skills',
    'k6 performance and load testing scripts',
    ['k6', 'load-testing', 'performance'],
    'Testing'
  ),
  skill(
    'cypress-e2e',
    'anthropics/skills',
    'Cypress end-to-end testing with component tests',
    ['cypress', 'e2e', 'testing'],
    'Testing'
  ),
  skill(
    'accessibility-testing',
    'anthropics/skills',
    'Automated accessibility testing with axe and WAVE',
    ['a11y', 'accessibility', 'wcag'],
    'Testing'
  ),
  skill(
    'unit-test-patterns',
    'anthropics/skills',
    'Unit testing patterns, mocking, and test organization',
    ['unit-test', 'testing', 'mocking'],
    'Testing'
  ),
  skill(
    'integration-testing',
    'anthropics/skills',
    'Integration testing strategies for APIs and databases',
    ['integration', 'testing', 'api-testing'],
    'Testing'
  ),
  skill(
    'vitest-framework',
    'anthropics/skills',
    'Vitest fast unit testing with Vite integration',
    ['vitest', 'vite', 'testing'],
    'Testing'
  ),

  // ===== DevOps (9) =====
  skill(
    'devops-engineer',
    'Jeffallan/claude-skills',
    'DevOps best practices and infrastructure patterns',
    ['devops', 'infrastructure', 'ci-cd'],
    'DevOps'
  ),
  skill(
    'devops-cloudskills',
    'ahmedasmar/devops-claude-skills',
    'Cloud-native DevOps with AWS, GCP, and Azure',
    ['aws', 'gcp', 'azure', 'cloud'],
    'DevOps'
  ),
  skill(
    'github-actions',
    'anthropics/skills',
    'GitHub Actions workflow design and optimization',
    ['github-actions', 'ci', 'automation'],
    'DevOps'
  ),
  skill(
    'dockerfile-best-practices',
    'anthropics/skills',
    'Dockerfile optimization, multi-stage builds, and security',
    ['docker', 'dockerfile', 'containers'],
    'DevOps'
  ),
  skill(
    'kubernetes-troubleshooting',
    'anthropics/skills',
    'Kubernetes debugging, scaling, and resource management',
    ['kubernetes', 'k8s', 'helm'],
    'DevOps'
  ),
  skill(
    'terraform-iac',
    'anthropics/skills',
    'Terraform infrastructure as code patterns',
    ['terraform', 'iac', 'infrastructure'],
    'DevOps'
  ),
  skill(
    'vercel-deploy',
    'vercel/agent-skills',
    'Vercel deployment, edge functions, and configuration',
    ['vercel', 'deployment', 'edge'],
    'DevOps'
  ),
  skill(
    'nginx-config',
    'anthropics/skills',
    'Nginx reverse proxy, load balancing, and TLS setup',
    ['nginx', 'reverse-proxy', 'tls'],
    'DevOps'
  ),
  skill(
    'monitoring-observability',
    'anthropics/skills',
    'Application monitoring with Prometheus, Grafana, and OpenTelemetry',
    ['monitoring', 'prometheus', 'grafana'],
    'DevOps'
  ),

  // ===== Security (8) =====
  skill(
    'owasp-2025',
    'agamm/claude-code-owasp',
    'OWASP Top 10 2025 security checks and prevention',
    ['owasp', 'security', 'vulnerabilities'],
    'Security'
  ),
  skill(
    'security-code-review',
    'harperaa/secure-claude-skills',
    'Security-focused code review patterns',
    ['security', 'code-review', 'audit'],
    'Security'
  ),
  skill(
    'trail-of-bits',
    'trailofbits/agent-skills',
    'Trail of Bits security analysis patterns',
    ['security', 'audit', 'vulnerabilities'],
    'Security'
  ),
  skill(
    'input-validation',
    'anthropics/skills',
    'Input validation and sanitization patterns',
    ['validation', 'sanitization', 'security'],
    'Security'
  ),
  skill(
    'auth-patterns',
    'anthropics/skills',
    'Authentication with JWT, OAuth, and session management',
    ['auth', 'jwt', 'oauth', 'session'],
    'Security'
  ),
  skill(
    'authz-rbac',
    'anthropics/skills',
    'Authorization with RBAC, ABAC, and policy engines',
    ['rbac', 'authorization', 'permissions'],
    'Security'
  ),
  skill(
    'security-headers',
    'anthropics/skills',
    'HTTP security headers and CSP configuration',
    ['security-headers', 'csp', 'cors'],
    'Security'
  ),
  skill(
    'php-security-audit',
    'anthropics/skills',
    'PHP security audit for common vulnerabilities',
    ['php', 'security', 'audit'],
    'Security'
  ),
];

// =============================================================================
// Catalog Query Functions
// =============================================================================

/**
 * Get all curated skills.
 * @returns {Object[]} Full curated catalog
 */
function getAllCuratedSkills() {
  return CURATED_SKILLS;
}

/**
 * Get curated skills by category.
 * @param {string} category - Category name
 * @returns {Object[]} Skills in that category
 */
function getByCategory(category) {
  return CURATED_SKILLS.filter(s => s.category === category);
}

/**
 * Get all category names with counts.
 * @returns {Object} Map of category name to count
 */
function getCategoryCounts() {
  const counts = {};
  for (const s of CURATED_SKILLS) {
    counts[s.category] = (counts[s.category] || 0) + 1;
  }
  return counts;
}

/**
 * Search curated skills by tag.
 * @param {string} tag - Tag to search for
 * @returns {Object[]} Matching skills
 */
function searchByTag(tag) {
  const lower = tag.toLowerCase();
  return CURATED_SKILLS.filter(s => s.tags.some(t => t.includes(lower)));
}

/**
 * Search curated skills by keyword (searches name + description + tags).
 * @param {string} keyword - Keyword to search for
 * @returns {Object[]} Matching skills sorted by relevance
 */
function searchByKeyword(keyword) {
  const lower = keyword.toLowerCase();
  return CURATED_SKILLS.filter(s => {
    return (
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.tags.some(t => t.includes(lower))
    );
  });
}

/**
 * Get the live search command for skills.sh marketplace.
 * @param {string} keyword - Search term
 * @returns {string} Command to run
 */
function getLiveSearchCommand(keyword) {
  return `npx skills search ${keyword}`;
}

/**
 * Get the full marketplace browse command.
 * @returns {string} Command to run
 */
function getBrowseCommand() {
  return 'npx skills find';
}

module.exports = {
  CURATED_SKILLS,
  getAllCuratedSkills,
  getByCategory,
  getCategoryCounts,
  searchByTag,
  searchByKeyword,
  getLiveSearchCommand,
  getBrowseCommand,
};
