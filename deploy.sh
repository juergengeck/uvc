#!/bin/bash
set -e

# UVC Browser Deploy Script
# Usage: ./deploy.sh [--build-only]
#
# Builds and deploys to Cloudflare Pages
# Use --build-only to skip deployment

BUILD_ONLY=false
if [ "$1" == "--build-only" ]; then
    BUILD_ONLY=true
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="dist"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   UVC Browser Deploy Script             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Build web export
echo -e "${BLUE}[1/2]${NC} Building UVC for web..."
cd "$SCRIPT_DIR"
if npx expo export --platform web; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

# Verify build
if [ ! -f "$BUILD_DIR/index.html" ]; then
    echo -e "${RED}✗ Build verification failed: index.html not found${NC}"
    exit 1
fi
echo ""

if [ "$BUILD_ONLY" = true ]; then
    echo -e "${GREEN}✓ Build complete (--build-only)${NC}"
    echo -e "${BLUE}📁 Output:${NC} $BUILD_DIR/"
    exit 0
fi

# Step 2: Deploy to Cloudflare Pages
echo -e "${BLUE}[2/2]${NC} Deploying to Cloudflare Pages..."
if command -v npx &> /dev/null; then
    if npx wrangler pages deploy dist --project-name=uvc-one --commit-dirty=true --no-bundle; then
        echo -e "${GREEN}✓ Deployed to Cloudflare Pages${NC}"
    else
        echo -e "${RED}✗ Cloudflare deployment failed${NC}"
        echo -e "${YELLOW}  Make sure you're logged in: npx wrangler login${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ npx not found${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✓ Deploy Completed!                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📁 Build output:${NC} dist/"
echo -e "${BLUE}☁️  Live at:${NC} https://uvc-one.pages.dev"
echo ""
