/**
 * HouseWipe Scraper - Realtor.ca Headless Scraper
 * Uses Playwright with proxy rotation for reliable scraping
 */

const { chromium } = require('playwright');

// Canadian provinces for validation
const PROVINCES = [
  'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba',
  'Saskatchewan', 'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador',
  'Prince Edward Island', 'Northwest Territories', 'Yukon', 'Nunavut'
];

const MAX_IMAGES = 80;

class RealtorScraper {
  constructor(options = {}) {
    this.proxyUser = options.proxyUser || process.env.WEBSHARE_USER;
    this.proxyPass = options.proxyPass || process.env.WEBSHARE_PASS;
    this.headless = options.headless !== false;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Get proxy configuration for webshare.io
   */
  getProxyConfig() {
    if (!this.proxyUser || !this.proxyPass) {
      console.log('⚠️  No proxy configured, running without proxy');
      return null;
    }

    return {
      server: 'http://p.webshare.io:80',
      username: this.proxyUser,
      password: this.proxyPass,
    };
  }

  /**
   * Initialize browser with stealth settings
   */
  async init() {
    const proxy = this.getProxyConfig();

    const launchOptions = {
      headless: this.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    };

    this.browser = await chromium.launch(launchOptions);

    const contextOptions = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-CA',
      timezoneId: 'America/Toronto',
    };

    if (proxy) {
      contextOptions.proxy = proxy;
    }

    this.context = await this.browser.newContext(contextOptions);
    
    // Add stealth scripts
    await this.context.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-CA', 'en-US', 'en'],
      });
    });

    this.page = await this.context.newPage();
    console.log('✅ Browser initialized');
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
  }

  /**
   * Generate high-res image URLs from a base image URL
   */
  generateImageUrls(baseImageUrl) {
    if (!baseImageUrl) return [];
    if (!baseImageUrl.includes('cdn.realtor.ca')) return [baseImageUrl];

    const highresUrl = baseImageUrl.replace('/lowres/', '/highres/');
    const match = highresUrl.match(/^(.+_)(\d+)(\.jpg)$/i);
    if (!match) return [highresUrl];

    const [, prefix, , extension] = match;
    return Array.from({ length: MAX_IMAGES }, (_, i) => `${prefix}${i + 1}${extension}`);
  }

  /**
   * Extract listing data from a card element
   */
  async extractListingFromCard(cardHandle) {
    try {
      const data = await cardHandle.evaluate((card, { PROVINCES }) => {
        const fullText = card.textContent || '';

        // Price
        let price = null;
        const priceMatch = fullText.match(/\$[\d,]+/);
        if (priceMatch) {
          price = parseInt(priceMatch[0].replace(/[$,]/g, ''), 10);
        }
        if (!price) {
          const priceDiv = card.querySelector('div[data-value-cad]');
          if (priceDiv) {
            price = parseInt(priceDiv.getAttribute('data-value-cad').replace(/[^\d]/g, ''), 10);
          }
        }

        // Address
        let street = null, town = null, province = null, detailUrl = null;
        const addressLink = Array.from(card.querySelectorAll('a')).find(a => 
          (a.href || '').includes('real-estate')
        );

        if (addressLink) {
          detailUrl = addressLink.href;
          const addressDiv = addressLink.querySelector('.smallListingCardAddress');
          
          if (addressDiv) {
            const addressText = addressDiv.textContent.trim().replace(/\s+/g, ' ');
            const parts = addressText.split(',').map(p => p.trim()).filter(p => p);

            if (parts.length >= 3) {
              street = parts[0];
              town = parts[1];
              const provinceRaw = parts[parts.length - 1];
              for (const prov of PROVINCES) {
                if (provinceRaw.toLowerCase().includes(prov.toLowerCase())) {
                  province = prov;
                  break;
                }
              }
              if (!province) province = provinceRaw.split(/\s{2,}/)[0].trim();
            } else if (parts.length === 2) {
              street = parts[0];
              for (const prov of PROVINCES) {
                if (parts[1].toLowerCase().includes(prov.toLowerCase())) {
                  province = prov;
                  town = parts[1].replace(prov, '').trim();
                  break;
                }
              }
              if (!province) town = parts[1];
            }
          }
        }

        if (!street) return null;

        // Beds/Baths/Sqft
        const bedsMatch = fullText.match(/(\d+)\s*Bedrooms?/i);
        const beds = bedsMatch ? parseInt(bedsMatch[1], 10) : 0;

        const bathsMatch = fullText.match(/(\d+)\s*Bathrooms?/i);
        const baths = bathsMatch ? parseInt(bathsMatch[1], 10) : 0;

        const sqftMatch = fullText.match(/([\d,]+)\+?\s*sqft/i);
        const sqft = sqftMatch ? parseInt(sqftMatch[1].replace(',', ''), 10) : null;

        // Time ago
        const timeMatch = fullText.match(/(\d+)\s+(hour|day|week|min)s?\s+ago/i);
        let listedAt = null;
        if (timeMatch) {
          const amount = parseInt(timeMatch[1], 10);
          const unit = timeMatch[2].toLowerCase();
          const now = new Date();
          if (unit === 'hour' || unit === 'min') {
            now.setHours(now.getHours() - (unit === 'min' ? 0 : amount));
          } else if (unit === 'day') {
            now.setDate(now.getDate() - amount);
          } else if (unit === 'week') {
            now.setDate(now.getDate() - amount * 7);
          }
          listedAt = now.toISOString();
        }

        // Image
        let imageUrl = null;
        const img = card.querySelector('img.smallListingCardImage') || 
                    card.querySelector('img[src*="cdn.realtor.ca"]');
        if (img && img.src) imageUrl = img.src;

        return {
          price,
          street,
          town,
          province,
          beds,
          baths,
          sqft,
          listedAt,
          imageUrl,
          detailUrl,
        };
      }, { PROVINCES });

      if (!data) return null;

      // Generate all image URLs
      data.imageUrls = this.generateImageUrls(data.imageUrl);
      data.scrapedAt = new Date().toISOString();

      return data;
    } catch (err) {
      console.error('Error extracting listing:', err.message);
      return null;
    }
  }

  /**
   * Scrape a search results page
   */
  async scrapePage() {
    const cards = await this.page.$$('.cardCon');
    const listings = [];

    for (const card of cards) {
      const listing = await this.extractListingFromCard(card);
      if (listing) {
        listings.push(listing);
      }
    }

    return listings;
  }

  /**
   * Navigate to next page
   * Returns true if successful, false if no more pages
   */
  async goToNextPage() {
    const nextBtn = await this.page.$('a[aria-label*="next"]');
    if (!nextBtn) return false;

    const isVisible = await nextBtn.isVisible();
    if (!isVisible) return false;

    // Get first listing URL to detect page change
    const firstCard = await this.page.$('.cardCon a[href*="real-estate"]');
    const firstUrl = firstCard ? await firstCard.getAttribute('href') : null;

    await nextBtn.click();

    // Wait for page to change
    try {
      await this.page.waitForFunction(
        (prevUrl) => {
          const firstLink = document.querySelector('.cardCon a[href*="real-estate"]');
          return firstLink && firstLink.href !== prevUrl;
        },
        firstUrl,
        { timeout: 10000 }
      );
      await this.page.waitForTimeout(500); // Let cards fully render
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build search URL with filters
   */
  buildSearchUrl(options = {}) {
    const params = new URLSearchParams();
    
    // Base map coordinates (default: Ontario)
    const lat = options.lat || 43.65;
    const lng = options.lng || -79.38;
    const zoom = options.zoom || 8;

    let url = `https://www.realtor.ca/map#ZoomLevel=${zoom}&Center=${lat}%2C${lng}`;
    
    if (options.minPrice) url += `&PriceMin=${options.minPrice}`;
    if (options.maxPrice) url += `&PriceMax=${options.maxPrice}`;
    if (options.beds) url += `&BedRange=${options.beds}-0`;
    if (options.baths) url += `&BathRange=${options.baths}-0`;
    if (options.propertyType) url += `&PropertyTypeGroupID=${options.propertyType}`;
    
    url += '&Sort=6-D'; // Sort by newest
    url += '&PropertySearchTypeId=1'; // For sale
    url += '&TransactionTypeId=2'; // Residential
    
    return url;
  }

  /**
   * Main scrape function
   */
  async scrape(options = {}) {
    const {
      maxListings = 100,
      maxPages = 50,
      searchOptions = {},
      onListing = null,
      onPage = null,
    } = options;

    await this.init();

    try {
      const url = this.buildSearchUrl(searchOptions);
      console.log(`🔍 Navigating to: ${url}`);
      
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Wait for listings to load
      await this.page.waitForSelector('.cardCon', { timeout: 30000 });
      
      const allListings = [];
      let pageNum = 0;
      const seenUrls = new Set();

      while (pageNum < maxPages && allListings.length < maxListings) {
        pageNum++;
        console.log(`📄 Scraping page ${pageNum}...`);

        const pageListings = await this.scrapePage();
        let addedCount = 0;

        for (const listing of pageListings) {
          if (allListings.length >= maxListings) break;
          if (listing.detailUrl && seenUrls.has(listing.detailUrl)) continue;

          if (listing.detailUrl) seenUrls.add(listing.detailUrl);
          allListings.push(listing);
          addedCount++;

          if (onListing) await onListing(listing);
        }

        console.log(`   ✅ Page ${pageNum}: +${addedCount} listings (total: ${allListings.length})`);
        if (onPage) await onPage(pageNum, allListings.length);

        if (allListings.length >= maxListings) break;

        const hasNext = await this.goToNextPage();
        if (!hasNext) {
          console.log('📭 No more pages');
          break;
        }
      }

      console.log(`\n✅ Scraping complete: ${allListings.length} listings`);
      return allListings;

    } finally {
      await this.close();
    }
  }
}

module.exports = { RealtorScraper };
