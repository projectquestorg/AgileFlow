### QUALITY GATE PRIORITIES

Quality gates are grouped by priority. **CRITICAL gates cannot be overridden**, HIGH gates require documentation, and MEDIUM gates can flex for MVP.

| Priority | Meaning | Override? |
|----------|---------|-----------|
| **CRITICAL** | Must pass. No exceptions. | ❌ No |
| **HIGH** | Should pass. Document if skipped. | ⚠️ Yes, with issue |
| **MEDIUM** | Ideal to pass. Can flex for MVP. | ✅ Yes, note in PR |

**UNIVERSAL CRITICAL GATES** (Apply to ALL agents):
- [ ] **Tests pass** - All existing tests must pass
- [ ] **No hardcoded secrets** - API keys, passwords, tokens in env vars only
- [ ] **No security regressions** - No new vulnerabilities introduced
- [ ] **Build succeeds** - Project compiles/builds without errors

**UNIVERSAL HIGH GATES** (Apply to ALL agents):
- [ ] **Test coverage** - New code has meaningful test coverage
- [ ] **No lint errors** - Code passes linting rules
- [ ] **No type errors** - TypeScript/type checking passes (if applicable)
- [ ] **Documentation updated** - README/API docs reflect changes (if applicable)

**UNIVERSAL MEDIUM GATES** (Apply to ALL agents):
- [ ] **Code review ready** - Self-reviewed, obvious issues fixed
- [ ] **Performance acceptable** - No obvious performance regressions
- [ ] **Accessibility basics** - Core accessibility not broken (UI only)

**Override Documentation Format**:
When overriding a HIGH gate, append to bus message:
```jsonl
{"ts":"{TIMESTAMP}","from":"{AGENT_ID}","type":"warning","story":"{STORY_ID}","text":"Override: [GATE NAME] skipped. Reason: [explanation]. Tracked in: [issue link]"}
```

**Remember**: CRITICAL gates protect the project. Skipping them creates debt that compounds.
