# AgileFlow connected service. Build from the repository root:
#   docker build -f apps/cloud/Dockerfile -t agileflow-cloud .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/cli/package.json apps/cli/
COPY apps/cloud/package.json apps/cloud/
COPY apps/cloud/dashboard/package.json apps/cloud/dashboard/
COPY packages packages
RUN npm ci --workspaces --include-workspace-root --ignore-scripts
COPY tsconfig.json ./
COPY apps/cloud apps/cloud
RUN npm run build -w apps/cloud/dashboard

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8787
WORKDIR /repo
COPY --from=build /repo /repo
USER node
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "apps/cloud/src/server.ts"]
