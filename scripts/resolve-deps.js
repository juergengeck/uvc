/**
 * Dependency Resolution Debug Script
 * 
 * This script helps diagnose Metro bundling issues by checking
 * how Node.js resolves critical dependencies in the project.
 */

const path = require('path');
const fs = require('fs');

// Packages to test
const PACKAGES_TO_TEST = [
  'react-native',
  'react',
  '@refinio/one.core',
  '@refinio/one.models',
  'expo',
  'metro',
  'llama.rn'
];

// Project root
const projectRoot = path.resolve(__dirname, '..');
console.log('Project root:', projectRoot);

// Helper to safely resolve a package
function safeResolve(packageName) {
  try {
    // Try to resolve the package's main file
    const packagePath = require.resolve(packageName, { paths: [projectRoot] });
    
    // Find the package.json for the resolved module
    let packageDir = path.dirname(packagePath);
    let packageJsonPath = '';
    
    // Go up directories until we find package.json
    while (packageDir !== '/' && !fs.existsSync(path.join(packageDir, 'package.json'))) {
      packageDir = path.dirname(packageDir);
    }
    
    if (packageDir !== '/') {
      packageJsonPath = path.join(packageDir, 'package.json');
      const packageJson = require(packageJsonPath);
      
      console.log(`✅ ${packageName}`);
      console.log(`   - Resolved to: ${packagePath}`);
      console.log(`   - Package root: ${packageDir}`);
      console.log(`   - Version: ${packageJson.version || 'unknown'}`);
      
      // Check if the package is a symlink
      const stats = fs.lstatSync(packageDir);
      if (stats.isSymbolicLink()) {
        const realPath = fs.realpathSync(packageDir);
        console.log(`   - Symlinked to: ${realPath}`);
      }
    } else {
      console.log(`⚠️ ${packageName}: Found entry point but not package.json`);
      console.log(`   - Resolved to: ${packagePath}`);
    }
    
    return { success: true, path: packagePath };
  } catch (err) {
    console.log(`❌ ${packageName}: Failed to resolve`);
    console.log(`   - Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Test Metro's resolution system
console.log('\n📋 TESTING NODE.JS PACKAGE RESOLUTION\n');

PACKAGES_TO_TEST.forEach(packageName => {
  console.log(`\nResolving ${packageName}...`);
  safeResolve(packageName);
});

// Check for potential conflicts with react-native folder
const localReactNativeDir = path.join(projectRoot, 'react-native');
if (fs.existsSync(localReactNativeDir)) {
  console.log('\n⚠️ POTENTIAL CONFLICT DETECTED:');
  console.log(`A directory named 'react-native' exists at the project root level: ${localReactNativeDir}`);
  console.log('This may conflict with the npm package resolution.');
}

console.log('\n📋 CHECKING SYMLINKED PACKAGES\n');

// Function to check symlinks in node_modules
function checkSymlinks(dir) {
  try {
    const nodeModulesPath = path.join(dir, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) return;
    
    const entries = fs.readdirSync(nodeModulesPath);
    
    for (const entry of entries) {
      const entryPath = path.join(nodeModulesPath, entry);
      try {
        const stats = fs.lstatSync(entryPath);
        
        if (stats.isSymbolicLink()) {
          const realPath = fs.realpathSync(entryPath);
          console.log(`Symlink: ${entryPath} -> ${realPath}`);
        } else if (stats.isDirectory() && entry !== '.bin' && entry !== '.cache' && !entry.startsWith('@')) {
          // Check if this is a scoped package directory
          checkSymlinks(entryPath);
        } else if (stats.isDirectory() && entry.startsWith('@')) {
          // Handle scoped packages
          const scopedEntries = fs.readdirSync(entryPath);
          for (const scopedEntry of scopedEntries) {
            const scopedEntryPath = path.join(entryPath, scopedEntry);
            const scopedStats = fs.lstatSync(scopedEntryPath);
            
            if (scopedStats.isSymbolicLink()) {
              const realPath = fs.realpathSync(scopedEntryPath);
              console.log(`Symlink: ${scopedEntryPath} -> ${realPath}`);
            } else if (scopedStats.isDirectory()) {
              checkSymlinks(scopedEntryPath);
            }
          }
        }
      } catch (err) {
        console.log(`Error checking ${entryPath}: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`Error checking symlinks in ${dir}: ${err.message}`);
  }
}

checkSymlinks(projectRoot);

console.log('\nDependency resolution check complete.'); 