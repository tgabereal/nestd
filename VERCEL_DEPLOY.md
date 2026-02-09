# Vercel Deployment Guide - Nestd Frontend

## ✅ What's Already Done
- Database: PostgreSQL with 7 tables deployed on Railway
- Backend: Express API deployed at https://nestd-production.up.railway.app
- Code: Pushed to https://github.com/tgabereal/nestd
- Config: Added `vercel.json` in repo root

## 🚀 Manual Vercel Deployment Steps

### Step 1: Import Repository
1. Go to https://vercel.com/new
2. Click "Continue with GitHub"
3. Find and select the `tgabereal/nestd` repository

### Step 2: Configure Project
If Vercel doesn't auto-detect settings, use these:
- **Framework Preset**: `Vite` or `Other`
- **Root Directory**: (leave empty, use root - since vercel.json is there)
- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/dist`

### Step 3: Environment Variables
Add these environment variables:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YW1hemVkLWNvbmRvci01MC5jbGVyay5hY2NvdW50cy5kZXYk
VITE_API_URL=https://nestd-production.up.railway.app
```

### Step 4: Deploy
Click "Deploy" and wait for the build to complete.

### Step 5: Update CORS (if needed)
If you get CORS errors, add your Vercel domain to the Railway backend CORS settings:
- Go to Railway dashboard → nestd service → Variables
- Add: `FRONTEND_URL=https://your-vercel-domain.vercel.app`

## 🔗 Important URLs
- Backend Health: https://nestd-production.up.railway.app/health
- Backend API: https://nestd-production.up.railway.app/api/scraper/listings
- GitHub Repo: https://github.com/tgabereal/nestd
- Railway Project: https://railway.com/project/4acfeebd-43db-4059-9c04-644caa045cf0

## 📁 Project Structure
```
nestd/
├── frontend/          # React + Vite (deploy to Vercel)
│   ├── src/
│   ├── index.html
│   └── vite.config.js
├── backend/           # Express + PostgreSQL (deployed on Railway)
│   ├── src/
│   │   ├── index.js
│   │   └── migrate.js
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── scraper/           # Playwright scraper (can run locally or on Railway)
    └── src/
        └── scraper.js
```

## 🧪 Testing After Deployment

### Test Backend Health
```bash
curl https://nestd-production.up.railway.app/health
```

### Test Listings Endpoint (without auth first)
```bash
curl -X POST https://nestd-production.up.railway.app/api/scraper/listings \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.realtor.ca/real-estate/","limit":2}'
```

### Test Protected Endpoints (with Clerk auth)
Use the deployed frontend to test authenticated endpoints.

## ⚠️ Known Issues
- Claude.ai usage: Currently at 65% weekly, 7% session
- Backend root directory was set to `/backend` in Railway for proper detection
- Database auto-migration runs on startup

## 🔧 Next Steps
1. Complete Vercel deployment (steps above)
2. Test full stack with Clerk authentication
3. Set up scheduled scraping (cron job on Railway)
4. Test mobile app features (swipe, favorites, alerts)

## 📞 Support
- Backend logs: Railway Dashboard → nestd service → Logs
- Database: Railway Dashboard → Postgres service → Database
- Frontend build logs: Vercel Dashboard → nestd project → Deployments
