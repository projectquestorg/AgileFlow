/**
 * Codebase Indexer - Fast index for programmatic codebase queries
 *
 * Features:
 * - Builds index of files with metadata (type, exports, imports, tags)
 * - Incremental updates based on file mtime
 * - LRU cache integration for performance
 * - Persistent storage in .agileflow/cache/codebase-index.json
 * - Configuration via docs/00-meta/agileflow-metadata.json
 *
 * Based on RLM (Recursive Language Models) research:
 * Use programmatic search instead of loading full context.
 */

const fs = require('fs');
const path = require('path');
const { LRUCache } = require('./cache-provider');
const { safeReadJSON, safeWriteJSON, debugLog } = require('./errors');

// Debug mode via env var
const DEBUG = process.env.AGILEFLOW_DEBUG === '1';

// Index version for migration support
const INDEX_VERSION = '1.0.0';

// Default configuration (can be overridden via agileflow-metadata.json)
const DEFAULT_CONFIG = {
  ttlMs: 60000, // 1 minute cache TTL (or ttl_hours * 3600000)
  maxCacheSize: 10,
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.agileflow/cache/**',
    '*.log',
    '*.lock',
  ],
  includePatterns: [
    '**/*.js',
    '**/*.ts',
    '**/*.tsx',
    '**/*.jsx',
    '**/*.md',
    '**/*.json',
    '**/*.yaml',
    '**/*.yml',
  ],
  maxFileSizeKb: 500,
  tokenBudget: 15000,
};

/**
 * Load configuration from agileflow-metadata.json if available
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Merged configuration
 */
function loadConfig(projectRoot) {
  const metadataPath = path.join(projectRoot, 'docs/00-meta/agileflow-metadata.json');
  const metadata = safeReadJSON(metadataPath);

  if (!metadata.ok || !metadata.data?.features?.codebaseIndex) {
    return DEFAULT_CONFIG;
  }

  const userConfig = metadata.data.features.codebaseIndex;

  return {
    ...DEFAULT_CONFIG,
    // Convert ttl_hours to ttlMs if provided
    ttlMs: userConfig.ttl_hours ? userConfig.ttl_hours * 60 * 60 * 1000 : DEFAULT_CONFIG.ttlMs,
    excludePatterns: userConfig.exclude_patterns || DEFAULT_CONFIG.excludePatterns,
    includePatterns: userConfig.include_patterns || DEFAULT_CONFIG.includePatterns,
    maxFileSizeKb: userConfig.max_file_size_kb || DEFAULT_CONFIG.maxFileSizeKb,
    tokenBudget: userConfig.token_budget || DEFAULT_CONFIG.tokenBudget,
  };
}

// Tag patterns for auto-detection from path
const TAG_PATTERNS = {
  api: /\/(api|routes|endpoints|controllers)\//i,
  ui: /\/(components|ui|views|pages)\//i,
  database: /\/(db|database|models|schema|migrations)\//i,
  auth: /\/(auth|login|session|jwt|oauth)\//i,
  test: /\/(test|tests|__tests__|spec|specs)\//i,
  config: /\/(config|settings|env)\//i,
  lib: /\/(lib|utils|helpers|shared)\//i,
  docs: /\/(docs|documentation)\//i,
  scripts: /\/(scripts|bin|tools)\//i,
  types: /\/(types|typings|interfaces)\//i,
};

// In-memory cache for indices
const indexCache = new LRUCache({
  maxSize: DEFAULT_CONFIG.maxCacheSize,
  ttlMs: DEFAULT_CONFIG.ttlMs,
});

/**
 * Create empty index structure
 * @returns {Object} Empty index
 */
function createEmptyIndex(projectRoot) {
  return {
    version: INDEX_VERSION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_root: projectRoot,
    stats: {
      total_files: 0,
      indexed_files: 0,
      build_time_ms: 0,
    },
    files: {},
    tags: {},
    symbols: {
      functions: {},
      classes: {},
      exports: {},
    },
  };
}

/**
 * Get file type from extension
 * @param {string} filePath - File path
 * @returns {string} File type
 */
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const typeMap = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript-react',
    '.jsx': 'javascript-react',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
  };
  return typeMap[ext] || 'unknown';
}

/**
 * Extract exports from JavaScript/TypeScript file content
 * @param {string} content - File content
 * @returns {string[]} List of export names
 */
