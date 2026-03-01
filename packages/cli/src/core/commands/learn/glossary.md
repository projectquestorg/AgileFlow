---
description: Auto-generate domain terminology glossary from code identifiers, comments, and documentation with definitions and context
argument-hint: "[file|directory] [--update] [--format=table|definitions]"
---

# /agileflow:learn:glossary

Auto-generate a domain terminology glossary by analyzing code identifiers, comments, and documentation. Maps domain-specific terms to their meaning in the codebase context.

---

## Quick Reference

```
/agileflow:learn:glossary                                  # Generate from entire project
/agileflow:learn:glossary src/                             # Generate from specific directory
/agileflow:learn:glossary --update                         # Update existing glossary
/agileflow:learn:glossary --format=definitions             # Definition-style output
```

---

## How It Works

1. **Extract identifiers** - Collect class names, function names, type names, constants
2. **Analyze comments** - Find inline documentation and JSDoc descriptions
3. **Detect domain terms** - Identify business/domain-specific vocabulary
4. **Generate definitions** - Create clear, contextual definitions
5. **Organize alphabetically** - Create a browsable reference

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = file or directory (default: current directory)
UPDATE = --update flag to merge with existing glossary
FORMAT = table (default) or definitions
```

### STEP 2: Extract Domain Terms

Scan the codebase for domain-specific terms:

**Sources**:
- Class and interface names (e.g., `OrderFulfillment`, `PricingTier`)
- Type aliases and enums (e.g., `type OrderStatus = 'pending' | 'shipped'`)
- Constants (e.g., `MAX_RETRY_ATTEMPTS`, `DEFAULT_CURRENCY`)
- Database table/column names
- API endpoint names and parameters
- JSDoc comments with @description
- README and documentation files

**Filtering**:
- Exclude common programming terms (get, set, handle, process)
- Exclude framework terms (useState, useEffect, middleware)
- Focus on business/domain-specific vocabulary

### STEP 3: Generate Definitions

For each term, generate a definition:

```markdown
### {Term}

**Type**: {class | type | function | constant | concept}
**Found in**: `{file_path}`
**Definition**: {clear, contextual definition}
**Example**: `{code usage example}`
**Related terms**: {list of related terms}
```

### STEP 4: Organize and Output

```markdown
# Domain Glossary

**Project**: {project name}
**Generated**: {date}
**Terms**: {N}

## A

### Account
**Type**: model
**Found in**: `src/models/Account.ts`
**Definition**: A registered user entity with authentication credentials and profile information.
**Related**: User, Session, Subscription

### ACL (Access Control List)
**Type**: concept
**Found in**: `src/auth/acl.ts`
**Definition**: Permission rules mapping roles to allowed operations on resources.
**Related**: Role, Permission, Authorization

## B
...
```

Save to `docs/08-project/glossary.md`

### STEP 5: Offer Follow-Up

```
Glossary generated: [N] domain terms extracted from [M] files.

Options:
- Add/edit specific term definitions
- Generate glossary for specific module
- Explain a specific term in depth
- Done
```

---

## Output Formats

**Table format** (default):
| Term | Type | Definition | File |
|------|------|------------|------|
| Account | model | Registered user entity | models/Account.ts |

**Definitions format** (--format=definitions):
Full definition blocks with examples and related terms.

---

## Related Commands

- `/agileflow:learn:tour` - Guided codebase walkthrough
- `/agileflow:learn:explain` - Deep code explanation
- `/agileflow:learn:patterns` - Design patterns catalog
- `/agileflow:docs` - Documentation synchronization
