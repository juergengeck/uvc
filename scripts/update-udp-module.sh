#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting UDP module update workflow...${NC}"

# 1. Build UDP module
echo -e "\n${YELLOW}Step 1: Building UDP module${NC}"
cd packages/react-native-udp-direct
npm run prepare

# 2. Pack UDP module
echo -e "\n${YELLOW}Step 2: Packing UDP module${NC}"
npm pack

# Get the generated tgz filename
PACKAGE_FILE=$(ls -t lama-react-native-udp-direct-*.tgz | head -1)
echo -e "Generated package: ${PACKAGE_FILE}"

# 3. Copy to vendor directory
echo -e "\n${YELLOW}Step 3: Copying to vendor directory${NC}"
cd ../..
mv packages/react-native-udp-direct/${PACKAGE_FILE} vendor/

# 4. Clean and reinstall
echo -e "\n${YELLOW}Step 4: Cleaning and reinstalling dependencies${NC}"
rm -rf node_modules/@lama/react-native-udp-direct
npm install

# 5. Clean iOS build
echo -e "\n${YELLOW}Step 5: Cleaning iOS build${NC}"
cd ios
rm -rf Pods build
pod install
cd ..

echo -e "\n${GREEN}✅ UDP module update workflow completed!${NC}"
echo -e "${GREEN}You can now run the app with: npm run ios${NC}"