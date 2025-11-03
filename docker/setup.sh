#!/bin/bash
set -e

echo "=== BeachPatrol - Complete Setup ==="
echo ""

# Configuration
DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$DOCKER_DIR")"
USER_ID=5555
GROUP_ID=5555

echo "📁 Directories:"
echo "   Docker:  $DOCKER_DIR"
echo "   Project: $PROJECT_ROOT"
echo ""

# Create directories with proper ownership
echo "🔧 Creating host volumes..."

mkdir -p "$DOCKER_DIR/downloads"
mkdir -p "$DOCKER_DIR/profiles/default"

# Apply permissions
echo "🔐 Setting permissions (UID:GID = $USER_ID:$GROUP_ID)..."

sudo chown -R $USER_ID:$GROUP_ID "$DOCKER_DIR/downloads"
sudo chown -R $USER_ID:$GROUP_ID "$DOCKER_DIR/profiles"
sudo chmod -R 755 "$DOCKER_DIR/downloads"
sudo chmod -R 755 "$DOCKER_DIR/profiles"

echo "✅ Volumes created successfully"
echo ""

# Verification
echo "📋 Permission check:"
ls -la "$DOCKER_DIR" | grep -E "(downloads|profiles)"
echo ""

# Docker cleanup
echo "🧹 Cleaning existing containers..."
cd "$DOCKER_DIR"
docker compose down -v 2>/dev/null || true
echo ""

# Build
echo "🔨 Building image (--no-cache)..."
docker compose build --no-cache
echo ""

# Start
echo "🚀 Starting container..."
docker compose up -d
echo ""

# Wait for startup
echo "⏳ Waiting for startup (5s)..."
sleep 5
echo ""

# Logs
echo "📜 Live logs (Ctrl+C to exit):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose logs -f beachpatrol

