#!/bin/bash
# HouseWipe Scheduled Scraper
# Opens Chrome to realtor.ca - Tampermonkey script handles the rest
# Schedule with: crontab -e → 0 * * * * /path/to/scheduled-scrape.sh

SEARCH_URL="https://www.realtor.ca/map#ZoomLevel=8&Center=43.65%2C-79.38&PriceMax=700000&Sort=6-D"

echo "[$(date)] Starting scheduled scrape..."

# Open Chrome to the search URL (Tampermonkey will auto-run)
osascript <<EOF
tell application "Google Chrome"
    activate
    
    -- Check if there's already a realtor.ca tab
    set found to false
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t contains "realtor.ca" then
                set found to true
                set active tab index of w to index of t
                set URL of t to "$SEARCH_URL"
                exit repeat
            end if
        end repeat
        if found then exit repeat
    end repeat
    
    -- If no existing tab, open new one
    if not found then
        tell window 1
            make new tab with properties {URL:"$SEARCH_URL"}
        end tell
    end if
end tell
EOF

echo "[$(date)] Chrome opened to realtor.ca"
echo "[$(date)] Tampermonkey script will handle scraping"
