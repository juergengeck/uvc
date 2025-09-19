/**
 * inspectOneStorage.js
 * 
 * A diagnostic utility to inspect the Refinio ONE storage filesystem structure
 * Run this directly on the machine hosting the simulator to examine what's 
 * actually stored on disk.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper to find simulator storage directories
function findSimulatorStorageDir() {
  // Common simulator directories on macOS
  const possiblePaths = [
    // iOS simulator directories
    path.join(process.env.HOME, 'Library/Developer/CoreSimulator/Devices'),
    // Android emulator data directories
    path.join(process.env.HOME, '.android/avd')
  ];

  for (const basePath of possiblePaths) {
    if (fs.existsSync(basePath)) {
      console.log(`Found simulator base directory: ${basePath}`);
      return basePath;
    }
  }
  
  console.log('Could not find simulator directories. Please provide path manually.');
  return null;
}

// Read and parse JSON file safely
function readJSONSafe(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.log(`Error reading ${filePath}: ${error.message}`);
    return null;
  }
}

// Find all ONE storage directories in simulator
function findOneStorageDirs(baseDir) {
  const results = [];
  
  function searchDir(dir, depth = 0) {
    if (depth > 10) return; // Prevent infinite recursion
    
    try {
      const items = fs.readdirSync(dir);
      
      // Check if this is a ONE storage directory
      if (items.includes('one-channels') || 
          items.includes('one-objects') || 
          items.includes('one-registry')) {
        results.push(dir);
        return;
      }
      
      // Continue recursion for directories that might contain app data
      for (const item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          // Skip node_modules and other common large dirs
          if (['node_modules', '.git', 'Library'].includes(item)) continue;
          
          searchDir(itemPath, depth + 1);
        }
      }
    } catch (error) {
      // Silent fail for permission errors
      return;
    }
  }
  
  searchDir(baseDir);
  return results;
}

// Analyze channel registry and objects
function analyzeOneStorage(storageDir) {
  console.log(`\nAnalyzing ONE storage in: ${storageDir}`);
  
  // Check registry
  const registryDir = path.join(storageDir, 'one-registry');
  if (fs.existsSync(registryDir)) {
    console.log('\n=== Channel Registry ===');
    const registryFiles = fs.readdirSync(registryDir);
    console.log(`Found ${registryFiles.length} registry entries`);
    
    // Look for channel registry
    const channelRegistryPath = path.join(registryDir, 'channels.json');
    if (fs.existsSync(channelRegistryPath)) {
      const channelRegistry = readJSONSafe(channelRegistryPath);
      if (channelRegistry) {
        console.log('Channel registry:', JSON.stringify(channelRegistry, null, 2));
      }
    } else {
      console.log('WARNING: channels.json not found in registry directory');
    }
  } else {
    console.log('WARNING: one-registry directory not found');
  }
  
  // Check channels
  const channelsDir = path.join(storageDir, 'one-channels');
  if (fs.existsSync(channelsDir)) {
    console.log('\n=== Channels ===');
    const channelDirs = fs.readdirSync(channelsDir);
    console.log(`Found ${channelDirs.length} channel directories:`);
    
    // Look for LLM channel
    const llmChannel = channelDirs.find(dir => dir === 'llm');
    if (llmChannel) {
      console.log(`\nAnalyzing LLM channel: ${llmChannel}`);
      analyzeChannel(path.join(channelsDir, llmChannel));
    } else {
      console.log('WARNING: LLM channel not found, looking for alternatives...');
      // Look at each channel to find any that might contain LLM objects
      for (const channelDir of channelDirs) {
        console.log(`\nAnalyzing channel: ${channelDir}`);
        analyzeChannel(path.join(channelsDir, channelDir));
      }
    }
  } else {
    console.log('WARNING: one-channels directory not found');
  }
  
  // Check objects
  const objectsDir = path.join(storageDir, 'one-objects');
  if (fs.existsSync(objectsDir)) {
    console.log('\n=== Objects ===');
    const objectTypeNames = fs.readdirSync(objectsDir);
    console.log(`Found ${objectTypeNames.length} object types: ${objectTypeNames.join(', ')}`);
    
    // Look for LLM objects
    const llmObjectsDir = path.join(objectsDir, 'LLM');
    if (fs.existsSync(llmObjectsDir)) {
      console.log('\nAnalyzing LLM objects:');
      analyzeObjectsDir(llmObjectsDir);
    } else {
      console.log('WARNING: No LLM objects directory found');
    }
    
    // Also check for ChannelInfo objects
    const channelInfoDir = path.join(objectsDir, 'ChannelInfo');
    if (fs.existsSync(channelInfoDir)) {
      console.log('\nAnalyzing ChannelInfo objects:');
      analyzeObjectsDir(channelInfoDir);
    }
  } else {
    console.log('WARNING: one-objects directory not found');
  }
}

// Analyze a specific channel
function analyzeChannel(channelDir) {
  try {
    const files = fs.readdirSync(channelDir);
    console.log(`Channel directory contains ${files.length} files`);
    
    // Look for head pointer
    const headPointerFile = files.find(file => file === 'head');
    if (headPointerFile) {
      const headPointerPath = path.join(channelDir, headPointerFile);
      const headPointer = fs.readFileSync(headPointerPath, 'utf8');
      console.log(`Head pointer: ${headPointer}`);
      
      // Check if this head pointer matches any ChannelInfo object
      const channelInfoDir = path.join(path.dirname(path.dirname(channelDir)), 'one-objects', 'ChannelInfo');
      if (fs.existsSync(channelInfoDir)) {
        const headPointerObjectPath = path.join(channelInfoDir, headPointer);
        if (fs.existsSync(headPointerObjectPath)) {
          console.log('Head pointer refers to existing ChannelInfo object');
          const headPointerObject = readJSONSafe(headPointerObjectPath);
          if (headPointerObject) {
            console.log('ChannelInfo object:', JSON.stringify(headPointerObject, null, 2));
          }
        } else {
          console.log('WARNING: Head pointer refers to non-existent ChannelInfo object!');
        }
      }
    } else {
      console.log('WARNING: No head pointer file found!');
    }
    
    // Look for info file
    const infoFile = files.find(file => file === 'info');
    if (infoFile) {
      const infoPath = path.join(channelDir, infoFile);
      const info = readJSONSafe(infoPath);
      if (info) {
        console.log('Channel info:', JSON.stringify(info, null, 2));
      }
    } else {
      console.log('WARNING: No channel info file found!');
    }
    
    // Look for objects file 
    const objectsFile = files.find(file => file === 'objects');
    if (objectsFile) {
      const objectsPath = path.join(channelDir, objectsFile);
      const objects = readJSONSafe(objectsPath);
      if (objects) {
        console.log(`Channel contains ${objects.length} objects`);
        
        // Check for LLM objects
        const llmObjects = objects.filter(obj => 
          obj.data && obj.data.$type$ === 'LLM'
        );
        
        if (llmObjects.length > 0) {
          console.log(`Found ${llmObjects.length} LLM objects in channel`);
          llmObjects.forEach((obj, i) => {
            console.log(`\nLLM object ${i+1}:`, JSON.stringify(obj.data, null, 2));
          });
        } else {
          console.log('No LLM objects found in channel');
        }
      }
    } else {
      console.log('WARNING: No objects file found!');
    }
  } catch (error) {
    console.log(`Error analyzing channel: ${error.message}`);
  }
}

// Analyze objects directory for a specific type
function analyzeObjectsDir(objectsDir) {
  try {
    const files = fs.readdirSync(objectsDir);
    console.log(`Found ${files.length} object files`);
    
    if (files.length <= 10) {
      // If fewer than 10 objects, show all
      for (const file of files) {
        const objectPath = path.join(objectsDir, file);
        const object = readJSONSafe(objectPath);
        if (object) {
          console.log(`\nObject ${file}:`, JSON.stringify(object, null, 2));
        }
      }
    } else {
      // If more than 10, just list the hashes
      console.log(`Object hashes: ${files.join(', ').substring(0, 100)}...`);
      
      // Show the most recent few objects
      const fileTimes = files.map(file => {
        const stats = fs.statSync(path.join(objectsDir, file));
        return { file, time: stats.mtime.getTime() };
      }).sort((a, b) => b.time - a.time);
      
      console.log('\nMost recent objects:');
      for (let i = 0; i < Math.min(5, fileTimes.length); i++) {
        const { file, time } = fileTimes[i];
        const objectPath = path.join(objectsDir, file);
        const object = readJSONSafe(objectPath);
        if (object) {
          console.log(`\nObject ${file} (${new Date(time).toISOString()}):`, 
            JSON.stringify(object, null, 2));
        }
      }
    }
  } catch (error) {
    console.log(`Error analyzing objects directory: ${error.message}`);
  }
}

// Main execution
console.log('ONE Storage Filesystem Analyzer');
console.log('-------------------------------');

const simulatorBaseDir = findSimulatorStorageDir();
if (!simulatorBaseDir) {
  console.log('ERROR: Could not locate simulator directory.');
  process.exit(1);
}

const storageDirs = findOneStorageDirs(simulatorBaseDir);
if (storageDirs.length === 0) {
  console.log('ERROR: No ONE storage directories found in simulator.');
  process.exit(1);
}

console.log(`Found ${storageDirs.length} ONE storage directories:`);
storageDirs.forEach((dir, i) => {
  console.log(`${i+1}: ${dir}`);
});

// Analyze each storage directory
storageDirs.forEach(storageDir => {
  analyzeOneStorage(storageDir);
});

// Provide some suggestions based on findings
console.log('\n=== Summary and Recommendations ===');
console.log('1. Check if head pointer files exist and contain valid hashes');
console.log('2. Verify that ChannelInfo objects referenced by head pointers exist');
console.log('3. Check for LLM objects in the one-objects/LLM directory');
console.log('4. Examine channel objects files for LLM objects');
console.log('5. Try rerunning the app with a cleared storage to see if issues persist'); 