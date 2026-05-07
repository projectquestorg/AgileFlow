# README Template

**Load this when:** Writing or auditing a project README — what sections to include, what to skip, and what to prioritize.

## README Section Order (recommended)

```
1. Name + one-line description
2. Badges (CI, npm, license) — optional
3. Screenshot or demo GIF — if visual tool
4. Quick start / install
5. Usage (most common case)
6. Configuration (if non-trivial)
7. API reference (or link to docs)
8. Contributing
9. License
```

---

## Section Templates

### Name + Description

```markdown
# package-name

[One sentence: what it does and who it's for. No filler words.]

> Minimal task queue for Node.js with Redis. Zero dependencies beyond ioredis.
```

### Badges

```markdown
[![CI](https://github.com/org/repo/actions/workflows/ci.yml/badge.svg)](...)
[![npm](https://img.shields.io/npm/v/package-name)](https://npmjs.com/package/package-name)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

Keep badges to 3–5 max. Remove badges that are always red.

### Quick Start

````markdown
## Quick Start

\```bash
npm install package-name
\```

\```js
import { thing } from 'package-name';
const result = await thing({ option: 'value' });
\```

That's it. [See full usage →](#usage)
````

### Usage

```markdown
## Usage

### Most common case

[Show the code people will actually write. Real example, not `foo/bar`.]

### With options

[Show the next most common usage pattern.]

### Edge cases / advanced

[Keep this short or link to docs.]
```

### Configuration

```markdown
## Configuration

| Option    | Type    | Default | Description           |
| --------- | ------- | ------- | --------------------- |
| `timeout` | number  | `5000`  | Request timeout in ms |
| `retries` | number  | `3`     | Max retry attempts    |
| `verbose` | boolean | `false` | Log debug output      |
```

### Contributing

````markdown
## Contributing

\```bash
git clone https://github.com/org/repo
npm install
npm test
\```

PRs welcome. Please open an issue first for significant changes.
See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
````

---

## What to Include

| Include                          | Reason                            |
| -------------------------------- | --------------------------------- |
| Install command                  | First thing people need           |
| Working code example             | Proves it's real                  |
| Node/runtime version requirement | Prevents frustration              |
| License                          | Legal requirement for open source |
| Link to changelog                | Release history                   |
| Link to issues                   | Support channel                   |

---

## What to Skip

| Skip                                  | Why                                       |
| ------------------------------------- | ----------------------------------------- |
| Long introductory prose               | Nobody reads it                           |
| "This project was created because..." | Unnecessary backstory                     |
| Detailed philosophy section           | Put in docs, not README                   |
| Exhaustive API reference              | Belongs in `/docs` or generated reference |
| TODO list                             | Put in issues                             |
| "Built with ❤️" filler                | Adds nothing                              |
| >5 badges                             | Visual clutter                            |

---

## README Antipatterns

| Antipattern                                | Fix                                       |
| ------------------------------------------ | ----------------------------------------- |
| Install section buried below 3 paragraphs  | Move install to top                       |
| Example uses `example.com` / `foo` / `bar` | Use realistic domain example              |
| "See the docs" with no link                | Add the actual link                       |
| Out-of-date version in examples            | Pin examples to major version only (`^1`) |
| Missing minimum Node/runtime version       | Add to install section                    |
| Screenshot from 2 major versions ago       | Update or remove                          |

---

## README Length Guidelines

| Project type     | Target length                     |
| ---------------- | --------------------------------- |
| CLI tool         | 100–200 lines                     |
| npm library      | 150–300 lines                     |
| Full application | 100–200 lines + link to docs site |
| Internal tool    | 50–100 lines                      |

**Rule:** If the README is longer than 400 lines, extract to a docs site.
