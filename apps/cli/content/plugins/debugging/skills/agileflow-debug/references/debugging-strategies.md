# Debugging Strategies Reference

**Load this when:** choosing how to approach a specific type of bug, picking the right tools for the environment, or deciding between debugging strategies.

---

## Strategy selection guide

| Symptom                                | Best strategy                                          |
| -------------------------------------- | ------------------------------------------------------ |
| Clear error message with stack trace   | Error analysis → trace the call stack                  |
| "Works on my machine"                  | Environment diff → compare configs, versions, env vars |
| Intermittent / flaky                   | Race condition analysis or timing investigation        |
| Regression (worked before, broken now) | Git bisect / diff against last known good commit       |
| Performance issue                      | Profiling → find the hot path                          |
| Failing test                           | Test isolation → run single test, add verbose output   |
| Black box (no source access)           | Network inspection, log analysis                       |

---

## Strategy 1: Stack trace analysis

**When:** You have an error message with a stack trace.

**Steps:**

1. Find the first frame that is YOUR code (not framework, not node_modules)
2. Open that file and go to that line
3. Read the error message literally — it tells you what was wrong at that point
4. Ask: "What should the value have been here?"
5. Trace backward through the call chain to find where the value became wrong

**Frame filtering guide:**

```
// Ignore these frames (they're framework internals):
at Object.Module._extensions..js (node:internal/modules/cjs/loader:1217:10)
at Module.load (node:internal/modules/cjs/loader:1033:32)
at Router.handle (express/lib/router/index.js:284:7)

// This is YOUR code — start here:
at UserService.getUser (src/services/user-service.js:47:23)
at async UserController.handleGet (src/controllers/user.js:22:18)
```

**Error message translations:**

```
TypeError: Cannot read properties of undefined (reading 'id')
→ Some object you expected to exist is undefined.
→ Find the variable named just before .id — what should it have contained?

ReferenceError: X is not defined
→ Variable X is used before it was declared, or is out of scope
→ Check imports / const declarations

UnhandledPromiseRejection: ...
→ An async function threw and no .catch() or try/catch caught it
→ Find the Promise chain and add error handling

ENOENT: no such file or directory
→ File path is wrong — log the full path value and check if the file actually exists
→ Check working directory assumptions: paths may be relative to unexpected root

SyntaxError: Unexpected token '<'
→ Usually means the server returned HTML (error page) where JSON was expected
→ Check the HTTP response status and body before parsing as JSON
```

---

## Strategy 2: Binary search (divide and conquer)

**When:** The bug is somewhere in a large code path and you don't know where.

**Steps:**

1. Mark the **start** — a point where the data is definitely correct
2. Mark the **end** — a point where the data is definitely wrong
3. Add a probe (log statement or assertion) at the **midpoint** of the path
4. Run and check: is the data correct at the midpoint?
   - Correct → bug is in the second half (move start to midpoint)
   - Wrong → bug is in the first half (move end to midpoint)
5. Repeat until the range narrows to 1–2 lines

**Example:**

```
Input: { userId: 5 }        ← correct here
  │
  │ ← bug is somewhere in here
  │
Output: { userId: null }    ← wrong here

Binary search:
  Step 1: Add log at middleware (middle of stack)
          → userId: 5 ← correct at midpoint
          → Bug is in the bottom half (controller/service layer)

  Step 2: Add log at service entry
          → userId: 5 ← still correct
          → Bug is in the query or return path

  Step 3: Log the DB query result
          → Row: { id: 5, name: 'Alice' } ← correct
          → Log the mapped output: { userId: null } ← wrong here
          → Bug is in the mapper function
```

---

## Strategy 3: Git bisect (regression isolation)

**When:** Something worked before and is broken now; you know the last good commit.

```bash
# Start bisect
git bisect start

# Mark current (broken) state
git bisect bad

# Mark the last known good commit
git bisect good v1.2.0   # or specific commit hash

# Git will checkout a midpoint commit
# Test whether the bug exists
npm test  # or run the app and reproduce manually

# Tell git the result
git bisect bad    # still broken
# or
git bisect good   # works here

# Repeat until git identifies the commit
# Git will say: "abc123 is the first bad commit"

# When done
git bisect reset
```

**Once you have the commit:**

- Read the commit diff: `git show abc123`
- The bug is introduced by one of those changes
- If it's not obvious, read each changed file

---

## Strategy 4: Environment comparison

**When:** "Works on my machine" — local works, staging or production doesn't.