function extractExports(content) {
  const exports = [];

  // Named exports: export const/let/var/function/class name
  const namedExportRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  // Export { name1, name2 }
  const bracketExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = bracketExportRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    });
    exports.push(...names.filter(n => n && n !== 'default'));
  }

  // module.exports = { name1, name2 } or module.exports.name
  const cjsExportRegex = /module\.exports(?:\.(\w+))?\s*=/g;
  while ((match = cjsExportRegex.exec(content)) !== null) {
    if (match[1]) {
      exports.push(match[1]);
    }
  }

  // module.exports = { ... } - extract object keys (handles shorthand: { foo, bar })
  const cjsObjectRegex = /module\.exports\s*=\s*\{([^}]+)\}/;
  const cjsMatch = content.match(cjsObjectRegex);
  if (cjsMatch) {
    // Split by comma and extract property names (handles "foo," "bar:" "baz")
    const props = cjsMatch[1].split(',');
    for (const prop of props) {
      const trimmed = prop.trim();
      // Extract the key name (before : or the whole thing for shorthand)
      const keyMatch = trimmed.match(/^(\w+)/);
      if (keyMatch) {
        exports.push(keyMatch[1]);
      }
    }
  }

  return [...new Set(exports)]; // Dedupe
}

/**
 * Extract imports from JavaScript/TypeScript file content
 * @param {string} content - File content
 * @returns {string[]} List of import sources
 */
function extractImports(content) {
  const imports = [];

  // ES6 imports: import ... from 'source'
  const es6ImportRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CommonJS requires: require('source')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)]; // Dedupe
}

/**
 * Extract function and class names from content
 * @param {string} content - File content
 * @returns {Object} { functions: string[], classes: string[] }
 */
