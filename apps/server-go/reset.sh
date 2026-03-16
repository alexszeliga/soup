#!/bin/bash

# Load .env variables from the root
if [ -f ../../.env ]; then
  export $(grep -v '^#' ../../.env | xargs)
fi

# Resolve directories relative to the execution context if relative
DOWNLOAD_DIR=${LOCAL_DOWNLOAD_ROOT:-./downloads}
MEDIA_ROOT=${MEDIA_ROOT:-./media}
DB_PATH_VAL=${DB_PATH:-./soup.db}
DB_DIR=$(dirname "$DB_PATH_VAL")

echo "Resetting Soup-Go environment..."

echo "1. Wiping Torrent Engine Data: $DOWNLOAD_DIR"
if [ -d "$DOWNLOAD_DIR" ]; then
  # Remove all files including hidden ones
  rm -rf "$DOWNLOAD_DIR"/*
  rm -rf "$DOWNLOAD_DIR"/.* 2>/dev/null
else
  mkdir -p "$DOWNLOAD_DIR"
fi

echo "2. Wiping Engine Database and Metadata: $DB_DIR"
if [ -d "$DB_DIR" ]; then
  # Clear engine's internal sqlite files (including WAL/SHM)
  rm -f "$DB_DIR"/.torrent.db*
  # Clear the app's metadata database
  rm -f "$DB_PATH_VAL"*
fi

echo "3. Wiping Media Library: $MEDIA_ROOT"
if [ -d "$MEDIA_ROOT" ]; then
  rm -rf "$MEDIA_ROOT"/*
else
  mkdir -p "$MEDIA_ROOT"
fi
mkdir -p "$MEDIA_ROOT/MEDIA"

echo "Environment reset complete. Paths are clean."
