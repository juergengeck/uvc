#!/bin/bash
# verify-cpp-compat.sh
#
# This script verifies that all C++ translation units (.mm and .cpp files)
# in the project follow our compatibility header guidelines.

# Set strict error handling
set -e
set -o pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Define ANSI color codes
RESET="\033[0m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"

# Print header
echo -e "${BLUE}===============================================${RESET}"
echo -e "${BLUE}C++ Compatibility Headers Verification Script${RESET}"
echo -e "${BLUE}===============================================${RESET}"
echo

# Find all .mm and .cpp files in ios-custom-modules
echo -e "${BLUE}Searching for C++ files...${RESET}"
CPP_FILES=$(find "$PROJECT_DIR/ios-custom-modules" -type f \( -name "*.mm" -o -name "*.cpp" \) | sort)
FILE_COUNT=$(echo "$CPP_FILES" | wc -l | tr -d ' ')

if [ "$FILE_COUNT" -eq 0 ]; then
  echo -e "${RED}No C++ files found in $PROJECT_DIR/ios-custom-modules!${RESET}"
  exit 1
fi

echo -e "Found ${GREEN}$FILE_COUNT${RESET} C++ files to check."
echo

# Check each file for compliance
ERRORS=0
WARNINGS=0
PASSED=0

for file in $CPP_FILES; do
  FILENAME=$(basename "$file")
  RELATIVE_PATH=${file#$PROJECT_DIR/}
  
  echo -e "Checking ${BLUE}$RELATIVE_PATH${RESET}..."

  # Skip checking certain file types that we know don't need compatibility headers
  if [[ "$FILENAME" == *Spec.mm ]] || [[ "$FILENAME" == *Tests.mm ]]; then
    echo -e "  ${YELLOW}➤ Skipping test/spec file${RESET}"
    continue
  fi

  # 1. Check if the file has UDPCXXCompat.h or another compat header
  COMPAT_INCLUDE=$(grep -n "#include \"UDPCXXCompat.h\"" "$file" | head -1)
  
  if [ -z "$COMPAT_INCLUDE" ]; then
    # Check for indirect inclusion through other headers
    INDIRECT_COMPAT=$(grep -n "#include \".*Compat.h\"" "$file" | head -1)
    
    if [ -z "$INDIRECT_COMPAT" ]; then
      echo -e "  ${RED}✘ Missing UDPCXXCompat.h or other compatibility header${RESET}"
      ERRORS=$((ERRORS + 1))
      continue
    else
      COMPAT_LINE=$(echo "$INDIRECT_COMPAT" | cut -d: -f1)
      COMPAT_FILE=$(echo "$INDIRECT_COMPAT" | sed -E 's/.*#include "([^"]+)".*/\1/')
      echo -e "  ${YELLOW}➤ Using indirect compatibility header: $COMPAT_FILE at line $COMPAT_LINE${RESET}"
    fi
  else
    COMPAT_LINE=$(echo "$COMPAT_INCLUDE" | cut -d: -f1)
    echo -e "  ${GREEN}✓ Found UDPCXXCompat.h at line $COMPAT_LINE${RESET}"
  fi
  
  # 2. Check that no standard library headers come before compat header
  FIRST_STD_LIB=$(grep -n "#include <" "$file" | head -1)
  
  if [ -n "$FIRST_STD_LIB" ]; then
    STD_LIB_LINE=$(echo "$FIRST_STD_LIB" | cut -d: -f1)
    
    if [ -n "$COMPAT_LINE" ] && [ "$STD_LIB_LINE" -lt "$COMPAT_LINE" ]; then
      echo -e "  ${RED}✘ Standard library header appears before compatibility header at line $STD_LIB_LINE${RESET}"
      ERRORS=$((ERRORS + 1))
      continue
    fi
  fi
  
  # 3. Check that feature macros aren't defined locally
  LOCAL_MACROS=$(grep -n "_LIBCPP_" "$file" | grep "#define" || true)
  
  if [ -n "$LOCAL_MACROS" ]; then
    echo -e "  ${RED}✘ Found local definitions of libc++ feature macros:${RESET}"
    echo "$LOCAL_MACROS" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  # 4. Check for common patterns of incorrect includes
  VECTOR_BEFORE_COMPAT=$(grep -n "#include <vector>" "$file" | head -1)
  
  if [ -n "$VECTOR_BEFORE_COMPAT" ] && [ -n "$COMPAT_LINE" ]; then
    VECTOR_LINE=$(echo "$VECTOR_BEFORE_COMPAT" | cut -d: -f1)
    
    if [ "$VECTOR_LINE" -lt "$COMPAT_LINE" ]; then
      echo -e "  ${RED}✘ <vector> included before compatibility header at line $VECTOR_LINE${RESET}"
      ERRORS=$((ERRORS + 1))
      continue
    fi
  fi
  
  # Check if clang pragma diagnostics are used correctly for deprecated features
  if grep -q "deprecated" "$file"; then
    PRAGMA_PUSH=$(grep -n "#pragma clang diagnostic push" "$file" || true)
    PRAGMA_IGNORE=$(grep -n "#pragma clang diagnostic ignored" "$file" | grep "deprecated" || true)
    PRAGMA_POP=$(grep -n "#pragma clang diagnostic pop" "$file" || true)
    
    if [ -z "$PRAGMA_PUSH" ] || [ -z "$PRAGMA_IGNORE" ] || [ -z "$PRAGMA_POP" ]; then
      echo -e "  ${YELLOW}⚠ File uses deprecated features but may be missing proper pragma directives${RESET}"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
  
  echo -e "  ${GREEN}✓ File passes compatibility checks${RESET}"
  PASSED=$((PASSED + 1))
done

echo
echo -e "${BLUE}===============================================${RESET}"
echo -e "${BLUE}Summary:${RESET}"
echo -e "  ${GREEN}✓ $PASSED files passed${RESET}"
if [ "$WARNINGS" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ $WARNINGS files with warnings${RESET}"
fi
if [ "$ERRORS" -gt 0 ]; then
  echo -e "  ${RED}✘ $ERRORS files with errors${RESET}"
fi
echo -e "${BLUE}===============================================${RESET}"

if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}Verification failed with $ERRORS errors!${RESET}"
  exit 1
else
  echo -e "${GREEN}Verification completed successfully!${RESET}"
  if [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}Consider addressing the $WARNINGS warnings.${RESET}"
  fi
  exit 0
fi 