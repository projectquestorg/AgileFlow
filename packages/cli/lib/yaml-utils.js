/**
 * Centralized YAML parsing utilities with security guarantees.
 *
 * Security Note (js-yaml v4.x):
 * - yaml.load() is SAFE by default in v4+ (unlike v3.x)
 * - Dangerous JavaScript types (functions, regexps) are NOT supported
 * - Only JSON-compatible types are parsed
 * - See: https://github.com/nodeca/js-yaml/blob/master/migrate_v3_to_v4.md
 *
 * This wrapper provides:
 * - Explicit security documentation
 * - Input validation
 * - Consistent error handling
 * - Future-proofing for library changes
 */

const yaml = require('js-yaml');

/**
 * Safely parse YAML content. Uses js-yaml's DEFAULT_SCHEMA which is
 * safe by default in v4+ (does not execute arbitrary JavaScript).
 *
 * @param {string} content - YAML string to parse
 * @param {Object} options - Optional yaml.load options
 * @returns {any} Parsed YAML content (object, array, or primitive)
 * @throws {yaml.YAMLException} If YAML is malformed
 */
function safeLoad(content, options = {}) {
  if (typeof content !== 'string') {
    throw new TypeError('YAML content must be a string');
  }

  // In js-yaml v4+, load() uses DEFAULT_SCHEMA which is safe.
  // Explicitly pass schema to make the security guarantee clear
  // and protect against future library changes.
  return yaml.load(content, {
    schema: yaml.DEFAULT_SCHEMA,
    ...options,
  });
}

/**
 * Safely parse all YAML documents in a multi-document file.
 *
 * @param {string} content - YAML string containing one or more documents
 * @param {Object} options - Optional yaml.loadAll options
 * @returns {any[]} Array of parsed YAML documents
 * @throws {yaml.YAMLException} If YAML is malformed
 */
function safeLoadAll(content, options = {}) {
  if (typeof content !== 'string') {
    throw new TypeError('YAML content must be a string');
  }

  const documents = [];
  yaml.loadAll(
    content,
    (doc) => documents.push(doc),
    { schema: yaml.DEFAULT_SCHEMA, ...options }
  );
  return documents;
}

/**
 * Safely serialize data to YAML string.
 *
 * @param {any} data - Data to serialize
 * @param {Object} options - Optional yaml.dump options
 * @returns {string} YAML string representation
 */
function safeDump(data, options = {}) {
  return yaml.dump(data, {
    schema: yaml.DEFAULT_SCHEMA,
    ...options,
  });
}

/**
 * Test if js-yaml is configured securely (no JavaScript type support).
 * This function is used in security tests to verify the library version
 * and configuration.
 *
 * @returns {boolean} True if the configuration is secure
 */
function isSecureConfiguration() {
  // Attempt to parse YAML with JavaScript function syntax
  // This should NOT execute any code in v4+
  const maliciousYaml = `
test: !!js/function 'function() { return "pwned"; }'
regex: !!js/regexp /test/i
undef: !!js/undefined ''
`;

  try {
    const result = safeLoad(maliciousYaml);
    // If we get here without executing code, and the values are
    // either strings or undefined (not actual functions), we're safe
    if (typeof result.test === 'function') {
      return false; // Unsafe: function was instantiated
    }
    if (result.regex instanceof RegExp) {
      return false; // Unsafe: regex was instantiated
    }
    // Values should be undefined or error out due to unknown tags
    return true;
  } catch (e) {
    // YAMLException for unknown tags is the expected safe behavior
    if (e.name === 'YAMLException') {
      return true;
    }
    throw e;
  }
}

module.exports = {
  safeLoad,
  safeLoadAll,
  safeDump,
  isSecureConfiguration,
  // Re-export yaml module for edge cases that need direct access
  yaml,
};
