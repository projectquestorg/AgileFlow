# Deploy Workflow — Deployment Pipeline Setup

**Triggers:** "set up deployment", "configure CI/CD", "deploy to production", "I need a deployment pipeline", "configure Vercel/Netlify/Railway", "set up GitHub Actions for deploy"

**Goal:** Auto-detect the project type, recommend a deployment platform, generate configuration files, and create a CI/CD workflow — all previewed before any files are written.

## Inputs needed

| Input           | Required | How to get it                     |
| --------------- | -------- | --------------------------------- |
| project type    | No       | Auto-detected from codebase       |
| target platform | No       | Recommended based on project type |
| environments    | No       | Default: staging + production     |

## Steps

1. Auto-detect the project type by inspecting the codebase:
   - **Static**: `package.json` with only a build script, no server code
   - **Full-stack**: Next.js API routes, Express, FastAPI, or similar
   - **Mobile**: Expo config or react-native dependencies
   - **Containers**: `Dockerfile` present
   - **Serverless**: Lambda functions or `serverless.yml`
     If unclear, ask: "Is this a static site, a full-stack app, a containerized app, or serverless?"

2. Recommend a deployment platform based on the detected type:
   - Next.js → **Vercel** (native Next.js support)
   - React SPA / static → **Netlify** (built-in redirects, simple setup)
   - Node.js server → **Railway** (cheap, Docker-based)
   - Docker container → **Fly.io** (native container support)
   - Expo/React Native → **EAS** (official Expo deployment)
   - AWS preference → **Lambda + API Gateway**

3. Ask the user: "I recommend [platform] for your [project type]. Proceed, or would you prefer a different platform?"

4. Before creating any files, show a preview of everything that will be created:

   ```
   Deployment Setup for: [project type]
   Platform: [platform]

   Will create:
   - [platform config file] (e.g., vercel.json, netlify.toml, Dockerfile)
   - .github/workflows/deploy.yml (CI/CD pipeline)
   - .env.example (secrets template — actual secrets are never committed)
   - docs/02-practices/deployment.md (deployment guide)
   ```

5. Ask: [A] Create all files (recommended), [B] Create just the platform config, [C] Create just the CI/CD workflow, [D] Cancel.

6. Generate the selected files:
   - Platform config with staging and production environment separation
   - GitHub Actions workflow that deploys on push to `main` (production) and PRs (staging preview)
   - `.env.example` listing all required environment variables (no actual values)
   - Brief deployment guide in docs

7. List the secrets that need to be added to GitHub repository settings.

8. Ask: [A] Show me how to add the secrets to GitHub, [B] I'll handle the secrets myself — just give me the list, [C] Run a test deployment now.

## Output

Platform config file. GitHub Actions workflow. `.env.example` template. Deployment guide. List of required secrets.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
