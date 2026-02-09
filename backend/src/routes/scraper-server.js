/**
 * Server-side scraper endpoint
 * Runs Playwright scraping directly from backend
 */

const express = require('express');
const { chromium } = require('playwright');
const router = express.Router();

// Canadian provinces for validation
const PROVINCES = [
  'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan',
  'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador', 'Prince Edward Island',
  'Northwest Territories', 'Yukon', 'Nunavut'
];

const MAX_IMAGES = 80;

class ServerScraper {
  constructor(options = {}) {
    this.proxyUser = options.proxyUser || process.env.WEBSHARE_USER;
    this.proxyPass = options.proxyPass || process.env.WEBSHARE_PASS;
    this.headless = options.headless !== false;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  getProxyConfig() {
    if (!this.proxyUser || !this.proxyPass) {
      console.log('⚠️ No proxy configured');
      return null;
    }
    return {
      server: 'http://p.webshare.io:80',
      username: this.proxyUser,
      password: this.proxyPass,
    };
  }

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
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
      locale: 'en-CA',
      timezoneId: 'America/Toronto',
    };

    if (proxy) contextOptions.proxy = proxy;

    this.context = await this.browser.newContext(contextOptions);
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en-US', 'en'] });
    });

    this.page = await this.context.newPage();
    console.log('Browser initialized');
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  generateImageUrls(baseUrl) {
    if (!baseUrl) return [];
    if (!baseUrl.includes('cdn.realtor.ca')) return [baseUrl];
    const highresUrl = baseUrl.replace('/lowres/', '/highres/');
    const match = highresUrl.match(/^(.+_)(\d+)(\.jpg)$/i);
    if (!match) return [highresUrl];
    const [, prefix, , extension] = match;
    return Array.from({ length: MAX_IMAGES }, (_, i) => `${prefix}${i + 1}${extension}`);
  }

  async scrape(url, options = {}) {
    if (!this.browser) await this.init();
    
    const { limit = 20, maxPages = 5 } = options;
    
    console.log(`Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await this.page.waitForSelector('.cardCon', { timeout: 30000 });
    
    const listings = [];
    let pageNum = 0;
    
    while (pageNum < maxPages && listings.length < limit) {
      pageNum++;
      const cards = await this.page.$$('.cardCon');
      
      for (const card of cards) {
        if (listings.length >= limit) break;
        
        const data = await card.evaluate((card, { PROVINCES }) => {
          const fullText = card.textContent || '';
          let price = null;
          const priceMatch = fullText.match(/\$[\d,]+/);
          if (priceMatch) price = parseInt(priceMatch[0].replace(/[$,]/g, ''), 10);
          
          let street = null, town = null, province = null, detailUrl = null;
          const addressLink = Array.from(card.querySelectorAll('a')).find(a => 
            (a.href || '').includes('real-estate')
          );
          
          if (addressLink) {
            detailUrl = addressLink.href;
            const addressDiv = addressLink.querySelector('.smallListingCardAddress');
            if (addressDiv) {
              const parts = addressDiv.textContent.trim().replace(/\s+/g, ' ')
                .split(',').map(p => p.trim()).filter(p => p);
              if (parts.length >= 3) {
                street = parts[0];
                town = parts[1];
                const provRaw = parts[parts.length - 1];
                for (const prov of PROVINCES) {
                  if (provRaw.toLowerCase().includes(prov.toLowerCase())) {
                    province = prov;
                    break;
                  }
                }
              }
            }
          }
          
          if (!street) return null;
          
          const bedsMatch = fullText.match(/(\d+)\s*Bedrooms?/i);
          const beds = bedsMatch ? parseInt(bedsMatch[1], 10) : 0;
          
          const img = card.querySelector('img.smallListingCardImage, img[src*="cdn.realtor.ca"]');
          const imageUrl = img?.src;
          
          return { price, street, town, province, beds, detailUrl, imageUrl };
        }, { PROVINCES });
        
        if (data) {
          data.imageUrls = this.generateImageUrls(data.imageUrl);
          data.scrapedAt = new Date().toISOString();
          listings.push(data);
        }
      }
      
      // Next page
      const nextBtn = await this.page.$('a[aria-label*="next"]');
      if (!nextBtn || listings.length >= limit) break;
      
      await nextBtn.click();
      await this.page.waitForTimeout(2000);
    }
    
    return listings;
  }
}

// POST /api/scraper/run - Run server-side scraper
router.post('/run', async (req, res) => {
  const { url, limit = 20 } = req.body;
  
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL required' });
  }
  
  console.log(`[Scraper] Starting scrape: ${url}`);
  const scraper = new ServerScraper({ 
    headless: true,
    proxyUser: process.env.WEBSHARE_USER,
    proxyPass: process.env.WEBSHARE_PASS,
  });
  
  try {
    const listings = await scraper.scrape(url, { limit });
    await scraper.close();
    
    console.log(`[Scraper] Found ${listings.length} listings`);
    res.json({ success: true, count: listings.length, listings });
  } catch (err) {
    console.error('[Scraper] Failed:', err.message);
    try { await scraper.close(); } catch {}
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/scraper/status - Check playwright availability
router.get('/status', async (req, res) => {
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const version = await browser.version();
    await browser.close();
    res.json({ 
      success: true, 
      playwright: 'available',
      chromium: version,
      proxy: process.env.WEBSHARE_USER ? 'configured' : 'not configured'
    });
  } catch (err) {
    res.json({ 
      success: false, 
      playwright: 'error',
      error: err.message 
    });
  }
});

module.exports = router;
