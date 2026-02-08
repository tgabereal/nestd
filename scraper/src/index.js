/**
 * HouseWipe Scraper - Main Entry Point
 * Runs scheduled scrapes and stores results in PostgreSQL
 */

require('dotenv').config();
const cron = require('node-cron');
const { RealtorScraper } = require('./scraper');
const { Database } = require('./db');

const db = new Database();

/**
 * Geocode an address using Geoapify
 */
async function geocodeAddress(address) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return null;

  try {
    const cleanedAddress = address
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(cleanedAddress)}&filter=countrycode:ca&limit=1&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const coords = data.features[0].geometry.coordinates;
      return { lat: coords[1], lng: coords[0] };
    }
  } catch (err) {
    console.error('Geocoding error:', err.message);
  }
  return null;
}

/**
 * Run a full scrape
 */
async function runScrape(options = {}) {
  const {
    maxListings = 500,
    searchOptions = { maxPrice: 700000 },
  } = options;

  console.log('\n🏠 Starting HouseWipe scrape...');
  console.log(`   Max listings: ${maxListings}`);
  console.log(`   Search options:`, searchOptions);

  const runId = await db.startScrapeRun();
  const stats = { found: 0, new: 0, updated: 0, priceChanges: 0 };
  const activeListingIds = [];

  const scraper = new RealtorScraper({
    headless: process.env.HEADLESS !== 'false',
  });

  try {
    const listings = await scraper.scrape({
      maxListings,
      searchOptions,
      onPage: (page, total) => {
        console.log(`   📄 Page ${page}: ${total} listings so far`);
      },
    });

    console.log(`\n💾 Saving ${listings.length} listings to database...`);

    for (const listing of listings) {
      stats.found++;

      // Geocode if we don't have coordinates
      if (!listing.lat && listing.street) {
        const fullAddress = `${listing.street}, ${listing.town || ''}, ${listing.province || ''}, Canada`;
        const coords = await geocodeAddress(fullAddress);
        if (coords) {
          listing.lat = coords.lat;
          listing.lng = coords.lng;
        }
        // Rate limit geocoding
        await new Promise(r => setTimeout(r, 100));
      }

      const result = await db.upsertListing(listing);
      activeListingIds.push(result.listingId);

      if (result.isNew) {
        stats.new++;
        console.log(`   ✨ New: ${listing.street} - $${listing.price?.toLocaleString()}`);
      } else if (result.priceChanged) {
        stats.priceChanges++;
        const direction = result.newPrice < result.oldPrice ? '📉' : '📈';
        console.log(`   ${direction} Price change: ${listing.street} - $${result.oldPrice?.toLocaleString()} → $${result.newPrice?.toLocaleString()}`);
      } else {
        stats.updated++;
      }
    }

    // Mark old listings as inactive
    await db.markInactiveListings(activeListingIds);

    await db.completeScrapeRun(runId, stats);

    console.log('\n✅ Scrape complete!');
    console.log(`   Found: ${stats.found}`);
    console.log(`   New: ${stats.new}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Price changes: ${stats.priceChanges}`);

    return stats;

  } catch (err) {
    console.error('❌ Scrape failed:', err);
    await db.failScrapeRun(runId, err.message);
    throw err;
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'once';

  console.log('🏠 HouseWipe Scraper');
  console.log('====================\n');

  // Initialize database
  await db.init();

  switch (command) {
    case 'once':
      // Run once and exit
      await runScrape({
        maxListings: parseInt(args[1]) || 100,
        searchOptions: {
          maxPrice: parseInt(args[2]) || 700000,
        },
      });
      await db.close();
      break;

    case 'schedule':
      // Run on schedule (every 4 hours by default)
      const cronExpr = args[1] || '0 */4 * * *';
      console.log(`📅 Scheduling scrapes with cron: ${cronExpr}`);
      
      // Run immediately on start
      runScrape().catch(console.error);

      // Schedule future runs
      cron.schedule(cronExpr, async () => {
        console.log('\n⏰ Scheduled scrape triggered');
        try {
          await runScrape();
        } catch (err) {
          console.error('Scheduled scrape failed:', err);
        }
      });

      console.log('Scraper running. Press Ctrl+C to stop.\n');
      break;

    case 'init-db':
      // Just initialize database and exit
      console.log('✅ Database initialized');
      await db.close();
      break;

    default:
      console.log('Usage:');
      console.log('  node src/index.js once [maxListings] [maxPrice]  - Run once');
      console.log('  node src/index.js schedule [cron]                - Run on schedule');
      console.log('  node src/index.js init-db                        - Initialize database only');
      await db.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
