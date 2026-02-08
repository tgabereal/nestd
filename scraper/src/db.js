/**
 * Database service for HouseWipe
 * Handles PostgreSQL connections and queries
 */

const { Pool } = require('pg');

class Database {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Initialize database schema
   */
  async init() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        -- Listings table
        CREATE TABLE IF NOT EXISTS listings (
          id SERIAL PRIMARY KEY,
          realtor_url TEXT UNIQUE NOT NULL,
          price INTEGER,
          street TEXT NOT NULL,
          town TEXT,
          province TEXT,
          beds INTEGER DEFAULT 0,
          baths INTEGER DEFAULT 0,
          sqft INTEGER,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          image_urls TEXT[], -- Array of image URLs
          listed_at TIMESTAMPTZ,
          first_seen_at TIMESTAMPTZ DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ DEFAULT NOW(),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Price history for tracking changes
        CREATE TABLE IF NOT EXISTS price_history (
          id SERIAL PRIMARY KEY,
          listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
          price INTEGER NOT NULL,
          recorded_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Users table
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          clerk_id TEXT UNIQUE NOT NULL,
          email TEXT,
          name TEXT,
          avatar_url TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Saved searches
        CREATE TABLE IF NOT EXISTS saved_searches (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          min_price INTEGER,
          max_price INTEGER,
          min_beds INTEGER,
          min_baths INTEGER,
          towns TEXT[], -- Array of town names
          provinces TEXT[], -- Array of provinces
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          radius_km INTEGER,
          alerts_enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- User favorites
        CREATE TABLE IF NOT EXISTS favorites (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
          notes TEXT,
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, listing_id)
        );

        -- User swipes (for the Tinder-like UI)
        CREATE TABLE IF NOT EXISTS swipes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
          direction TEXT CHECK (direction IN ('left', 'right', 'super')),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, listing_id)
        );

