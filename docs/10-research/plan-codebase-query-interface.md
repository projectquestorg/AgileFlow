# Plan: Codebase Query Interface (RLM-Inspired)

**Research Source**: [RLM Claude Code Implementation](./20260119-rlm-claude-code-implementation.md)
**Related ADR**: [ADR-0008: RLM Pattern Alignment](../03-decisions/adr-0008-rlm-pattern-alignment.md)

---

## Summary

Replace the "load everything" approach in `obtain-context.js` with an intelligent query interface that uses programmatic search (regex, glob, pattern matching) to locate relevant code sections - following the RLM insight of virtualizing documents and querying programmatically instead of feeding full context to the LLM.

---

## Architecture: Hybrid Script + Agent

```
User Query: "What files touch authentication?"
                    ↓
┌─────────────────────────────────────────────────────┐
│  obtain-context.js --query="authentication"         │
│    (backward compatible, adds query mode)           │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  query-codebase.js (New Script)                     │
│    - Build/update codebase index                    │
│    - Programmatic search (grep, glob, regex)        │
│    - Token-budget-aware result truncation           │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  codebase-query.md (New Agent - Haiku)              │
│    - Natural language → structured query            │
│    - Uses Grep/Glob tools for semantic queries      │
│    - Follows Agent Expert pattern                   │
└─────────────────────────────────────────────────────┘
```

---

## Files to Create

### 1. `/packages/cli/scripts/query-codebase.js`
Query engine with indexing and programmatic search.

**Key Functions:**
- `buildIndex(rootDir)` - Create full codebase index
- `updateIndex(rootDir)` - Incremental update on file changes
- `queryFiles(pattern)` - Glob pattern matching
- `queryContent(regex)` - Grep-style content search
- `queryDependencies(filePath)` - Dependency graph traversal
- `querySymbols(name)` - Symbol lookup (functions, classes)

**CLI Interface:**
```bash
node query-codebase.js --build-index
node query-codebase.js --query="auth files"
node query-codebase.js --deps="src/api/auth.ts"
```

### 2. `/packages/cli/lib/codebase-indexer.js`
Indexing logic (separate for testability).

**Index Structure** (cached in `.agileflow/cache/codebase-index.json`):
```javascript
{
  "version": "1.0.0",
  "files": {
    "src/api/auth.ts": {
      "type": "typescript",
      "exports": ["login", "logout"],
      "imports": ["./db", "jsonwebtoken"],
      "tags": ["api", "auth", "security"]
    }
  },
  "symbols": {
    "functions": { "login": ["src/api/auth.ts:15"] }
  },
  "dependency_graph": {
    "src/api/auth.ts": {
      "imports": ["src/db/users.ts"],
      "importedBy": ["src/routes/auth.ts"]
    }
  },
  "tags": {
    "auth": ["src/api/auth.ts", "src/middleware/auth.ts"]
  }
}
```

### 3. `/packages/cli/src/core/agents/codebase-query.md`
Agent for semantic query interpretation.

```yaml
---
name: agileflow-codebase-query
description: Intelligent codebase search using programmatic queries instead of RAG
tools: Read, Glob, Grep
model: haiku
---
```

### 4. `/packages/cli/src/core/experts/codebase-query/expertise.yaml`
Domain knowledge for the query agent.

---

## Files to Modify

### 1. `/packages/cli/scripts/obtain-context.js`
Add query mode flag.

```javascript
// New argument parsing
const queryArg = process.argv.find(a => a.startsWith('--query='));

// Modified main flow
if (queryArg) {
  const query = queryArg.split('=').slice(1).join('=');
  const results = await queryCodebase(query, { tokenBudget: 15000 });
  console.log(results);
} else {
  // Existing full-context gathering (unchanged)
}
```

---

## Implementation Phases

### Phase 1: Core Query Engine
1. Create `codebase-indexer.js` with file indexing
2. Create `query-codebase.js` with CLI interface
3. Index: file patterns, exports/imports, basic tags
4. Query types: file pattern, content search

### Phase 2: Query Agent
1. Create `codebase-query.md` agent (Haiku model)
2. Create `expertise.yaml` for domain knowledge
3. Natural language → structured query translation
4. Integration with Grep/Glob tools

### Phase 3: obtain-context.js Integration
1. Add `--query=` argument parsing
2. Call query engine when query provided
3. Fall back to full context on empty results
4. Token budget enforcement

### Phase 4: Command Migration (Optional)
1. Update commands to use targeted queries
2. Document best practices for query usage

---

## Query Types Supported

| Query Type | Example | Implementation |
|------------|---------|----------------|
| File pattern | "files matching *.auth*" | Glob |
| Content search | "code containing validateToken" | Grep with regex |
| Semantic | "authentication related files" | Tags + keywords |
| Structural | "exports from src/api/" | Index lookup |
| Dependency | "what depends on auth.ts" | Graph traversal |

---

## Configuration

Add to `docs/00-meta/agileflow-metadata.json`:

```json
{
  "codebase_index": {
    "enabled": true,
    "ttl_hours": 1,
    "exclude_patterns": ["node_modules/**", ".git/**", "dist/**"],
    "include_patterns": ["**/*.{ts,tsx,js,jsx,md,json}"],
    "max_file_size_kb": 500,
    "token_budget": 15000
  }
}
```

---

## Success Criteria

- Query response time: < 500ms for indexed queries
- Index build time: < 10s for ~1000 files
- Memory usage: < 50MB for index cache
- Backward compatibility: Existing commands unchanged

---

## Trade-offs Accepted

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| Hybrid script+agent | More files to maintain | Separation of concerns, testability |
| Index caching | Staleness risk | Performance (500ms vs 5s) |
| Haiku for agent | Less capable | Cost-efficient for focused search |
| Node.js not Python | No pickle virtualization | Matches codebase patterns |

---

## Key Reference Files

- `/packages/cli/scripts/obtain-context.js` - Current context gathering (1142 lines)
- `/packages/cli/lib/file-cache.js` - LRU cache to reuse
- `/packages/cli/src/core/agents/orchestrator.md` - Delegation pattern
- `/packages/cli/src/core/experts/README.md` - Agent Expert pattern
