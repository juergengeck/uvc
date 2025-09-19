#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting one.core update workflow...${NC}"

# 1. Commit and push changes in one.core
echo -e "\n${YELLOW}Step 1: Committing changes in one.core${NC}"
cd ../one.core

# Add the buffer.ts changes
git add src/system/expo/buffer.ts

# Create commit
git commit -m "fix: Remove circular reference in Buffer.from() implementation

- Fix LamaBuffer.from to use local from() function instead of implementation.from()
- Fix LamaBuffer constructor to use local functions
- Prevents stack overflow when using Buffer.from() in React Native"

# Push to remote
echo -e "\n${YELLOW}Step 2: Pushing to remote${NC}"
git push origin main

# 2. Build one.core
echo -e "\n${YELLOW}Step 3: Building one.core${NC}"
npm run build

# 3. Pack one.core
echo -e "\n${YELLOW}Step 4: Packing one.core${NC}"
npm pack

# Get the generated tgz filename
PACKAGE_FILE=$(ls -t refinio-one.core-*.tgz | head -1)
echo -e "Generated package: ${PACKAGE_FILE}"

# 4. Copy to lama vendor directory
echo -e "\n${YELLOW}Step 5: Copying to lama vendor directory${NC}"
cd ../lama
cp ../one.core/${PACKAGE_FILE} vendor/

# 5. Update package.json to use the vendor version
echo -e "\n${YELLOW}Step 6: Updating lama package.json${NC}"
# Use jq if available, otherwise use sed
if command -v jq &> /dev/null; then
    jq '.dependencies["@refinio/one.core"] = "file:vendor/'${PACKAGE_FILE}'"' package.json > package.json.tmp && mv package.json.tmp package.json
else
    # Fallback to sed
    sed -i.bak 's|"@refinio/one.core": "[^"]*"|"@refinio/one.core": "file:vendor/'${PACKAGE_FILE}'"|' package.json
    rm -f package.json.bak
fi

# 6. Clean and reinstall
echo -e "\n${YELLOW}Step 7: Cleaning and reinstalling dependencies${NC}"
rm -rf node_modules
npm install

# 7. Clean and rebuild the app
echo -e "\n${YELLOW}Step 8: Cleaning and rebuilding the app${NC}"
npx expo prebuild --clean

echo -e "\n${GREEN}✅ one.core update workflow completed!${NC}"
echo -e "${GREEN}You can now run the app with: npm run ios${NC}"