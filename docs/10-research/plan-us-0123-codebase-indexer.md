# Plan: US-0123 - Create codebase-indexer.js Library

**Story**: US-0123 - Create codebase-indexer.js library
**Epic**: EP-0021 - Codebase Query Interface (RLM-Inspired)
**Estimate**: 4h

---

## Summary

Create a new lib module `packages/cli/lib/codebase-indexer.js` that builds and maintains an index of the project codebase for fast programmatic queries.

---

## File to Create

`/home/coder/AgileFlow/packages/cli/lib/codebase-indexer.js`

---

## Implementation

### Module Structure

```javascript
/**
 * Codebase Indexer - Fast index for programmatic codebase queries
 *
 * Features:
 * - Builds index of files with metadata (type, exports, imports, tags)
 * - Incremental updates based on file mtime
 * - LRU cache integration for performance
 * - Persistent storage in .agileflow/cache/codebase-index.json
 */

const fs = require('fs');
const path = require('path');
const { LRUCache } = require('./file-cache');
const { safeReadJSON, safeWriteJSON } = require('./errors');
```

### Core Functions

1. **buildIndex(rootDir, options)**
   - Scan project files (respecting exclude patterns)
   - Extract metadata: file type, exports, imports
   - Auto-tag based on path and content keywords
   - Store in `.agileflow/cache/codebase-index.json`

2. **updateIndex(rootDir)**
   - Read existing index
   - Check mtimes for changed files
   - Only reindex modified files
   - Merge with existing index

3. **getIndex(rootDir)**
   - Check in-memory cache first
   - Fall back to disk cache
   - Rebuild if expired or missing

### Index Schema

```json
{
  "version": "1.0.0",
  "created_at": "2026-01-19T...",
  "updated_at": "2026-01-19T...",
  "project_root": "/path/to/project",
  "stats": {
    "total_files": 150,
    "indexed_files": 120,
    "build_time_ms": 450
  },
  "files": {
    "src/api/auth.ts": {
      "type": "typescript",
      "size": 1234,
      "mtime": 1705600000000,
      "exports": ["login", "logout"],
      "imports": ["./db", "jsonwebtoken"],
      "tags": ["api", "auth"]
    }
  },
  "tags": {
    "auth": ["src/api/auth.ts", "src/middleware/auth.ts"],
    "api": ["src/api/**"]
  }
}
```

### Integration Points

- **LRUCache**: Reuse from `file-cache.js` (60s TTL for index)
- **safeReadJSON/safeWriteJSON**: From `errors.js` for file ops
- **paths.js**: For `getProjectRoot()`

### Key Patterns to Follow

1. **Result objects**: Return `{ ok: boolean, data?, error? }`
2. **Debug logging**: Use `DEBUG` env var pattern
3. **Error handling**: Use `createTypedError` for diagnostics

---

## Tests to Create

`/home/coder/AgileFlow/packages/cli/__tests__/lib/codebase-indexer.test.js`

Test cases:
1. buildIndex creates valid index structure
2. buildIndex respects exclude patterns (node_modules, .git)
3. buildIndex extracts exports from JS/TS files
4. buildIndex extracts imports
5. buildIndex auto-tags based on path patterns
6. updateIndex only reindexes changed files
7. getIndex returns cached result when valid
8. getIndex rebuilds when cache expired
9. Index persists to disk correctly
10. Large codebase performance (<10s for 1000 files)

---

## Acceptance Criteria Verification

- [x] Create packages/cli/lib/codebase-indexer.js
- [x] Implement buildIndex(rootDir) that scans files and extracts metadata
- [x] Index includes: file type, exports, imports, tags
- [x] Store index in .agileflow/cache/codebase-index.json
- [x] Implement updateIndex(rootDir) for incremental updates
- [x] Use existing file-cache.js LRU pattern
- [x] Add 20+ tests for indexer functions

---

## Implementation Steps

1. Create module skeleton with JSDoc header
2. Implement `buildIndex()` with file scanning
3. Add export/import extraction (regex for JS/TS)
4. Add auto-tagging from path patterns
5. Add persistent storage with atomic writes
6. Implement `updateIndex()` for incremental updates
7. Add `getIndex()` with cache integration
8. Create test file with 20+ tests
9. Run tests and verify all pass
