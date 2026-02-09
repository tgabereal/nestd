/**
 * Nestd Backend API
 * Express server with Clerk authentication
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { clerkMiddleware, requireAuth, getAuth } = require('@clerk/express');
const { Pool } = require('pg');
const { schema } = require('./migrate');

const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Auto-run migrations on startup
async function initDatabase() {
  try {
    console.log('🔄 Checking database tables...');
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'listings'
    `);
    
    if (result.rows.length === 0) {
      console.log('📦 Running database migrations...');
      await pool.query(schema);
      console.log('✅ Database initialized successfully!');
    } else {
      console.log('✅ Database tables already exist');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
  }
}

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(clerkMiddleware());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ SCRAPER ENDPOINT (from Tampermonkey) ============

/**
 * POST /api/scraper/listings
 * Receives listings from Tampermonkey script
 * No auth required (uses API key or open)
 */
app.post('/api/scraper/listings', async (req, res) => {
  try {
    const { listings } = req.body;
    
    if (!listings || !Array.isArray(listings)) {
      return res.status(400).json({ success: false, message: 'Invalid listings data' });
    }

    console.log(`[Scraper] Received ${listings.length} listings`);

    let added = 0, updated = 0, priceChanges = 0;

    for (const listing of listings) {
      // Check if listing exists
      const existing = await pool.query(
        'SELECT id, price FROM listings WHERE realtor_url = $1',
        [listing.detailUrl]
      );

      if (existing.rows.length === 0) {
        // New listing
        await pool.query(
          `INSERT INTO listings 
           (realtor_url, price, street, town, province, beds, baths, sqft, image_urls, listed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            listing.detailUrl,
            listing.price,
            listing.street,
            listing.town,
            listing.province,
            listing.beds || 0,
            listing.baths || 0,
            listing.sqft,
            listing.imageUrls || [],
            listing.listedAt ? new Date(listing.listedAt) : null,
          ]
        );
        added++;

        // Record initial price
        const newListing = await pool.query(
          'SELECT id FROM listings WHERE realtor_url = $1',
          [listing.detailUrl]
        );
        if (newListing.rows.length > 0 && listing.price) {
          await pool.query(
            'INSERT INTO price_history (listing_id, price) VALUES ($1, $2)',
            [newListing.rows[0].id, listing.price]
          );
        }
      } else {
        // Existing listing - update
        const oldPrice = existing.rows[0].price;
        const listingId = existing.rows[0].id;

        await pool.query(
          `UPDATE listings 
           SET price = $2, last_seen_at = NOW(), updated_at = NOW(), is_active = TRUE
           WHERE id = $1`,
          [listingId, listing.price]
        );
        updated++;

        // Check for price change
        if (listing.price && oldPrice && listing.price !== oldPrice) {
          priceChanges++;
          await pool.query(
            'INSERT INTO price_history (listing_id, price) VALUES ($1, $2)',
            [listingId, listing.price]
          );
          console.log(`[Scraper] Price change: ${listing.street} - $${oldPrice} → $${listing.price}`);
        }
      }
    }

    console.log(`[Scraper] Results: ${added} new, ${updated} updated, ${priceChanges} price changes`);

    res.json({
      success: true,
      added,
      updated,
      priceChanges,
      total: listings.length
    });
  } catch (err) {
    console.error('[Scraper] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============ AUTH HELPERS ============

/**
 * Get or create user from Clerk auth
 */
async function getOrCreateUser(clerkUserId, userData = {}) {
  const existing = await pool.query(
    'SELECT * FROM users WHERE clerk_id = $1',
    [clerkUserId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO users (clerk_id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clerkUserId, userData.email, userData.name, userData.avatarUrl]
  );

  return result.rows[0];
}

/**
 * Auth middleware that also loads user
 */
const withUser = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.dbUser = await getOrCreateUser(userId);
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============ LISTINGS ENDPOINTS ============

/**
 * GET /api/listings
 * Get listings for swiping (excludes already swiped)
 */
app.get('/api/listings', requireAuth(), withUser, async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0,
      minPrice,
      maxPrice,
      minBeds,
      minBaths,
      province,
    } = req.query;

    const userId = req.dbUser.id;

    let whereConditions = ['l.is_active = TRUE'];
    let params = [userId];
    let paramIndex = 2;

    // Exclude already swiped
    whereConditions.push(`
      NOT EXISTS (
        SELECT 1 FROM swipes s 
        WHERE s.user_id = $1 AND s.listing_id = l.id
      )
    `);

    if (minPrice) {
      whereConditions.push(`l.price >= $${paramIndex}`);
      params.push(parseInt(minPrice));
      paramIndex++;
    }
    if (maxPrice) {
      whereConditions.push(`l.price <= $${paramIndex}`);
      params.push(parseInt(maxPrice));
      paramIndex++;
    }
    if (minBeds) {
      whereConditions.push(`l.beds >= $${paramIndex}`);
      params.push(parseInt(minBeds));
      paramIndex++;
    }
    if (minBaths) {
      whereConditions.push(`l.baths >= $${paramIndex}`);
      params.push(parseInt(minBaths));
      paramIndex++;
    }
    if (province) {
      whereConditions.push(`l.province = $${paramIndex}`);
      params.push(province);
      paramIndex++;
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(
      `SELECT l.id, l.realtor_url, l.price, l.street, l.town, l.province,
              l.beds, l.baths, l.sqft, l.lat, l.lng, l.image_urls,
              l.listed_at, l.first_seen_at
       FROM listings l
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY l.listed_at DESC NULLS LAST, l.first_seen_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      listings: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('Error fetching listings:', err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

/**
 * GET /api/listings/:id
 * Get single listing details
 */
app.get('/api/listings/:id', requireAuth(), withUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.dbUser.id;

    const result = await pool.query(
      `SELECT l.*, 
              f.id as favorite_id, f.notes, f.rating,
              (SELECT array_agg(json_build_object('price', ph.price, 'recorded_at', ph.recorded_at) ORDER BY ph.recorded_at)
               FROM price_history ph WHERE ph.listing_id = l.id) as price_history
       FROM listings l
       LEFT JOIN favorites f ON f.listing_id = l.id AND f.user_id = $2
       WHERE l.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching listing:', err);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// ============ SWIPE ENDPOINTS ============

/**
 * POST /api/swipes
 * Record a swipe (left/right/super)
 */
app.post('/api/swipes', requireAuth(), withUser, async (req, res) => {
  try {
    const { listingId, direction } = req.body;
    const userId = req.dbUser.id;

    if (!['left', 'right', 'super'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid swipe direction' });
    }

    await pool.query(
      `INSERT INTO swipes (user_id, listing_id, direction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, listing_id) 
       DO UPDATE SET direction = $3, created_at = NOW()`,
      [userId, listingId, direction]
    );

    // Auto-favorite on right swipe or super
    if (direction === 'right' || direction === 'super') {
      await pool.query(
        `INSERT INTO favorites (user_id, listing_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, listing_id) DO NOTHING`,
        [userId, listingId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error recording swipe:', err);
    res.status(500).json({ error: 'Failed to record swipe' });
  }
});

// ============ FAVORITES ENDPOINTS ============

/**
 * GET /api/favorites
 * Get user's favorite listings
 */
app.get('/api/favorites', requireAuth(), withUser, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.dbUser.id;

    const result = await pool.query(
      `SELECT l.*, f.notes, f.rating, f.created_at as favorited_at,
              (SELECT array_agg(json_build_object('price', ph.price, 'recorded_at', ph.recorded_at) ORDER BY ph.recorded_at)
               FROM price_history ph WHERE ph.listing_id = l.id) as price_history
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      favorites: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

/**
 * PUT /api/favorites/:listingId
 * Update favorite notes/rating
 */
app.put('/api/favorites/:listingId', requireAuth(), withUser, async (req, res) => {
  try {
    const { listingId } = req.params;
    const { notes, rating } = req.body;
    const userId = req.dbUser.id;

    await pool.query(
      `UPDATE favorites 
       SET notes = COALESCE($3, notes),
           rating = COALESCE($4, rating),
           updated_at = NOW()
       WHERE user_id = $1 AND listing_id = $2`,
      [userId, listingId, notes, rating]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating favorite:', err);
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

/**
 * DELETE /api/favorites/:listingId
 * Remove from favorites
 */
app.delete('/api/favorites/:listingId', requireAuth(), withUser, async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.dbUser.id;

    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2',
      [userId, listingId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing favorite:', err);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// ============ ALERTS ENDPOINTS ============

/**
 * GET /api/alerts
 * Get user's alerts
 */
app.get('/api/alerts', requireAuth(), withUser, async (req, res) => {
  try {
    const { unreadOnly = false, limit = 50 } = req.query;
    const userId = req.dbUser.id;

    let whereClause = 'a.user_id = $1';
    if (unreadOnly === 'true') {
      whereClause += ' AND a.read_at IS NULL';
    }

    const result = await pool.query(
      `SELECT a.*, l.street, l.town, l.price, l.image_urls[1] as image_url
       FROM alerts a
       JOIN listings l ON l.id = a.listing_id
       WHERE ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [userId, parseInt(limit)]
    );

    res.json({
      alerts: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * POST /api/alerts/:id/read
 * Mark alert as read
 */
app.post('/api/alerts/:id/read', requireAuth(), withUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.dbUser.id;

    await pool.query(
      'UPDATE alerts SET read_at = NOW() WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking alert read:', err);
    res.status(500).json({ error: 'Failed to mark alert read' });
  }
});

// ============ SAVED SEARCHES ENDPOINTS ============

/**
 * GET /api/searches
 * Get user's saved searches
 */
app.get('/api/searches', requireAuth(), withUser, async (req, res) => {
  try {
    const userId = req.dbUser.id;

    const result = await pool.query(
      `SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      searches: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error('Error fetching searches:', err);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

/**
 * POST /api/searches
 * Create a saved search
 */
app.post('/api/searches', requireAuth(), withUser, async (req, res) => {
  try {
    const { name, minPrice, maxPrice, minBeds, minBaths, towns, provinces, lat, lng, radiusKm, alertsEnabled } = req.body;
    const userId = req.dbUser.id;

    const result = await pool.query(
      `INSERT INTO saved_searches 
       (user_id, name, min_price, max_price, min_beds, min_baths, towns, provinces, lat, lng, radius_km, alerts_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [userId, name, minPrice, maxPrice, minBeds, minBaths, towns, provinces, lat, lng, radiusKm, alertsEnabled ?? true]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating search:', err);
    res.status(500).json({ error: 'Failed to create search' });
  }
});

/**
 * DELETE /api/searches/:id
 * Delete a saved search
 */
app.delete('/api/searches/:id', requireAuth(), withUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.dbUser.id;

    await pool.query(
      'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting search:', err);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

// ============ STATS ENDPOINTS ============

/**
 * GET /api/stats
 * Get user's stats
 */
app.get('/api/stats', requireAuth(), withUser, async (req, res) => {
  try {
    const userId = req.dbUser.id;

    const [swipes, favorites, alerts] = await Promise.all([
      pool.query(
        `SELECT direction, COUNT(*) as count 
         FROM swipes WHERE user_id = $1 
         GROUP BY direction`,
        [userId]
      ),
      pool.query(
        'SELECT COUNT(*) as count FROM favorites WHERE user_id = $1',
        [userId]
      ),
      pool.query(
        'SELECT COUNT(*) as count FROM alerts WHERE user_id = $1 AND read_at IS NULL',
        [userId]
      ),
    ]);

    const swipeStats = swipes.rows.reduce((acc, row) => {
      acc[row.direction] = parseInt(row.count);
      return acc;
    }, { left: 0, right: 0, super: 0 });

    res.json({
      swipes: swipeStats,
      totalSwipes: swipeStats.left + swipeStats.right + swipeStats.super,
      favorites: parseInt(favorites.rows[0].count),
      unreadAlerts: parseInt(alerts.rows[0].count),
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============ USER ENDPOINTS ============

/**
 * GET /api/me
 * Get current user info
 */
app.get('/api/me', requireAuth(), withUser, async (req, res) => {
  res.json(req.dbUser);
});

// ============ SERVER-SIDE SCRAPER (DISABLED - runs as separate service) ============
// const scraperServer = require('./routes/scraper-server');
// app.use('/api/scraper-server', scraperServer);

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server with database initialization
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Nestd API running on port ${port}`);
  });
});
