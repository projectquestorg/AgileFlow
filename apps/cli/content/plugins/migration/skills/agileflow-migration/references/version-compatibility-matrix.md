# Version Compatibility Matrix

**Load this when:** Planning a version upgrade, evaluating breaking changes, or defining a deprecation timeline.

## Semver Rules Quick Reference

| Version segment | When to bump                    | Example change                                       |
| --------------- | ------------------------------- | ---------------------------------------------------- |
| MAJOR (X.0.0)   | Breaking change                 | Removed API, changed required field, dropped runtime |
| MINOR (x.Y.0)   | New backward-compatible feature | Added endpoint, new optional field                   |
| PATCH (x.y.Z)   | Backward-compatible bug fix     | Fixed incorrect response, corrected type             |
| Pre-release     | Unstable / experimental         | `2.0.0-alpha.1`, `1.5.0-rc.2`                        |

**Rule:** If in doubt whether a change is breaking, treat it as breaking (MAJOR).

---

## Breaking Change Detection Checklist

### API / REST

- [ ] Removed endpoint
- [ ] Renamed endpoint path
- [ ] Changed HTTP method for an operation
- [ ] Removed required or optional field from response
- [ ] Changed field type (string → integer, etc.)
- [ ] Changed field name
- [ ] Made previously optional request field required
- [ ] Changed authentication mechanism
- [ ] Changed pagination scheme
- [ ] Changed error response format

### Library / SDK

- [ ] Removed exported function, class, or constant
- [ ] Renamed exported symbol
- [ ] Changed function signature (parameter type, order, or count)
- [ ] Changed return type
- [ ] Changed thrown error types
- [ ] Removed support for a runtime version (Node, browser)
- [ ] Changed peer dependency requirements

### Database schema

- [ ] Dropped column or table
- [ ] Renamed column or table
- [ ] Changed column type in incompatible way
- [ ] Added NOT NULL constraint to existing column (without default)
- [ ] Changed primary key

---

## Deprecation Timeline Standards

| Phase         | Duration         | User expectation                          |
| ------------- | ---------------- | ----------------------------------------- |
| Announcement  | —                | Feature marked deprecated in docs + logs  |
| Notice period | ≥1 MINOR version | Warning in responses/console; still works |
| Removal       | NEXT MAJOR       | Removed entirely                          |

**Minimum deprecation period:** 1 full MINOR version release cycle.
**Recommended:** 6 months notice before removal for public APIs.

### Deprecation notice format (in code)

```js
/**
 * @deprecated Use `newFunction()` instead. Will be removed in v3.0.
 * @see https://docs.example.com/migration/v2-to-v3
 */
function oldFunction() { ... }
```

### Deprecation notice in API response header

```
Deprecation: true
Sunset: Sat, 01 Jan 2026 00:00:00 GMT
Link: <https://docs.example.com/migration>; rel="successor-version"
```

---

## Node.js Version Support Matrix (template)

| Package version | Node 18 | Node 20 | Node 22 | Notes               |
| --------------- | ------- | ------- | ------- | ------------------- |
| v3.x (current)  | Yes     | Yes     | Yes     | Active support      |
| v2.x            | Yes     | Yes     | No      | Security fixes only |
| v1.x            | No      | No      | No      | EOL                 |

**Policy:** Support Node LTS versions that have not reached EOL.
[Node.js release schedule](https://nodejs.org/en/about/previous-releases)

---

## Peer Dependency Compatibility

```json
// package.json
{
  "peerDependencies": {
    "react": ">=17.0.0 <20.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
```

| Version range      | Meaning                           |
| ------------------ | --------------------------------- |
| `>=17.0.0`         | 17+ with no upper bound           |
| `^17.0.0`          | 17.x only                         |
| `>=17.0.0 <20.0.0` | 17, 18, 19 — explicit upper bound |
| `*`                | Any version (avoid for peers)     |

---

## Migration Path Matrix (template)

Use this to communicate supported upgrade paths:

| From | To   | Supported    | Migration guide           |
| ---- | ---- | ------------ | ------------------------- |
| v1.x | v2.x | Yes          | [v1→v2 guide](#)          |
| v2.x | v3.x | Yes          | [v2→v3 guide](#)          |
| v1.x | v3.x | Yes (2-step) | Upgrade to v2 first       |
| v0.x | v3.x | No           | Manual migration required |

---

## Changelog Entry Format for Breaking Changes

```markdown
## [3.0.0] - 2025-06-01

### BREAKING CHANGES

- **Removed** `getUser()` — use `fetchUser()` instead (#123)
- **Changed** `config.timeout` now in milliseconds, was seconds (#456)
- **Dropped** Node 16 support — Node 18+ required

### Migration Guide

See https://docs.example.com/migration/v2-to-v3

### Added

- New `fetchUser()` with retry logic and timeout (#123)

### Fixed

- Config validation no longer throws on undefined optional fields
```
