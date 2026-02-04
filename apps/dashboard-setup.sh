#!/bin/bash
# Create Next.js dashboard app with shadcn/ui

set -e

echo "📦 Creating Next.js dashboard app..."

# Create Next.js app with TypeScript
npx create-next-app@latest dashboard --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes

cd dashboard

echo "🎨 Adding shadcn/ui..."

# Initialize shadcn/ui with Lyra style
npx shadcn@latest init -y --base-color neutral --css-variables --rsc --no-src-dir

echo "✅ Base setup complete!"
