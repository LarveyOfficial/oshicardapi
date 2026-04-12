#!/bin/bash
# Scrape all cards page by page until we hit an empty page
BASE="https://oshicardapi.luisrvervaet.workers.dev/scrape-page"
PAGE=0

echo "Scraping all pages starting from page 0..."

while true; do
  RESULT=$(curl -s "$BASE?page=$PAGE")
  SAVED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('saved', 0))" 2>/dev/null)

  if [ "$SAVED" = "0" ]; then
    echo "Page $PAGE returned 0 cards — done!"
    break
  fi

  DB_COUNT=$(curl -s "https://oshicardapi.luisrvervaet.workers.dev/scrape-status" | python3 -c "import sys,json; print(json.load(sys.stdin)['cardCount'])" 2>/dev/null)
  echo "Page $PAGE: saved $SAVED cards | DB total: $DB_COUNT"

  PAGE=$((PAGE + 1))
done

echo ""
echo "Scrape complete!"
curl -s "https://oshicardapi.luisrvervaet.workers.dev/scrape-status"
echo ""
