#!/usr/bin/env bash

# Go into engine directory
cd "$(dirname "$0")/engine"

echo "Starting Node Launcher..."

npx tsx launcher.ts

echo ""
echo "Launcher exited."