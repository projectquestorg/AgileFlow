#!/usr/bin/env node
/**
 * Security Validator
 *
 * Validates files for security issues, secrets, and vulnerabilities.
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
 *             command: "node .agileflow/hooks/validators/security-validator.js"
 */

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.tool_input?.file_path;

    if (!filePath) {
      process.exit(0);
    }

    // Skip if file doesn't exist
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath} (skipping validation)`);
      process.exit(0);
    }

    // Skip binary files
    if (isBinaryFile(filePath)) {
      process.exit(0);
    }

    const issues = validateSecurity(filePath);

    if (issues.length > 0) {
      console.error(`Security issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Claude will fix
    }

    console.log(`Security validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1);
  }
});

function isBinaryFile(filePath) {
  const binaryExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
  ];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

function validateSecurity(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    // Check for secrets and credentials
    issues.push(...checkSecrets(content, fileName));

    // Check for SQL injection vulnerabilities
    issues.push(...checkSqlInjection(content, ext));

    // Check for XSS vulnerabilities
    issues.push(...checkXss(content, ext));

    // Check for command injection
    issues.push(...checkCommandInjection(content, ext));

    // Check for path traversal
    issues.push(...checkPathTraversal(content, ext));

    // Check for insecure crypto
    issues.push(...checkInsecureCrypto(content));

    // Check for insecure randomness
    issues.push(...checkInsecureRandom(content));
  } catch (e) {
    issues.push(`Read error: ${e.message}`);
  }

  return issues;
}

function checkSecrets(content, fileName) {
  const issues = [];

  // Skip .env.example files
  if (fileName === '.env.example' || fileName === '.env.sample') {
    return issues;
  }

  const secretPatterns = [
    // API Keys
    { pattern: /['"]sk-[a-zA-Z0-9]{20,}['"]/, message: 'Possible OpenAI API key detected' },
    { pattern: /['"]AIza[a-zA-Z0-9_-]{35}['"]/, message: 'Possible Google API key detected' },
    { pattern: /['"]AKIA[A-Z0-9]{16}['"]/, message: 'Possible AWS access key detected' },
    {
      pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/,
      message: 'Possible GitHub personal access token detected',
    },
    { pattern: /['"]npm_[a-zA-Z0-9]{36}['"]/, message: 'Possible npm token detected' },

    // Generic patterns
    {
      pattern: /password\s*[:=]\s*['"][^'"${\s]{8,}['"](?!\s*;?\s*\/\/\s*example)/i,
      message: 'Possible hardcoded password detected',
    },
    {
      pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
      message: 'Possible hardcoded API key detected',
    },
    {
      pattern: /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
      message: 'Possible hardcoded secret detected',
    },
    {
      pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
      message: 'Private key detected in source code',
    },
    {
      pattern: /-----BEGIN\s+CERTIFICATE-----/,
      message: 'Certificate detected in source code (verify this is intentional)',
    },
  ];

  for (const { pattern, message } of secretPatterns) {
    if (pattern.test(content)) {
      issues.push(`${message} - use environment variables or secrets manager`);
    }
  }

  return issues;
}

function checkSqlInjection(content, ext) {
  const issues = [];

  // Only check relevant file types
  if (!['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.go', '.rb'].includes(ext)) {
    return issues;
  }

  // Check for string concatenation in SQL
  const sqlInjectionPatterns = [
    {
      pattern: /['"`]\s*SELECT\s+.*\+\s*\w+/i,
      message: 'Possible SQL injection: string concatenation in SELECT query',
    },
    {
      pattern: /['"`]\s*INSERT\s+.*\+\s*\w+/i,
      message: 'Possible SQL injection: string concatenation in INSERT query',
    },
    {
      pattern: /['"`]\s*UPDATE\s+.*\+\s*\w+/i,
      message: 'Possible SQL injection: string concatenation in UPDATE query',
    },
    {
      pattern: /['"`]\s*DELETE\s+.*\+\s*\w+/i,
      message: 'Possible SQL injection: string concatenation in DELETE query',
    },
    {
      pattern: /\$\{[^}]+\}.*WHERE/i,
      message:
        'Possible SQL injection: template literal in WHERE clause - use parameterized queries',
    },
  ];

  for (const { pattern, message } of sqlInjectionPatterns) {
    if (pattern.test(content)) {
      issues.push(message);
    }
  }

  return issues;
}

