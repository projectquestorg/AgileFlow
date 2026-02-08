# AgileFlow Dashboard Deployment Guide

## Prerequisites

- Vercel account connected to GitHub
- Supabase project created at [supabase.com](https://supabase.com)

## 1. Supabase Setup

### Database Schema

Run the migration in your Supabase SQL Editor:

```
supabase/migrations/001_initial_schema.sql
```

This creates:
- `user_profiles` — auto-populated from GitHub OAuth
- `projects` — per-user dashboard projects
- `api_keys` — hashed API keys for WebSocket auth

### Enable GitHub OAuth

1. Go to **Authentication > Providers > GitHub** in your Supabase dashboard
2. Create a GitHub OAuth App at https://github.com/settings/developers
   - **Homepage URL**: Your Vercel deployment URL
   - **Authorization callback URL**: `https://<your-project>.supabase.co/auth/v1/callback`
3. Copy the Client ID and Client Secret into Supabase

### Redirect URLs

In **Authentication > URL Configuration**:
- **Site URL**: `https://your-dashboard.vercel.app`
- **Redirect URLs**: Add `https://your-dashboard.vercel.app/auth/callback`

## 2. Environment Variables

Set these in your Vercel project settings (**Settings > Environment Variables**):

| Variable | Description | Where to find |
|----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key | Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) | Settings > API |

## 3. Vercel Deployment

The dashboard auto-deploys from the `apps/dashboard` directory when pushed to GitHub.

### Build Settings (auto-detected)
- **Framework**: Next.js
- **Root Directory**: `apps/dashboard`
- **Build Command**: `npm run build`
- **Install Command**: `npm install`

### Custom Domain (optional)

1. Go to **Settings > Domains** in Vercel
2. Add your custom domain
3. Update the Supabase **Site URL** and **Redirect URLs** to match

## 4. Post-Deploy Verification

1. Visit `/login` — GitHub login button should appear
2. Complete OAuth flow — should redirect to dashboard
3. Visit `/settings/keys` — API key management works
4. Visit `/settings/projects` — project creation works
5. Check browser console for Supabase connection errors

## Security Headers

The `vercel.json` includes these security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Troubleshooting

### "Invalid redirect" during OAuth
- Verify the callback URL in both GitHub OAuth App and Supabase matches exactly
- Ensure the Site URL in Supabase matches your deployment URL

### Missing environment variables
- Check Vercel logs — Supabase client will throw if `NEXT_PUBLIC_SUPABASE_URL` is missing
- Redeploy after adding environment variables