**Diff checklist:**

| Category                         | Check                                                               |
| -------------------------------- | ------------------------------------------------------------------- |
| Node / Python / language version | `node --version` on both environments                               |
| Dependencies                     | `npm ls` or `pip freeze` — are versions pinned?                     |
| Environment variables            | Compare `.env` vs production env vars (without values)              |
| Database state                   | Is the data different? Is there a migration that didn't run?        |
| File permissions                 | Does the app have the right permissions in production?              |
| Memory / CPU limits              | Is the app hitting resource limits in production?                   |
| External services                | Is the external API configured differently (sandbox vs production)? |
| Timezone                         | Server timezone may differ; check date calculations                 |
| Network                          | Is there a proxy or firewall in production?                         |

---

## Strategy 5: Rubber duck debugging

**When:** You're stuck and can't form a hypothesis.

Talk (or write) through the problem as if explaining it to someone who doesn't know the code:

1. "The function `getUserOrders` takes a `userId` and should return..."
2. "It works when the user has orders, but fails when..."
3. "Looking at line 47, it does X, which assumes Y..."
4. "Wait — it assumes Y, but Y might not be true if..."

The act of articulating the problem in full sentences often reveals the assumption that's wrong.

---

## Strategy 6: Logging strategy

**When:** You need to understand the state of the system at runtime without a debugger.

**The three-point log pattern:**

```js
// 1. Log at entry: what went in?
console.log("[getUser] input:", { userId, context });

// 2. Log at decision points: what path is being taken?
console.log("[getUser] cache_hit:", cacheHit, "cache_key:", cacheKey);

// 3. Log at exit: what came out?
console.log("[getUser] result:", result, "duration_ms:", Date.now() - start);
```

**Structured logging for easier grep:**

```js
// Add a prefix so you can grep just your debug lines
logger.debug({ event: "get_user", userId, hit: cacheHit });
```

**Remove debug logs before committing.** Add a `// DEBUG` comment if you're not sure — makes them easy to find and delete.

---

## Strategy 7: Profiling (performance bugs)

**When:** The app is slow and you need to find the bottleneck.

**Node.js profiling:**

```bash
# CPU profile
node --prof app.js            # generates isolate-*.log
node --prof-process isolate-*.log > profile.txt
# Look for functions with high "self" time

# Or use clinic.js for easier output
npx clinic flame -- node app.js
```

**Database profiling:**

```sql
-- PostgreSQL: find slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Explain a specific query
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 5;
-- Look for: Seq Scan (missing index), high actual rows vs estimated rows
```

**Python profiling:**

```python
import cProfile
import pstats

with cProfile.Profile() as pr:
    result = slow_function()

stats = pstats.Stats(pr)
stats.sort_stats('cumulative')
stats.print_stats(20)  # top 20 by cumulative time
```

---

## Strategy 8: Network / HTTP debugging

**When:** The bug involves an API call or network request.

**Tools:**

```bash
# Inspect actual HTTP request/response
curl -v https://api.example.com/users/1 \
  -H "Authorization: Bearer ${TOKEN}"
# -v shows request headers and response headers

# With timing breakdown
curl -w "@curl-format.txt" -o /dev/null -s https://api.example.com/
# curl-format.txt: time_namelookup, time_connect, time_appconnect, etc.

# Node: log HTTP requests with debug flag
DEBUG=axios* node app.js   # for axios
NODE_DEBUG=http node app.js # for built-in http module
```

**In browser DevTools:**

1. Network tab → find the failing request
2. Click it → check: Status code, Response body, Request headers
3. Common: `401` (auth token expired or missing), `400` (request body malformed), `500` (server error — check server logs)

---

## Debugger usage (interactive)

**Node.js (built-in debugger):**

```bash
# Start with debugger
node --inspect-brk src/index.js

# Then open Chrome → chrome://inspect → click "Open dedicated DevTools for Node"
# Set breakpoints in source files
# Use the call stack panel to see the state at any point
```

**VS Code launch.json:**

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug current file",
  "program": "${file}",
  "runtimeArgs": ["--inspect-brk"],
  "skipFiles": ["<node_internals>/**", "node_modules/**"]
}
```

**Python pdb:**

```python
import pdb; pdb.set_trace()  # drop into interactive debugger
# or in Python 3.7+:
breakpoint()

# pdb commands:
# n — next line
# s — step into function
# c — continue until next breakpoint
# p variable_name — print value
# l — list source around current line
# q — quit
```
