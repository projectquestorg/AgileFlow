# CI Pipeline Guide

**Load this when:** Designing, reviewing, or optimizing a CI/CD pipeline — stages, caching, parallelization, or failure handling.

## Standard Pipeline Stages

```
trigger → install → lint/typecheck → test → build → security → deploy-staging → smoke-test → deploy-prod
```

| Stage             | Purpose                 | Fail behavior     | Typical duration |
| ----------------- | ----------------------- | ----------------- | ---------------- |
| Install           | Restore deps            | Block all         | 30–90s (cached)  |
| Lint + typecheck  | Code quality gate       | Block             | 15–60s           |
| Unit tests        | Fast correctness check  | Block             | 30s–3min         |
| Integration tests | Service boundary check  | Block             | 1–5min           |
| Build             | Produce artifact        | Block             | 30s–5min         |
| Security scan     | CVE + secrets detection | Block on critical | 30s–2min         |
| Deploy staging    | Validate in env         | Block prod        | 1–3min           |
| Smoke test        | Critical path check     | Block prod        | 30s–2min         |
| Deploy prod       | Release                 | —                 | 1–5min           |

---

## Parallelization Strategies

### Run in parallel (no dependencies between each other)

```yaml
# GitHub Actions example
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]
  typecheck:
    runs-on: ubuntu-latest
    steps: [...]
  unit-tests:
    runs-on: ubuntu-latest
    steps: [...]
  # All three run simultaneously
```

### Matrix strategy (test multiple versions)

```yaml
strategy:
  matrix:
    node: [20, 22]
    os: [ubuntu-latest, windows-latest]
```

### Test splitting (large test suites)

- Split by file count across N runners
- Tools: `jest --shard=1/4`, Vitest `--reporter=verbose`, Playwright sharding
- Target: each shard under 3 minutes

---

## Caching Reference

### Node.js (npm)

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-
```

### Node.js (pnpm)

```yaml
- uses: actions/setup-node@v4
  with:
    cache: "pnpm"
```

### Build artifacts between stages

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: build-output
    path: dist/
    retention-days: 1
```

### Cache invalidation triggers

| Change                      | Should bust cache                   |
| --------------------------- | ----------------------------------- |
| `package-lock.json` changed | Yes — deps cache                    |
| Source code changed         | No — deps cache stays               |
| `.env` / config changed     | Yes — if config is baked into build |
| CI config changed           | Consider bust                       |

---

## Pipeline Optimization Checklist

- [ ] Dependencies cached by lockfile hash
- [ ] Lint and unit tests run in parallel
- [ ] No sequential jobs that could be parallel
- [ ] Test suite split if >5 minutes total
- [ ] Build artifacts uploaded once, reused by deploy jobs
- [ ] Docker layers ordered: deps first, code second (maximize cache hits)
- [ ] Fail fast enabled (cancel in-progress on new push)
- [ ] Skip CI for docs-only changes (`[skip ci]` or path filters)

---

## Fail-Fast Configuration

```yaml
# GitHub Actions — cancel in-progress on new push
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

```yaml
# Path filters — skip CI for docs
on:
  push:
    paths-ignore:
      - "**.md"
      - "docs/**"
```

---

## Secret Management Rules

| Practice                             | Required    |
| ------------------------------------ | ----------- |
| Secrets in env vars, not hardcoded   | Yes         |
| Rotate secrets on suspected exposure | Yes         |
| Separate secrets per environment     | Yes         |
| Least-privilege service accounts     | Yes         |
| Audit secrets access in CI logs      | Recommended |

**Scanning:** `truffleHog`, `gitleaks`, GitHub secret scanning (auto-enabled on public repos)

---

## Pipeline Health Metrics

| Metric                       | Target  | Alert threshold |
| ---------------------------- | ------- | --------------- |
| Mean pipeline duration       | <10 min | >15 min         |
| Success rate                 | >95%    | <90%            |
| Flaky test rate              | <2%     | >5%             |
| Cache hit rate               | >80%    | <60%            |
| Time to restore (on failure) | <30 min | >60 min         |
