#!/bin/bash
# Scrape all cards page by page using scrape-page-ids + scrape-one
BASE="https://oshicardapi.luisrvervaet.workers.dev"
PAGE=1
TOTAL=0

echo "Starting scrape..."

while true; do
  IDS=$(curl -sf "$BASE/scrape-page-ids?page=$PAGE")
  COUNT=$(echo "$IDS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)

  if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
    echo "Page $PAGE returned 0 IDs — done!"
    break
  fi

  echo "Page $PAGE: $COUNT cards"

  for ID in $(echo "$IDS" | python3 -c "import sys,json; [print(i) for i in json.load(sys.stdin)]"); do
    curl -sf "$BASE/scrape-one?id=$ID" > /dev/null
    sleep 0.2
  done

  TOTAL=$((TOTAL + COUNT))
  PAGE=$((PAGE + 1))

  DB_COUNT=$(curl -sf "$BASE/scrape-status" | python3 -c "import sys,json; print(json.load(sys.stdin)['cardCount'])" 2>/dev/null)
  echo "  Saved $COUNT cards (total: $TOTAL) | DB: $DB_COUNT"
  sleep 1
done

echo ""
echo "Scrape complete! Total: $TOTAL"
curl -sf "$BASE/scrape-status"
echo ""
