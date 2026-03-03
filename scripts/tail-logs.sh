#!/bin/bash

# Simple script to tail both server and web logs simultaneously
# Usage: ./scripts/tail-logs.sh

echo "--- Tailing Soup Logs (Server & Web) ---"
echo "Press Ctrl+C to stop"
echo ""

# Use tail with -f to follow, and sed to prefix each line for clarity
tail -f server.log | sed 's/^/[SERVER] /' &
tail -f web.log | sed 's/^/[WEB] /' &

# Wait for both background processes
wait
