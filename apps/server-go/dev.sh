#!/bin/bash

# Load .env to get the port
if [ -f ../../.env ]; then
  export $(grep -v '^#' ../../.env | xargs)
fi

API_PORT=${DEV_API_PORT:-3001}

# Check if port is already in use
if lsof -Pi :$API_PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "Error: Port $API_PORT is already in use."
    echo "Please kill the process or check if the TS server is still running."
    exit 1
fi

# Kill all background processes on exit
trap "kill 0" EXIT

echo "Starting Soup-Go Backend (Go) on port $API_PORT..."
go run main.go &

echo "Starting Soup-Go Frontend (React/Vite)..."
# We're in apps/server-go, so the web app is at ../web
cd ../web && pnpm dev &

# Wait for all background processes
wait
