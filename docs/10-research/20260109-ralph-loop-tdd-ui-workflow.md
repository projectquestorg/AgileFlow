# Ralph Loop + TDD for UI Development with Shadcn

**Import Date**: 2026-01-09
**Topic**: Ralph Loop TDD Workflow for UI Verification
**Source**: YouTube video transcript (Automator.dev channel)
**Content Type**: transcript

---

## Summary

This video explores using the Ralph Loop (Anthropic's stop hook plugin) combined with Test-Driven Development (TDD) for building UI features with Shadcn components. The key insight is that while Ralph Loop ensures task completion, **the process design determines success** - simply running tests isn't enough for UI work.

The presenter initially failed because Claude output its completion promise prematurely, ignoring UI errors visible in screenshots. The solution: a **screenshot verification protocol** that forces multi-iteration confirmation, ensuring Claude actually reviews all screenshots before declaring completion.

Key workflow: Write tests first → Ralph loop implements until tests pass → Screenshot verification (with "verified" prefix) → Second iteration confirms all images verified → Only then output completion promise.

---

## Key Findings

- **Shadcn + AI agents = problematic for complex apps**: One-shot landing pages work, but features/apps break other parts when context gets large
- **Ralph Loop uses stop hooks**: When Claude stops outputting, the hook re-feeds the initial prompt, creating iterative improvement cycles
- **Completion promise controls loop exit**: Claude outputs a specific word (e.g., "complete") when done; loop continues until this appears
- **Three commands after install**: `/ralph-loop` (main), `/cancel`, `/help`
- **Max iteration count is critical**: Prevents infinite loops on impossible tasks
- **TDD structure for AI**: e2e test folder, screenshots folder, corresponding tests
- **Tests alone don't catch UI errors**: Functional tests pass but Shadcn styling issues remain
- **Screenshot verification protocol**: Add "verified-" prefix to each reviewed image
- **Multi-iteration confirmation**: Don't output promise after first iteration; let next iteration confirm completion
- **Two loops minimum for UI work**: First loop implements, second loop verifies all screenshots have "verified" prefix

---

## Implementation Approach

### Phase 1: TDD Setup

1. Create e2e test folder structure
2. Create screenshots folder for UI verification
3. Write elaborate tests BEFORE implementation
4. Tests will initially fail (expected)

### Phase 2: Ralph Loop Prompt Design

1. Define the feature requirements
2. Outline the workflow in the prompt:
   - Run tests (expect failures)
   - Implement components to make tests pass
   - Review ALL screenshots
   - Run tests again after UI changes
3. Set completion condition (all tests pass + all screenshots verified)
4. Set max_iterations for safety

### Phase 3: Screenshot Verification Protocol

1. After tests pass, review each screenshot
2. Rename verified screenshots with "verified-" prefix
3. **Critical**: Do NOT output completion promise yet
4. Let next iteration confirm all files have "verified" prefix
5. Only output promise when second iteration confirms completion

### Phase 4: Iteration Flow

```
Loop 1: Implement → Tests Pass → Review Screenshots → Rename to verified-*
        ↓ (NO completion promise yet)
Loop 2: Verify all files have verified- prefix → Final test run
        ↓ (Output completion promise)
Exit Loop
```

---

## Code Snippets

### Ralph Loop Command Pattern

```
/ralph-loop "Implement [feature] following TDD workflow:
1. Run tests (expect initial failures)
2. Implement components to pass tests
3. Review ALL screenshots in /screenshots folder
4. Rename reviewed files with verified- prefix
5. Run tests again
6. DO NOT output completion promise after renaming
7. Let next iteration confirm all files verified" --max-iterations=10
```

### Screenshot Verification Check

```javascript
// Pseudo-code for verification
const screenshots = fs.readdirSync('./screenshots');
const allVerified = screenshots.every(f => f.startsWith('verified-'));
if (allVerified && testsPass) {
  output('COMPLETE'); // Only now output promise
}
```

### TDD Test Structure

```javascript
// e2e/command-palette.spec.ts
describe('Command Palette', () => {
  test('opens with Cmd+K', async () => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.screenshot({ path: 'screenshots/command-palette-open.png' });
  });

  test('searches and executes commands', async () => {
    // ... implementation
    await page.screenshot({ path: 'screenshots/command-palette-search.png' });
  });
});
```

---

## Action Items

- [ ] Create e2e test folder structure for TDD workflow
- [ ] Set up screenshots folder for UI verification
- [ ] Write tests BEFORE implementing UI features
- [ ] Configure Ralph loop with screenshot verification protocol
- [ ] Add "verified-" prefix pattern to screenshot review workflow
- [ ] Always require 2+ iterations for UI work (no early promise output)
- [ ] Separate image verification from functional tests

---

## Risks & Gotchas

- **Premature completion promise**: Claude outputs "complete" before reviewing all screenshots - solution: multi-iteration confirmation
- **Ignored screenshots**: Claude glances at a few and skips others - solution: verified- prefix tracking
- **Tests pass but UI broken**: Functional tests don't catch Shadcn styling issues - solution: screenshot review + prefix verification
- **Context window fill**: Large tasks cause Claude to quit abruptly - solution: Ralph loop re-feeds context
- **Recursive test failures**: Fixing one thing breaks another - TDD catches this via continuous test runs

---

## Story Suggestions

### Potential Epic: TDD + Ralph Loop Integration

**US-XXXX**: Add TDD Scaffold Command
- AC: `/agileflow:tdd-setup` creates e2e/, screenshots/, and test templates

**US-XXXX**: Implement Screenshot Verification Protocol
- AC: Script to check all screenshots have "verified-" prefix

**US-XXXX**: Add Ralph Loop UI Workflow Template
- AC: Pre-built prompt template for Shadcn/UI feature development

**US-XXXX**: Document Multi-Iteration Verification Pattern
- AC: Add to docs with examples and anti-patterns

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[00:00:00] Most of you already know Shad CN as one of the most widely used UI libraries, but using an AI agent to build with it can be problematic. If you're building oneshot landing pages, you won't have a huge problem. But if you're building a new app or implementing a new feature, things break and they break other parts of the app as well...

[00:06:55] Some files were completely ignored. So, the main issue was that it output its promise statement prematurely and didn't verify whether the UI was actually fixed. We went through a whole brainstorming session on how we could fix this...

[00:08:00] So to solve this, we encouraged it to think in a different way. We told it that after it renamed all the screenshots, it should not output the promise yet, meaning it should not consider the task completed and it should let the next iteration confirm completion. So at least two loops should run...

</details>

---

## References

- Source: Automator.dev YouTube channel
- Related: [Claude Code Stop Hooks & Ralph Loop](./20260101-claude-code-stop-hooks-ralph-loop.md) (basic Ralph loop concepts)
- Import date: 2026-01-09
