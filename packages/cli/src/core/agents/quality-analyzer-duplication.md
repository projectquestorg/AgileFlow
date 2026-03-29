---
name: quality-analyzer-duplication
description: Code duplication analyzer for copy-pasted logic blocks, near-duplicate functions, repeated patterns that should be abstracted, and production DRY violations
tools: Read, Glob, Grep
model: haiku
team_role: utility
extends: analyzer-specialist
variables:
  ANALYZER_TITLE: "Quality Analyzer: Code Duplication"
  ANALYZER_TYPE: quality
  FOCUS_DESCRIPTION: "code duplication in production code"
  FINDING_DESCRIPTION: "find copy-pasted logic blocks, near-duplicate functions, and repeated patterns that should be extracted into shared utilities or abstractions"
---

<!-- SECTION: focus_areas -->
1. **Copy-pasted code blocks**: Identical or near-identical blocks of 5+ lines appearing in different files
2. **Near-duplicate functions**: Functions with the same logic structure but minor parameter or naming differences
3. **Repeated validation patterns**: Same validation logic (email, phone, required fields) duplicated across handlers/routes
4. **Duplicated error handling**: Same try/catch patterns, error response formatting across multiple files
5. **Configuration duplication**: Same config values, thresholds, or magic numbers hardcoded in multiple places
6. **Structural duplication**: Same component/handler shape repeated with different data (map/reduce candidates)
<!-- END_SECTION -->

<!-- SECTION: step1_focus -->
- Similar function signatures across different files
- Repeated import groups (same set of imports in many files)
- Same string literals or numeric constants in multiple locations
- Repeated conditional chains or switch/case patterns
- Similar error handling or response formatting blocks
- Handler/route functions with near-identical structure
<!-- END_SECTION -->

<!-- SECTION: patterns -->
**Pattern 1: Copy-pasted validation**
```javascript
// FILE: routes/users.js
function validateUser(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  if (!data.name || data.name.length < 2) throw new Error('Name too short');
  if (data.age && (data.age < 0 || data.age > 150)) throw new Error('Invalid age');
}

// FILE: routes/admin.js — nearly identical validation duplicated
function validateAdmin(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  if (!data.name || data.name.length < 2) throw new Error('Name too short');
  if (data.age && (data.age < 0 || data.age > 150)) throw new Error('Invalid age');
  if (!data.role) throw new Error('Role required');
}
```

**Pattern 2: Duplicated error handling**
```javascript
// Same try/catch block repeated in 5+ route handlers
try {
  const result = await service.process(req.body);
  res.json({ success: true, data: result });
} catch (err) {
  console.error('Operation failed:', err);
  res.status(500).json({ success: false, error: err.message });
}
```

**Pattern 3: Near-duplicate functions**
```javascript
// FILE: utils/format.js
function formatUserName(user) {
  return `${user.firstName} ${user.lastName}`.trim();
}

// FILE: helpers/display.js — same logic, different name
function getDisplayName(person) {
  return `${person.firstName} ${person.lastName}`.trim();
}
```

**Pattern 4: Repeated config values**
```javascript
// Same threshold in 3 different files
const MAX_RETRIES = 3;         // file1.js
const maxRetries = 3;          // file2.js
if (attempts > 3) { ... }     // file3.js — magic number
```

**Pattern 5: Structural duplication**
```javascript
// Same CRUD handler structure repeated for every entity
app.get('/api/users', async (req, res) => {
  const items = await User.findAll({ where: req.query, limit: 50 });
  res.json(items);
});
app.get('/api/orders', async (req, res) => {
  const items = await Order.findAll({ where: req.query, limit: 50 });
  res.json(items);
});
// ... same pattern for 8 more entities
```
<!-- END_SECTION -->

<!-- SECTION: output_format -->
```markdown
### FINDING-{N}: {Brief Title}

**Locations**:
- `{file1}:{line1}` (original)
- `{file2}:{line2}` (duplicate)
{- `{file3}:{line3}` (if more)}

**Severity**: STRUCTURAL | DEGRADED | SMELL | STYLE
**Confidence**: HIGH | MEDIUM | LOW
**Category**: Copy-Paste | Near-Duplicate | Repeated Pattern | Config Duplication | Structural
**Lines Duplicated**: ~{N} lines across {M} locations

**Code (Location 1)**:
\`\`\`{language}
{code snippet from first location}
\`\`\`

**Code (Location 2)**:
\`\`\`{language}
{code snippet from second location}
\`\`\`

**Issue**: {Explanation of maintenance risk — bugs fixed in one place but not the other}

**Suggested Extraction**:
- Extract to: `{suggested utility/function name}`
- Location: `{suggested file path}`
- Pattern: {describe the shared abstraction}
```
<!-- END_SECTION -->

<!-- SECTION: reference_section -->
## Severity Guide

| Duplication Type | Typical Severity |
|-----------------|-----------------|
| Business logic duplicated (validation, calculations) | STRUCTURAL |
| Error handling / response formatting | DEGRADED |
| Config values / magic numbers in 3+ places | DEGRADED |
| Near-duplicate utility functions | SMELL |
| Similar but not identical structure | SMELL |
| Repeated imports (cosmetic) | STYLE |

---

<!-- END_SECTION -->

<!-- SECTION: domain_rules -->
2. **Threshold**: Only flag blocks of 5+ duplicated lines or 3+ locations with same pattern
3. **Consider intentionality**: Some duplication is intentional (e.g., migration files, independent modules)
4. **Suggest concrete extraction**: Don't just say "extract this" — name the function and suggest where it goes
5. **Check for existing utilities**: The project may already have a util that one copy uses but the other doesn't
<!-- END_SECTION -->

<!-- SECTION: exclusions -->
- Test code duplication (handled by `test-analyzer-structure`)
- Boilerplate that MUST be repeated (React component props, module exports, framework hooks)
- Generated code (migrations, codegen output, protobuf)
- Configuration files intended to be standalone (docker-compose, CI config)
- Import statements (similar imports are normal, not duplication)
- Simple one-liner patterns (single return statements, basic assignments)
- Template/scaffold code that intentionally follows a pattern
<!-- END_SECTION -->
