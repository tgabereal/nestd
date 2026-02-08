# HouseWipe 🏠

> Tinder for houses. Swipe your way to your dream home.

A mobile-first real estate browsing app that scrapes Realtor.ca and presents listings in a swipeable interface.

## Features

- **Swipe Interface**: Tinder-style browsing - swipe right to like, left to pass, up for super-like
- **Smart Filtering**: Filter by price, beds, baths, location
- **Favorites**: Save and organize listings you love
- **Notes & Ratings**: Add personal notes and ratings to saved properties
- **Price Tracking**: Automatic alerts when prices change
- **Multi-user**: Full authentication with Clerk
- **PWA**: Install on your phone like a native app

## Architecture

```
housewipe/
├── scraper/          # Playwright-based Realtor.ca scraper
│   └── src/
│       ├── scraper.js    # Main scraper with proxy support
│       ├── db.js         # PostgreSQL database layer
│       └── index.js      # Entry point with scheduling
├── backend/          # Express API server
│   └── src/
│       └── index.js      # REST API with Clerk auth
├── frontend/         # React PWA
│   └── src/
│       ├── components/   # Swipe cards, UI components
│       ├── pages/        # Main app pages
│       ├── api.ts        # React Query hooks
│       └── App.tsx       # Main app with routing
└── docs/             # Documentation
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, PostgreSQL
- **Auth**: Clerk
- **Scraper**: Playwright with proxy support (webshare.io)
- **Hosting**: Railway (backend/DB) + Vercel (frontend)

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Clerk account (for auth)
- Webshare.io account (for proxy, optional)

### Environment Variables

Copy `.env.example` to `.env` in each directory:

```bash
# scraper/.env
DATABASE_URL=postgresql://...
WEBSHARE_USER=your_user
WEBSHARE_PASS=your_pass
GEOAPIFY_API_KEY=your_key

# backend/.env
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_test_...
FRONTEND_URL=http://localhost:5173

# frontend/.env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3001
```

### Development

```bash
# Install dependencies
cd scraper && npm install
cd ../backend && npm install
cd ../frontend && npm install

# Initialize database
cd scraper && node src/index.js init-db

# Run scraper once
node src/index.js once 50

# Start backend
cd ../backend && npm run dev

# Start frontend
cd ../frontend && npm run dev
```

### Production

Deploy to Railway (backend + scraper) and Vercel (frontend).

## Scraper Commands

```bash
# Scrape 50 listings once
node src/index.js once 50

# Scrape with max price filter
node src/index.js once 100 500000

# Run scheduled scraping (every 4 hours)
node src/index.js schedule

# Custom cron schedule
node src/index.js schedule "0 */2 * * *"
```

## API Endpoints

### Listings
- `GET /api/listings` - Get listings for swiping
- `GET /api/listings/:id` - Get listing details

### Swipes
- `POST /api/swipes` - Record a swipe

### Favorites
- `GET /api/favorites` - Get user's favorites
- `PUT /api/favorites/:id` - Update notes/rating
- `DELETE /api/favorites/:id` - Remove favorite

### Alerts
- `GET /api/alerts` - Get alerts
- `POST /api/alerts/:id/read` - Mark as read

### Saved Searches
- `GET /api/searches` - Get saved searches
- `POST /api/searches` - Create search
- `DELETE /api/searches/:id` - Delete search

### User
- `GET /api/me` - Get current user
- `GET /api/stats` - Get user stats

## License

MIT
