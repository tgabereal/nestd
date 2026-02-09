# Nestd Deployment Guide

## ✅ COMPLETED

### 1. Railway Project
- **Project Name:** nestd
- **Project ID:** 4acfeebd-43db-4059-9c04-644caa045cf0
- **URL:** https://railway.com/project/4acfeebd-43db-4059-9c04-644caa045cf0

### 2. PostgreSQL Database
- **Status:** ✅ Online
- **Service:** Postgres
- **Volume:** postgres-volume (persistent)

### 3. GitHub Repository
- **URL:** https://github.com/tgabereal/nestd
- **Branch:** main
- **Status:** ✅ All code pushed

---

## ⏳ REMAINING: Backend Service Setup

### Step 1: Connect GitHub to Railway
1. Go to Railway project: https://railway.com/project/4acfeebd-43db-4059-9c04-644caa045cf0
2. Click **Create** → **GitHub Repository**
3. Click **"Configure your account on GitHub"** button
4. Authorize Railway app on GitHub
5. Select the **tgabereal/nestd** repository
6. Choose `/backend` as the root directory

### Step 2: Configure Build Settings
- **Root Directory:** `/backend`
- **Start Command:** `npm start` or `node src/index.js`
- **Build Command:** `npm install`

### Step 3: Set Environment Variables

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | Railway will auto-generate | Railway Postgres |
| `CLERK_SECRET_KEY` | sk_test_... | Clerk Dashboard |
| `FRONTEND_URL` | Your Vercel URL | After Vercel deploy |
| `PORT` | 3001 | Default |
| `NODE_ENV` | production | preset |

### Step 4: Link Database
1. Go to backend service settings
2. Add **Database** → Select existing Postgres
3. This auto-injects DATABASE_URL

### Step 5: Deploy
Click **Deploy** - Railway will auto-build and deploy!

---

## Environment Variables Reference

### Backend (Railway)
```
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_test_...
FRONTEND_URL=https://your-app.vercel.app
PORT=3001
NODE_ENV=production
```

### Frontend (Vercel)
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=https://your-backend.up.railway.app
```

### Scraper (Railway - optional)
```
DATABASE_URL=postgresql://...
WEBSHARE_USER=...
WEBSHARE_PASS=...
GEOAPIFY_API_KEY=...
HOME_LAT=43.8824
HOME_LNG=-79.4404
```

---

## Deployment URLs (After Setup)

| Service | URL Pattern |
|---------|-------------|
| Frontend | `https://nestd.vercel.app` |
| Backend | `https://nestd-production.up.railway.app` |
| API Endpoints | `https://nestd-production.up.railway.app/api/...` |