        -- Alerts sent to users
        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
          saved_search_id INTEGER REFERENCES saved_searches(id) ON DELETE CASCADE,
          alert_type TEXT CHECK (alert_type IN ('new_listing', 'price_drop', 'price_increase')),
          old_price INTEGER,
          new_price INTEGER,
          sent_at TIMESTAMPTZ,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Scrape runs log
        CREATE TABLE IF NOT EXISTS scrape_runs (
          id SERIAL PRIMARY KEY,
          started_at TIMESTAMPTZ DEFAULT NOW(),
          finished_at TIMESTAMPTZ,
          listings_found INTEGER DEFAULT 0,
          listings_new INTEGER DEFAULT 0,
          listings_updated INTEGER DEFAULT 0,
          price_changes INTEGER DEFAULT 0,
          status TEXT DEFAULT 'running',
          error TEXT
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
        CREATE INDEX IF NOT EXISTS idx_listings_town ON listings(town);
        CREATE INDEX IF NOT EXISTS idx_listings_province ON listings(province);
        CREATE INDEX IF NOT EXISTS idx_listings_beds ON listings(beds);
        CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);
        CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(lat, lng);
        CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
        CREATE INDEX IF NOT EXISTS idx_swipes_user ON swipes(user_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
        CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id);
      `);
      console.log('✅ Database schema initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Start a scrape run
   */
  async startScrapeRun() {
    const result = await this.pool.query(
      'INSERT INTO scrape_runs DEFAULT VALUES RETURNING id'
    );
    return result.rows[0].id;
  }

  /**
   * Complete a scrape run
   */
  async completeScrapeRun(runId, stats) {
    await this.pool.query(
      `UPDATE scrape_runs 
       SET finished_at = NOW(), 
           listings_found = $2, 
           listings_new = $3, 
           listings_updated = $4,
           price_changes = $5,
           status = 'completed'
       WHERE id = $1`,
      [runId, stats.found, stats.new, stats.updated, stats.priceChanges]
    );
  }

  /**
   * Fail a scrape run
   */
  async failScrapeRun(runId, error) {
    await this.pool.query(
      `UPDATE scrape_runs 
       SET finished_at = NOW(), 
           status = 'failed',
           error = $2
       WHERE id = $1`,
      [runId, error]
    );
  }

  /**
   * Upsert a listing
   * Returns { listing, isNew, priceChanged, oldPrice }
   */
  async upsertListing(data) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if listing exists
      const existing = await client.query(
        'SELECT id, price FROM listings WHERE realtor_url = $1',
        [data.detailUrl]
      );

      let listingId;
      let isNew = false;
      let priceChanged = false;
      let oldPrice = null;

      if (existing.rows.length === 0) {
        // New listing
        const result = await client.query(
          `INSERT INTO listings 
           (realtor_url, price, street, town, province, beds, baths, sqft, lat, lng, image_urls, listed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            data.detailUrl,
            data.price,
            data.street,
            data.town,
            data.province,
            data.beds,
            data.baths,
            data.sqft,
            data.lat || null,
            data.lng || null,
            data.imageUrls || [],
            data.listedAt ? new Date(data.listedAt) : null,
          ]
        );
        listingId = result.rows[0].id;
        isNew = true;

        // Record initial price
        if (data.price) {
          await client.query(
            'INSERT INTO price_history (listing_id, price) VALUES ($1, $2)',
            [listingId, data.price]
          );
        }
      } else {
        // Existing listing - update
        listingId = existing.rows[0].id;
        oldPrice = existing.rows[0].price;

        await client.query(
          `UPDATE listings 
           SET price = $2, 
               last_seen_at = NOW(), 
               updated_at = NOW(),
               is_active = TRUE,
               image_urls = COALESCE($3, image_urls)
           WHERE id = $1`,
          [listingId, data.price, data.imageUrls]
        );

        // Check for price change
        if (data.price && oldPrice && data.price !== oldPrice) {
          priceChanged = true;
          await client.query(
            'INSERT INTO price_history (listing_id, price) VALUES ($1, $2)',
            [listingId, data.price]
          );
        }
      }

      await client.query('COMMIT');

      return {
        listingId,
        isNew,
        priceChanged,
        oldPrice,
        newPrice: data.price,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mark listings not seen in recent scrape as inactive
   */
  async markInactiveListings(activeIds) {
    if (activeIds.length === 0) return;

    await this.pool.query(
      `UPDATE listings 
       SET is_active = FALSE, updated_at = NOW()
       WHERE id NOT IN (SELECT UNNEST($1::int[]))
       AND is_active = TRUE
       AND last_seen_at < NOW() - INTERVAL '24 hours'`,
      [activeIds]
    );
  }

  /**
   * Get listings for a user (excluding already swiped)
   */
  async getListingsForUser(userId, options = {}) {
    const { limit = 50, offset = 0, filters = {} } = options;

    let whereConditions = ['l.is_active = TRUE'];
    let params = [];
    let paramIndex = 1;

    // Exclude already swiped listings
    whereConditions.push(`
      NOT EXISTS (
        SELECT 1 FROM swipes s 
        WHERE s.user_id = $${paramIndex} AND s.listing_id = l.id
      )
    `);
    params.push(userId);
    paramIndex++;

    // Apply filters
    if (filters.minPrice) {
      whereConditions.push(`l.price >= $${paramIndex}`);
      params.push(filters.minPrice);
      paramIndex++;
    }
    if (filters.maxPrice) {
      whereConditions.push(`l.price <= $${paramIndex}`);
      params.push(filters.maxPrice);
      paramIndex++;
    }
    if (filters.minBeds) {
      whereConditions.push(`l.beds >= $${paramIndex}`);
      params.push(filters.minBeds);
      paramIndex++;
    }
    if (filters.minBaths) {
      whereConditions.push(`l.baths >= $${paramIndex}`);
      params.push(filters.minBaths);
      paramIndex++;
    }
    if (filters.province) {
      whereConditions.push(`l.province = $${paramIndex}`);
      params.push(filters.province);
      paramIndex++;
    }

    params.push(limit, offset);

    const result = await this.pool.query(
      `SELECT l.*, 
              (SELECT COUNT(*) FROM favorites f WHERE f.listing_id = l.id) as favorite_count
       FROM listings l
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY l.listed_at DESC NULLS LAST, l.first_seen_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return result.rows;
  }

  /**
   * Record a swipe
   */
  async recordSwipe(userId, listingId, direction) {
    await this.pool.query(
      `INSERT INTO swipes (user_id, listing_id, direction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, listing_id) 
       DO UPDATE SET direction = $3, created_at = NOW()`,
      [userId, listingId, direction]
    );

    // If right swipe or super, also add to favorites
    if (direction === 'right' || direction === 'super') {
      await this.pool.query(
        `INSERT INTO favorites (user_id, listing_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, listing_id) DO NOTHING`,
        [userId, listingId]
      );
    }
  }

  /**
   * Get user's favorites
   */
  async getFavorites(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await this.pool.query(
      `SELECT l.*, f.notes, f.rating, f.created_at as favorited_at,
              (SELECT array_agg(json_build_object('price', ph.price, 'recorded_at', ph.recorded_at) ORDER BY ph.recorded_at)
               FROM price_history ph WHERE ph.listing_id = l.id) as price_history
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Update favorite notes/rating
   */
  async updateFavorite(userId, listingId, { notes, rating }) {
    await this.pool.query(
      `UPDATE favorites 
       SET notes = COALESCE($3, notes),
           rating = COALESCE($4, rating),
           updated_at = NOW()
       WHERE user_id = $1 AND listing_id = $2`,
      [userId, listingId, notes, rating]
    );
  }

  /**
   * Get or create user by Clerk ID
   */
  async getOrCreateUser(clerkId, userData = {}) {
    const existing = await this.pool.query(
      'SELECT * FROM users WHERE clerk_id = $1',
      [clerkId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const result = await this.pool.query(
      `INSERT INTO users (clerk_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [clerkId, userData.email, userData.name, userData.avatarUrl]
    );

    return result.rows[0];
  }

  /**
   * Create alert for price change or new listing
   */
  async createAlert(userId, listingId, type, savedSearchId = null, oldPrice = null, newPrice = null) {
    await this.pool.query(
      `INSERT INTO alerts (user_id, listing_id, saved_search_id, alert_type, old_price, new_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, listingId, savedSearchId, type, oldPrice, newPrice]
    );
  }

  /**
   * Get unread alerts for user
   */
  async getUnreadAlerts(userId) {
    const result = await this.pool.query(
      `SELECT a.*, l.street, l.town, l.price, l.image_urls[1] as image_url
       FROM alerts a
       JOIN listings l ON l.id = a.listing_id
       WHERE a.user_id = $1 AND a.read_at IS NULL
       ORDER BY a.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = { Database };
