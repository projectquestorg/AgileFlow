## Visual Feedback Check

When implementing UI changes, take screenshots to verify your work visually.

### How to Capture

**Option A - Browser MCP** (if `browser` MCP server is connected):
```
Use the browser MCP's screenshot tool to capture the page.
```

**Option B - Playwright CLI** (fallback):
```bash
npx playwright screenshot <URL> <OUTPUT_PATH> --full-page
```

### Workflow

1. **Check dev server**: Before capturing, verify the URL is reachable:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" <URL>
   ```
2. **Capture**: Save screenshot to `.agileflow/ui-review/runs/visual-checks/`
   - Filename: `<component-or-page>-<timestamp>.png`
3. **Inspect**: Use the Read tool on the screenshot file (Claude can view images natively)
4. **Iterate**: If the visual result is wrong, fix the code and re-capture

### Token Budget Rules

- **Screenshots only** - never dump full DOM or accessibility trees into context
- **One screenshot per check** - capture only the relevant viewport/component
- **No MCP round-trips for viewing** - use Read tool directly on the saved image file

### When to Use

- After making CSS/layout changes
- After adding or modifying UI components
- Before marking a UI story as complete
- When the quality gate requires visual verification
