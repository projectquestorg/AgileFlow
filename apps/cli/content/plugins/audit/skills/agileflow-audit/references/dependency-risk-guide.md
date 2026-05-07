# Dependency Risk Guide

**Load this when:** Evaluating dependency health, triaging CVEs, or deciding when to upgrade packages.

## CVE Severity Triage

| CVSS Score | Severity | Default action                | Timeline     |
| ---------- | -------- | ----------------------------- | ------------ |
| 9.0–10.0   | Critical | Upgrade or remove immediately | Same day     |
| 7.0–8.9    | High     | Upgrade within sprint         | 1 week       |
| 4.0–6.9    | Medium   | Schedule in backlog           | 1 month      |
| 0.1–3.9    | Low      | Batch with routine updates    | Next release |

**Exploitability modifiers** — escalate severity if:

- Vulnerable code path is reachable from public input
- No authentication required to trigger
- Exploit is publicly available (check exploit-db, CISA KEV list)

---

## Upgrade Decision Framework

### When to upgrade (do it)

- [ ] CVE with CVSS ≥7.0 in reachable code path
- [ ] Package is >2 major versions behind
- [ ] Maintainer has flagged deprecation
- [ ] Security policy (SOC 2, ISO 27001) mandates current versions
- [ ] Dependent package requires newer version

### When to defer (acceptable risk)

- [ ] CVE only in dev dependency, not shipped to users
- [ ] Vulnerable function is not called in your codebase (verify with code search)
- [ ] No patch available yet — add to watch list
- [ ] Breaking change cost exceeds risk (document as accepted risk)

### When to remove (replace or delete)

- [ ] Package unmaintained >2 years with open CVEs
- [ ] Alternative with better security track record exists
- [ ] Package does something you can implement in <50 lines

---

## Dependency Health Scorecard

Rate each critical dependency:

| Dimension        | Green          | Yellow         | Red                  |
| ---------------- | -------------- | -------------- | -------------------- |
| Last release     | <6 months      | 6–18 months    | >18 months           |
| Open issues      | <100           | 100–500        | >500 stale           |
| CVEs (unpatched) | 0              | 1–2 low        | Any high/critical    |
| Downloads/week   | >100k          | 10k–100k       | <10k                 |
| TypeScript types | Built-in       | @types/ exists | Missing              |
| License          | MIT/Apache/BSD | LGPL           | GPL/AGPL/proprietary |

---

## License Risk Matrix

| License               | Use in proprietary app | Distribute  | Notes                          |
| --------------------- | ---------------------- | ----------- | ------------------------------ |
| MIT                   | Yes                    | Yes         | No restrictions                |
| Apache 2.0            | Yes                    | Yes         | Attribution required           |
| BSD 2/3-clause        | Yes                    | Yes         | Attribution required           |
| ISC                   | Yes                    | Yes         | Like MIT                       |
| LGPL                  | Yes (dynamic link)     | Conditional | Static linking = copyleft      |
| GPL v2/v3             | No                     | No          | Copyleft infects product       |
| AGPL                  | No                     | No          | Network use = distribution     |
| CC-BY                 | Content only           | Yes         | Not for code                   |
| Unlicensed/no license | No                     | No          | All rights reserved by default |

---

## npm audit Interpretation

```bash
npm audit --json | jq '.vulnerabilities | to_entries[] | {name: .key, severity: .value.severity, fixAvailable: .value.fixAvailable}'
```

| npm audit result                        | Meaning                                      |
| --------------------------------------- | -------------------------------------------- |
| `fixAvailable: true`                    | `npm audit fix` will resolve it              |
| `fixAvailable: { isSemVerMajor: true }` | Major bump required — check breaking changes |
| `fixAvailable: false`                   | No patch exists yet; manual action needed    |
| `isDirect: false`                       | Transitive dep — check if reachable          |

---

## Transitive Dependency Overrides

When a transitive dep has a CVE but the direct dep hasn't released a fix:

```json
// package.json — npm overrides
{
  "overrides": {
    "vulnerable-package": ">=patched-version"
  }
}

// package.json — yarn resolutions
{
  "resolutions": {
    "vulnerable-package": "patched-version"
  }
}
```

**Risk:** Overrides may break the parent package. Test thoroughly.

---

## Routine Maintenance Schedule

| Cadence   | Action                                                                    |
| --------- | ------------------------------------------------------------------------- |
| Every PR  | `npm audit` in CI — block on high/critical                                |
| Weekly    | Dependabot / Renovate PR review                                           |
| Monthly   | Review deferred medium CVEs; check for unmaintained deps                  |
| Quarterly | Full dependency audit: health scorecard, license scan, bundle size impact |
| Annually  | Evaluate major framework/runtime version upgrades                         |

---

## Tools Reference

| Tool                         | Purpose                       |
| ---------------------------- | ----------------------------- |
| `npm audit`                  | CVE scan for npm packages     |
| `snyk`                       | Deep CVE + license scanning   |
| `socket.dev`                 | Supply chain attack detection |
| `license-checker`            | License compliance scan       |
| `depcheck`                   | Find unused dependencies      |
| `bundlephobia`               | Size impact before installing |
| `renovatebot` / `dependabot` | Automated update PRs          |