function extractSymbols(content) {
  const functions = [];
  const classes = [];

  // Function declarations: function name() or async function name()
  const funcRegex = /(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  // Arrow functions assigned to const: const name = () =>
  const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  while ((match = arrowRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }

  // Class declarations: class Name
  const classRegex = /class\s+(\w+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return {
    functions: [...new Set(functions)],
    classes: [...new Set(classes)],
  };
}

/**
 * Detect tags for a file based on path and content
 * @param {string} filePath - File path relative to project root
 * @param {string} content - File content
 * @returns {string[]} List of tags
 */
function detectTags(filePath, content) {
  const tags = [];

  // Path-based tags
  for (const [tag, pattern] of Object.entries(TAG_PATTERNS)) {
    if (pattern.test(filePath)) {
      tags.push(tag);
    }
  }

  // Content-based tags (look for common patterns)
  if (/\bexpress\b|\brouter\b|\bapp\.(get|post|put|delete)\b/i.test(content)) {
    if (!tags.includes('api')) tags.push('api');
  }
  if (/\bReact\b|\buseState\b|\buseEffect\b|\bcomponent\b/i.test(content)) {
    if (!tags.includes('ui')) tags.push('ui');
  }
  if (/\bsequelize\b|\bprisma\b|\bmongodb\b|\bsql\b/i.test(content)) {
    if (!tags.includes('database')) tags.push('database');
  }
  if (/\bjwt\b|\bpassport\b|\bauthenticate\b|\blogin\b/i.test(content)) {
    if (!tags.includes('auth')) tags.push('auth');
  }

  return [...new Set(tags)];
}

/**
 * Check if file should be included based on patterns
 * @param {string} relativePath - Path relative to project root
 * @param {string[]} excludePatterns - Patterns to exclude
 * @returns {boolean} True if file should be included
 */
function shouldIncludeFile(relativePath, excludePatterns) {
  for (const pattern of excludePatterns) {
    // Convert glob to regex
    // Handle ** (matches any path segments including none)
    // Handle * (matches within a single path segment)
    let regexPattern = pattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*\*/g, '<<<GLOB>>>') // Temp placeholder for **
      .replace(/\*/g, '[^/]*') // Single * = any chars except /
      .replace(/<<<GLOB>>>/g, '.*') // ** = any chars including /
      .replace(/\?/g, '.'); // ? = any single char

    // Support patterns that should match the start of path
    const regex = new RegExp(`^${regexPattern}`);
    if (regex.test(relativePath)) {
      return false;
    }
  }
  return true;
}

/**
 * Recursively scan directory for files
 * @param {string} dirPath - Directory to scan
 * @param {string} projectRoot - Project root for relative paths
 * @param {string[]} excludePatterns - Patterns to exclude
 * @param {number} maxFileSizeKb - Max file size in KB
 * @returns {Object[]} List of file info objects
 */
function scanDirectory(dirPath, projectRoot, excludePatterns, maxFileSizeKb) {
  const files = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      // Check exclusion
      if (!shouldIncludeFile(relativePath, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        files.push(...scanDirectory(fullPath, projectRoot, excludePatterns, maxFileSizeKb));
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const sizeKb = stat.size / 1024;

          // Skip files that are too large
          if (sizeKb > maxFileSizeKb) {
            if (DEBUG) debugLog(`Skipping large file: ${relativePath} (${sizeKb.toFixed(1)}KB)`);
            continue;
          }

          files.push({
            path: relativePath,
            fullPath,
            size: stat.size,
            mtime: stat.mtime.getTime(),
          });
        } catch (err) {
          if (DEBUG) debugLog(`Error stat file ${relativePath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    if (DEBUG) debugLog(`Error scanning directory ${dirPath}: ${err.message}`);
  }

  return files;
}

/**
 * Build complete codebase index
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Configuration options
 * @returns {Object} { ok: boolean, data?: Object, error?: string }
 */
function buildIndex(projectRoot, options = {}) {
  const startTime = Date.now();

  // Load config from metadata, then override with options
  const baseConfig = loadConfig(projectRoot);
  const config = {
    ...baseConfig,
    ...options,
  };

  try {
    // Verify project root exists
    if (!fs.existsSync(projectRoot)) {
      return { ok: false, error: `Project root not found: ${projectRoot}` };
    }

    const index = createEmptyIndex(projectRoot);

    // Scan for files
    const files = scanDirectory(
      projectRoot,
      projectRoot,
      config.excludePatterns,
      config.maxFileSizeKb
    );
    index.stats.total_files = files.length;

    // Process each file
    for (const fileInfo of files) {
      const { path: relativePath, fullPath, size, mtime } = fileInfo;
      const type = getFileType(relativePath);

      // Read content for code files
      let content = '';
      let exports = [];
      let imports = [];
      let symbols = { functions: [], classes: [] };
      let tags = [];

      if (['javascript', 'typescript', 'javascript-react', 'typescript-react'].includes(type)) {
        try {
          content = fs.readFileSync(fullPath, 'utf8');
          exports = extractExports(content);
          imports = extractImports(content);
          symbols = extractSymbols(content);
          tags = detectTags(relativePath, content);
        } catch (err) {
          if (DEBUG) debugLog(`Error reading ${relativePath}: ${err.message}`);
        }
      } else {
        // Just detect tags from path for non-code files
        tags = detectTags(relativePath, '');
      }

      // Add file to index
      index.files[relativePath] = {
        type,
        size,
        mtime,
        exports,
        imports,
        tags,
      };

      // Update tag index (use Object.hasOwn to avoid prototype pollution)
      for (const tag of tags) {
        if (!Object.hasOwn(index.tags, tag)) {
          index.tags[tag] = [];
        }
        index.tags[tag].push(relativePath);
      }

      // Update symbol index (use Object.hasOwn to avoid prototype pollution with names like "constructor")
      for (const func of symbols.functions) {
        if (!Object.hasOwn(index.symbols.functions, func)) {
          index.symbols.functions[func] = [];
        }
        index.symbols.functions[func].push(relativePath);
      }
      for (const cls of symbols.classes) {
        if (!Object.hasOwn(index.symbols.classes, cls)) {
          index.symbols.classes[cls] = [];
        }
        index.symbols.classes[cls].push(relativePath);
      }
      for (const exp of exports) {
        if (!Object.hasOwn(index.symbols.exports, exp)) {
          index.symbols.exports[exp] = [];
        }
        index.symbols.exports[exp].push(relativePath);
      }

      index.stats.indexed_files++;
    }

    // Update timing
    index.stats.build_time_ms = Date.now() - startTime;
    index.updated_at = new Date().toISOString();

    // Store in cache
    const cacheKey = `index:${projectRoot}`;
    indexCache.set(cacheKey, index);

    // Persist to disk
    const cachePath = getCachePath(projectRoot);
    const writeResult = saveIndexToDisk(cachePath, index);
    if (!writeResult.ok && DEBUG) {
      debugLog(`Warning: Could not persist index to disk: ${writeResult.error}`);
    }

    return { ok: true, data: index };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get cache file path for a project
 * @param {string} projectRoot - Project root
 * @returns {string} Cache file path
 */
function getCachePath(projectRoot) {
  return path.join(projectRoot, '.agileflow', 'cache', 'codebase-index.json');
}

/**
 * Save index to disk atomically
 * @param {string} cachePath - Path to save to
 * @param {Object} index - Index data
 * @returns {Object} { ok: boolean, error?: string }
 */
function saveIndexToDisk(cachePath, index) {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Atomic write via temp file
    const tempPath = `${cachePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(index, null, 2));
    fs.renameSync(tempPath, cachePath);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Load index from disk
 * @param {string} cachePath - Cache file path
 * @returns {Object} { ok: boolean, data?: Object, error?: string }
 */
function loadIndexFromDisk(cachePath) {
  return safeReadJSON(cachePath);
}

/**
 * Update index incrementally (only changed files)
 * @param {string} projectRoot - Project root
 * @param {Object} options - Configuration options
 * @returns {Object} { ok: boolean, data?: Object, error?: string }
 */
function updateIndex(projectRoot, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options,
  };

  try {
    // Try to load existing index
    const cachePath = getCachePath(projectRoot);
    const loadResult = loadIndexFromDisk(cachePath);

    // If no existing index, do full build
    if (!loadResult.ok) {
      return buildIndex(projectRoot, options);
    }

    const existingIndex = loadResult.data;

    // Check if version matches
    if (existingIndex.version !== INDEX_VERSION) {
      if (DEBUG) debugLog('Index version mismatch, rebuilding');
      return buildIndex(projectRoot, options);
    }

    const startTime = Date.now();

    // Scan for current files
    const currentFiles = scanDirectory(
      projectRoot,
      projectRoot,
      config.excludePatterns,
      config.maxFileSizeKb
    );
    const currentFilePaths = new Set(currentFiles.map(f => f.path));

    // Track changes
    let changedCount = 0;
    let addedCount = 0;
    let removedCount = 0;

    // Remove deleted files from index
    for (const filePath of Object.keys(existingIndex.files)) {
      if (!currentFilePaths.has(filePath)) {
        delete existingIndex.files[filePath];
        removedCount++;
      }
    }

    // Check for new or modified files
    for (const fileInfo of currentFiles) {
      const { path: relativePath, fullPath, size, mtime } = fileInfo;
      const existing = existingIndex.files[relativePath];

      // If new file or modified (mtime changed)
      if (!existing || existing.mtime !== mtime) {
        const type = getFileType(relativePath);

        let exports = [];
        let imports = [];
        let symbols = { functions: [], classes: [] };
        let tags = [];

        if (['javascript', 'typescript', 'javascript-react', 'typescript-react'].includes(type)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            exports = extractExports(content);
            imports = extractImports(content);
            symbols = extractSymbols(content);
            tags = detectTags(relativePath, content);
          } catch (err) {
            if (DEBUG) debugLog(`Error reading ${relativePath}: ${err.message}`);
          }
        } else {
          tags = detectTags(relativePath, '');
        }

        existingIndex.files[relativePath] = {
          type,
          size,
          mtime,
          exports,
          imports,
          tags,
        };

        if (existing) {
          changedCount++;
        } else {
          addedCount++;
        }
      }
    }

    // Rebuild tag and symbol indices
    existingIndex.tags = {};
    existingIndex.symbols = { functions: {}, classes: {}, exports: {} };

    for (const [filePath, fileData] of Object.entries(existingIndex.files)) {
      for (const tag of fileData.tags || []) {
        if (!Object.hasOwn(existingIndex.tags, tag)) existingIndex.tags[tag] = [];
        existingIndex.tags[tag].push(filePath);
      }
      for (const exp of fileData.exports || []) {
        if (!Object.hasOwn(existingIndex.symbols.exports, exp))
          existingIndex.symbols.exports[exp] = [];
        existingIndex.symbols.exports[exp].push(filePath);
      }
    }

    // Update stats
    existingIndex.stats.total_files = currentFiles.length;
    existingIndex.stats.indexed_files = Object.keys(existingIndex.files).length;
    existingIndex.stats.build_time_ms = Date.now() - startTime;
    existingIndex.updated_at = new Date().toISOString();

    // Store in cache
    const cacheKey = `index:${projectRoot}`;
    indexCache.set(cacheKey, existingIndex);

    // Persist to disk
    saveIndexToDisk(cachePath, existingIndex);

    if (DEBUG) {
      debugLog(`Index updated: +${addedCount} -${removedCount} ~${changedCount}`);
    }

    return { ok: true, data: existingIndex };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get index (from cache or disk, or build if needed)
 * @param {string} projectRoot - Project root
 * @param {Object} options - Configuration options
 * @returns {Object} { ok: boolean, data?: Object, error?: string }
 */
function getIndex(projectRoot, options = {}) {
  // Check memory cache first
  const cacheKey = `index:${projectRoot}`;
  const cached = indexCache.get(cacheKey);
  if (cached) {
    return { ok: true, data: cached };
  }

  // Try disk cache
  const cachePath = getCachePath(projectRoot);
  const diskResult = loadIndexFromDisk(cachePath);
  if (diskResult.ok) {
    // Validate version
    if (diskResult.data.version === INDEX_VERSION) {
      // Store in memory cache
      indexCache.set(cacheKey, diskResult.data);
      return { ok: true, data: diskResult.data };
    }
  }

  // Build fresh index
  return buildIndex(projectRoot, options);
}

/**
 * Invalidate cached index
 * @param {string} projectRoot - Project root
 */
function invalidateIndex(projectRoot) {
  const cacheKey = `index:${projectRoot}`;
  indexCache.delete(cacheKey);
}

/**
 * Query files by glob pattern
 * @param {Object} index - Codebase index
 * @param {string} pattern - Glob pattern (e.g., "*.auth*", "src/api/**")
 * @returns {string[]} Matching file paths
 */
function queryFiles(index, pattern) {
  // Convert glob to regex
  // Order matters: handle ** before * to avoid double processing
  let regexPattern = pattern
    // First, use placeholders to protect multi-char patterns
    .replace(/\*\*\//g, '<<<GLOBSLASH>>>') // **/ placeholder
    .replace(/\*\*/g, '<<<GLOB>>>') // ** placeholder
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\?/g, '.') // ? = any single char
    .replace(/\*/g, '[^/]*') // Single * = any chars except /
    // Now restore placeholders with actual patterns
    .replace(/<<<GLOBSLASH>>>/g, '(?:.+/)?') // **/ = optionally any path + /
    .replace(/<<<GLOB>>>/g, '.*'); // ** alone = any chars including /

  const regex = new RegExp(`^${regexPattern}$`, 'i');

  return Object.keys(index.files).filter(filePath => regex.test(filePath));
}

/**
 * Query files by tag
 * @param {Object} index - Codebase index
 * @param {string} tag - Tag to search for
 * @returns {string[]} Files with this tag
 */
function queryByTag(index, tag) {
  return index.tags[tag.toLowerCase()] || [];
}

/**
 * Query files by exported symbol
 * @param {Object} index - Codebase index
 * @param {string} symbolName - Symbol name to find
 * @returns {string[]} Files exporting this symbol
 */
function queryByExport(index, symbolName) {
  return index.symbols.exports[symbolName] || [];
}

/**
 * Get dependencies of a file
 * @param {Object} index - Codebase index
 * @param {string} filePath - File path
 * @returns {Object} { imports: string[], importedBy: string[] }
 */
function getDependencies(index, filePath) {
  const fileData = index.files[filePath];
  if (!fileData) {
    return { imports: [], importedBy: [] };
  }

  const imports = fileData.imports || [];

  // Find files that import this file
  const importedBy = [];
  const baseName = path.basename(filePath).replace(/\.\w+$/, '');

  for (const [otherPath, otherData] of Object.entries(index.files)) {
    if (otherPath === filePath) continue;
    const otherImports = otherData.imports || [];
    for (const imp of otherImports) {
      if (imp.includes(baseName) || imp.includes(filePath)) {
        importedBy.push(otherPath);
        break;
      }
    }
  }

  return { imports, importedBy };
}

module.exports = {
  // Core functions
  buildIndex,
  updateIndex,
  getIndex,
  invalidateIndex,

  // Query functions
  queryFiles,
  queryByTag,
  queryByExport,
  getDependencies,

  // Configuration
  loadConfig,

  // Utilities (exposed for testing)
  extractExports,
  extractImports,
  extractSymbols,
  detectTags,
  shouldIncludeFile,
  getFileType,

  // Constants
  INDEX_VERSION,
  DEFAULT_CONFIG,
  TAG_PATTERNS,
};