function checkXss(content, ext) {
  const issues = [];

  // Only check relevant file types
  if (!['.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.html'].includes(ext)) {
    return issues;
  }

  const xssPatterns = [
    {
      pattern: /innerHTML\s*=\s*[^'"`]/,
      message: 'Direct innerHTML assignment detected - sanitize content or use textContent',
    },
    {
      pattern: /dangerouslySetInnerHTML/,
      message: 'dangerouslySetInnerHTML used - ensure content is sanitized',
    },
    {
      pattern: /document\.write\s*\(/,
      message: 'document.write() is dangerous - use DOM manipulation instead',
    },
    { pattern: /v-html\s*=/, message: 'v-html directive detected - ensure content is sanitized' },
    {
      pattern: /\{@html\s+/,
      message: 'Svelte @html directive detected - ensure content is sanitized',
    },
  ];

  for (const { pattern, message } of xssPatterns) {
    if (pattern.test(content)) {
      // These are warnings, not blocking errors (they're sometimes necessary)
      console.log(`Warning: ${message}`);
    }
  }

  return issues;
}

function checkCommandInjection(content, ext) {
  const issues = [];

  // Only check relevant file types
  if (!['.js', '.ts', '.py', '.php', '.rb', '.sh'].includes(ext)) {
    return issues;
  }

  const cmdInjectionPatterns = [
    // JavaScript/Node
    {
      pattern: /exec\s*\(\s*[`'"]\s*\$\{/,
      message: 'Possible command injection: template literal in exec()',
    },
    {
      pattern: /exec\s*\(\s*\w+\s*\+/,
      message: 'Possible command injection: string concatenation in exec()',
    },
    {
      pattern: /execSync\s*\(\s*[`'"]\s*\$\{/,
      message: 'Possible command injection: template literal in execSync()',
    },
    {
      pattern: /spawn\s*\(\s*[`'"]\s*\$\{/,
      message: 'Possible command injection: template literal in spawn()',
    },

    // Python
    {
      pattern: /os\.system\s*\(\s*f['"]/,
      message: 'Possible command injection: f-string in os.system()',
    },
    {
      pattern: /subprocess\.(call|run|Popen)\s*\(\s*f['"]/,
      message: 'Possible command injection: f-string in subprocess - use list args instead',
    },
  ];

  for (const { pattern, message } of cmdInjectionPatterns) {
    if (pattern.test(content)) {
      issues.push(message);
    }
  }

  return issues;
}

function checkPathTraversal(content, ext) {
  const issues = [];

  // Only check relevant file types
  if (!['.js', '.ts', '.py', '.php', '.java', '.go', '.rb'].includes(ext)) {
    return issues;
  }

  const pathTraversalPatterns = [
    {
      pattern: /path\.join\s*\([^)]*req\.(params|query|body)/,
      message: 'Possible path traversal: user input in path.join()',
    },
    {
      pattern: /readFile(Sync)?\s*\([^)]*req\.(params|query|body)/,
      message: 'Possible path traversal: user input in file read',
    },
    {
      pattern: /open\s*\(\s*f['"].*\{.*\}/,
      message: 'Possible path traversal: user input in file open (Python)',
    },
  ];

  for (const { pattern, message } of pathTraversalPatterns) {
    if (pattern.test(content)) {
      issues.push(message);
    }
  }

  return issues;
}

function checkInsecureCrypto(content) {
  const issues = [];

  const insecureCryptoPatterns = [
    {
      pattern: /createHash\s*\(\s*['"]md5['"]\s*\)/,
      message: 'MD5 is insecure for cryptographic use - use SHA-256 or better',
    },
    {
      pattern: /createHash\s*\(\s*['"]sha1['"]\s*\)/,
      message: 'SHA-1 is deprecated - use SHA-256 or better',
    },
    {
      pattern: /hashlib\.md5\s*\(/,
      message: 'MD5 is insecure for cryptographic use - use SHA-256 or better',
    },
    {
      pattern: /DES|3DES|RC4/,
      message: 'Insecure encryption algorithm detected - use AES-256-GCM',
    },
    { pattern: /ECB/, message: 'ECB mode is insecure - use GCM or CBC with proper IV' },
  ];

  for (const { pattern, message } of insecureCryptoPatterns) {
    if (pattern.test(content)) {
      issues.push(message);
    }
  }

  return issues;
}

function checkInsecureRandom(content) {
  const issues = [];

  const insecureRandomPatterns = [
    {
      pattern: /Math\.random\s*\(\s*\).*(?:token|key|secret|password|auth|session)/i,
      message: 'Math.random() used for security-sensitive value - use crypto.randomBytes()',
    },
    {
      pattern: /random\.random\s*\(\s*\).*(?:token|key|secret|password|auth|session)/i,
      message: 'random.random() is not cryptographically secure - use secrets module',
    },
  ];

  for (const { pattern, message } of insecureRandomPatterns) {
    if (pattern.test(content)) {
      issues.push(message);
    }
  }

  return issues;
}
