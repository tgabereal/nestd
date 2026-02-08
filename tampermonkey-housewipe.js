// ==UserScript==
// @name          HouseWipe - Realtor.ca Scraper
// @namespace     http://tampermonkey.net/
// @version       4.0
// @description   Scrapes listings from Realtor.ca and sends to HouseWipe API
// @author        HouseWipe
// @match         https://www.realtor.ca/*
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @connect       localhost
// @connect       *.railway.app
// @connect       *
// @run-at        document-end
// ==/UserScript==

(async function() {
  'use strict';

  // ⚠️ CONFIGURE THESE:
  const API_URL = 'http://localhost:3001/api/scraper/listings';  // Change to Railway URL after deploy
  const API_KEY = ''; // Optional: Add if you set up API key auth
  
  // AUTO-SCRAPE: Set to true for scheduled runs (script will auto-start on page load)
  const AUTO_SCRAPE = false;  // Change to true for scheduled automation
  const AUTO_SCRAPE_LIMIT = 50;  // Max listings to scrape in auto mode
  const AUTO_CLOSE_TAB = false;  // Close tab after auto-scrape completes

  const MAX_IMAGES = 80;
  let stopScanRequested = false;
  let isScanning = false;
  let seenListingUrls = new Set();

  GM_addStyle(`
    #houseWipePanel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 15px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 320px;
      color: white;
    }
    #houseWipePanel h3 {
      margin: 0 0 10px 0;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #houseWipePanel button {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
      padding: 8px 12px;
      margin: 5px 5px 5px 0;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    #houseWipePanel button:hover {
      background: rgba(255,255,255,0.3);
    }
    #houseWipePanel button.stop-btn {
      background: #ef4444;
      border-color: #ef4444;
    }
    #houseWipePanel button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #houseWipePanel #houseWipeStatus {
      font-size: 12px;
      margin-top: 10px;
      padding: 10px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      max-height: 100px;
      overflow-y: auto;
    }
    #houseWipePanel .input-row {
      display: flex;
      align-items: center;
      margin: 8px 0;
      gap: 8px;
    }
    #houseWipePanel .input-row input {
      width: 60px;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 6px;
      font-size: 12px;
      background: rgba(255,255,255,0.1);
      color: white;
    }
    #houseWipePanel .input-row input::placeholder {
      color: rgba(255,255,255,0.5);
    }
  `);

  const PROVINCES = [
    'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba',
    'Saskatchewan', 'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador',
    'Prince Edward Island', 'Northwest Territories', 'Yukon', 'Nunavut'
  ];

  function generateImageUrls(baseImageUrl) {
    if (!baseImageUrl) return [];
    if (!baseImageUrl.includes('cdn.realtor.ca')) return [baseImageUrl];

    const highresUrl = baseImageUrl.replace('/lowres/', '/highres/');
    const match = highresUrl.match(/^(.+_)(\d+)(\.jpg)$/i);
    if (!match) return [highresUrl];

    const [, prefix, , extension] = match;
    return Array.from({ length: MAX_IMAGES }, (_, i) => `${prefix}${i + 1}${extension}`);
  }

  function parseTimeAgoToDate(timeStr) {
    if (!timeStr || timeStr === 'N/A') return null;

    const now = new Date();
    const match = timeStr.match(/(\d+)\s+(hour|day|week)s?\s+ago/i);

    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();

      if (unit === 'hour') now.setHours(now.getHours() - amount);
      else if (unit === 'day') now.setDate(now.getDate() - amount);
      else if (unit === 'week') now.setDate(now.getDate() - (amount * 7));
    }

    return now.toISOString();
  }

  function extractListingFromCard(cardEl) {
    try {
      const fullText = cardEl.textContent;

      // Price
      let price = null;
      const priceMatch = fullText.match(/\$[\d,]+/);
      if (priceMatch) {
        price = parseInt(priceMatch[0].replace(/[$,]/g, ''), 10);
      }
      if (!price) {
        const priceDiv = cardEl.querySelector('div[data-value-cad]');
        if (priceDiv) {
          price = parseInt(priceDiv.getAttribute('data-value-cad').replace(/[^\d]/g, ''), 10);
        }
      }

      // Address
      let street = null, town = null, province = null, detailUrl = null;
      const addressLink = Array.from(cardEl.querySelectorAll('a')).find(a => 
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
            for (const prov of PROVINCES) {
              if (parts[parts.length - 1].toLowerCase().includes(prov.toLowerCase())) {
                province = prov;
                break;
              }
            }
            if (!province) province = parts[parts.length - 1].split(/\s{2,}/)[0].trim();
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

      // Time
      const timeMatch = fullText.match(/(\d+)\s+(hour|day|week)s?\s+ago/i);
      const listedAt = timeMatch ? parseTimeAgoToDate(timeMatch[0]) : null;

      // Image
      let imageUrl = null;
      const img = cardEl.querySelector('img.smallListingCardImage') || 
                  cardEl.querySelector('img[src*="cdn.realtor.ca"]');
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
        imageUrls: generateImageUrls(imageUrl),
        detailUrl,
        scrapedAt: new Date().toISOString()
      };
    } catch (e) {
      console.error('Error extracting listing:', e);
      return null;
    }
  }

  function scanCurrentPage() {
    const cards = document.querySelectorAll('.cardCon');
    const listings = [];
    cards.forEach(card => {
      const listing = extractListingFromCard(card);
      if (listing) listings.push(listing);
    });
    return listings;
  }

  function getFirstListingUrl() {
    const cards = document.querySelectorAll('.cardCon');
    if (cards.length === 0) return null;
    const link = cards[0].querySelector('a[href*="real-estate"]');
    return link ? link.href : null;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function updateStatus(text) {
    const statusEl = document.getElementById('houseWipeStatus');
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.scrollTop = statusEl.scrollHeight;
    }
    console.log('[HouseWipe]', text);
  }

  async function waitForPageChange(previousFirstUrl, maxWaitMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      await sleep(300);
      const currentFirstUrl = getFirstListingUrl();
      if (currentFirstUrl && currentFirstUrl !== previousFirstUrl) {
        await sleep(500);
        return true;
      }
      if (stopScanRequested) return false;
    }
    return false;
  }

  async function sendToHouseWipe(listings) {
    if (!API_URL) {
      updateStatus('❌ API URL not configured');
      return false;
    }

    updateStatus(`📤 Sending ${listings.length} listings to HouseWipe...`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY && { 'X-API-Key': API_KEY })
        },
        body: JSON.stringify({ listings })
      });

      const result = await response.json();
      
      if (result.success) {
        updateStatus(`✅ Added ${result.added} new, ${result.updated} updated, ${result.priceChanges} price changes`);
        return true;
      } else {
        updateStatus(`❌ Error: ${result.message}`);
        return false;
      }
    } catch (error) {
      updateStatus(`❌ Network error: ${error.message}`);
      return false;
    }
  }

  async function scrapeAllPages(maxListings = null) {
    let newListings = [];
    let pageCount = 0;
    const maxPages = 999;

    seenListingUrls = new Set();

    while (pageCount < maxPages) {
      if (stopScanRequested) {
        updateStatus(`⏹ Stopped at ${newListings.length} listings`);
        break;
      }

      pageCount++;
      updateStatus(`📄 Scanning page ${pageCount}... (${newListings.length} found)`);

      const pageListings = scanCurrentPage();
      let addedFromPage = 0;

      for (const listing of pageListings) {
        if (stopScanRequested) break;
        if (maxListings !== null && newListings.length >= maxListings) break;

        if (listing.detailUrl && seenListingUrls.has(listing.detailUrl)) continue;

        if (listing.detailUrl) seenListingUrls.add(listing.detailUrl);
        newListings.push(listing);
        addedFromPage++;
      }

      updateStatus(`Page ${pageCount}: +${addedFromPage} | Total: ${newListings.length}`);

      if (maxListings !== null && newListings.length >= maxListings) break;

      const nextBtn = document.querySelector('a[aria-label*="next"]');
      if (!nextBtn || nextBtn.style.display === 'none') {
        updateStatus('📭 No more pages');
        break;
      }

      const currentFirstUrl = getFirstListingUrl();
      nextBtn.click();

      updateStatus(`Waiting for page ${pageCount + 1}...`);
      await waitForPageChange(currentFirstUrl, 10000);
    }

    return newListings;
  }

  function createControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'houseWipePanel';

    panel.innerHTML = `
      <h3>🏠 HouseWipe</h3>
      <div>
        <button id="hwStartBtn">▶️ Start Scan</button>
      </div>
      <div class="input-row">
        <input type="number" id="hwLimit" value="20" min="1" max="500" placeholder="Limit">
        <button id="hwCustomBtn">Scan</button>
      </div>
      <div id="houseWipeStatus">Ready to scan</div>
    `;

    document.body.appendChild(panel);

    const startBtn = document.getElementById('hwStartBtn');
    const customBtn = document.getElementById('hwCustomBtn');
    const limitInput = document.getElementById('hwLimit');

    startBtn.addEventListener('click', async () => {
      if (isScanning) {
        stopScanRequested = true;
        startBtn.textContent = 'Stopping...';
        startBtn.disabled = true;
      } else {
        isScanning = true;
        stopScanRequested = false;
        startBtn.textContent = '⏹ Stop';
        startBtn.classList.add('stop-btn');
        customBtn.disabled = true;

        const listings = await scrapeAllPages(null);
        if (listings.length > 0) {
          await sendToHouseWipe(listings);
        } else {
          updateStatus('No listings found');
        }

        isScanning = false;
        stopScanRequested = false;
        startBtn.textContent = '▶️ Start Scan';
        startBtn.classList.remove('stop-btn');
        startBtn.disabled = false;
        customBtn.disabled = false;
      }
    });

    customBtn.addEventListener('click', async () => {
      if (isScanning) return;

      const limit = parseInt(limitInput.value) || 20;
      isScanning = true;
      stopScanRequested = false;
      startBtn.disabled = true;
      customBtn.disabled = true;

      updateStatus(`Scanning up to ${limit} listings...`);
      const listings = await scrapeAllPages(limit);

      if (listings.length > 0) {
        await sendToHouseWipe(listings);
      } else {
        updateStatus('No listings found');
      }

      isScanning = false;
      startBtn.disabled = false;
      customBtn.disabled = false;
    });
  }

  setTimeout(createControlPanel, 500);
  
  // AUTO-SCRAPE MODE
  if (AUTO_SCRAPE) {
    setTimeout(async () => {
      console.log('[HouseWipe] Auto-scrape mode enabled, starting in 5 seconds...');
      updateStatus('🤖 Auto-scrape starting...');
      
      // Wait for page to fully load
      await new Promise(r => setTimeout(r, 5000));
      
      isScanning = true;
      stopScanRequested = false;
      
      const listings = await scrapeAllPages(AUTO_SCRAPE_LIMIT);
      
      if (listings.length > 0) {
        await sendToHouseWipe(listings);
      } else {
        updateStatus('No listings found in auto-scrape');
      }
      
      isScanning = false;
      console.log('[HouseWipe] Auto-scrape complete');
      
      if (AUTO_CLOSE_TAB) {
        setTimeout(() => window.close(), 3000);
      }
    }, 2000);
  }
})();
