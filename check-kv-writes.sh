#!/bin/bash

# Script to check KV write statistics from Cloudflare Worker logs
# Usage: ./check-kv-writes.sh
# Note: This streams live logs. Press Ctrl+C to stop.
# For historical data, use the Cloudflare Dashboard instead.

WORKER_NAME="spotify-api"
CONFIG_FILE="wrangler-spotify.toml"

echo "Monitoring KV write operations (live stream)..."
echo "=================================================="
echo ""
echo "Press Ctrl+C to stop monitoring."
echo "For historical analytics, use Cloudflare Dashboard instead."
echo ""

# Count writes as they come in
WRITE_COUNT=0

wrangler tail --config "$CONFIG_FILE" --format json 2>/dev/null | while IFS= read -r line; do
  # Skip empty lines or invalid JSON
  [ -z "$line" ] && continue
  
  # Safely check if this is a KV write log entry
  # Check for message field existence and content
  MESSAGE=$(echo "$line" | jq -r '.message // empty' 2>/dev/null)
  
  if [ -n "$MESSAGE" ]; then
    # Check if message contains KV write indicators
    if echo "$MESSAGE" | grep -qE "(Cached track data|Spotify cache updated)"; then
      TIMESTAMP=$(echo "$line" | jq -r '.timestamp // "N/A"' 2>/dev/null)
      echo "[$TIMESTAMP] $MESSAGE"
      WRITE_COUNT=$((WRITE_COUNT + 1))
      echo "→ Total writes detected: $WRITE_COUNT"
      echo ""
    fi
  fi
done

echo ""
echo "=================================================="
echo "Monitoring stopped."
echo ""
echo "For detailed historical analytics, visit:"
echo "https://dash.cloudflare.com → Workers & Pages → $WORKER_NAME → Analytics → KV Operations"
echo ""
