/**
 * syncHeadPointerFix.js
 * 
 * A utility to resolve head pointer synchronization issues between memory and storage.
 * This directly inspects and manipulates the filesystem to ensure proper synchronization.
 */

const fs = require('fs');
const path = require('path');

/**
 * Finds and fixes head pointer synchronization issues in ONE storage
 * 
 * @param {string} storageDir - The base directory of ONE storage
 * @param {string} channelId - The channel ID to fix (default: 'llm')
 * @returns {object} Result of the operation
 */
async function fixHeadPointerSync(storageDir, channelId = 'llm') {
  console.log(`Starting head pointer synchronization fix for channel: ${channelId}`);
  console.log(`Storage directory: ${storageDir}`);
  
  const result = {
    success: false,
    errors: [],
    actions: [],
    diagnostics: {}
  };
  
  try {
    // 1. Verify directory structure
    const channelsDir = path.join(storageDir, 'one-channels');
    const objectsDir = path.join(storageDir, 'one-objects');
    const registryDir = path.join(storageDir, 'one-registry');
    
    if (!fs.existsSync(channelsDir)) {
      result.errors.push('one-channels directory not found');
      return result;
    }
    
    if (!fs.existsSync(objectsDir)) {
      result.errors.push('one-objects directory not found');
      return result;
    }
    
    if (!fs.existsSync(registryDir)) {
      result.errors.push('one-registry directory not found');
      return result;
    }
    
    result.actions.push('Verified basic directory structure');
    
    // 2. Check if channel directory exists
    const channelDir = path.join(channelsDir, channelId);
    if (!fs.existsSync(channelDir)) {
      result.errors.push(`Channel directory ${channelId} not found`);
      return result;
    }
    
    result.actions.push(`Found channel directory: ${channelId}`);
    
    // 3. Check channel info
    const infoPath = path.join(channelDir, 'info');
    if (!fs.existsSync(infoPath)) {
      result.errors.push('Channel info file not found');
      return result;
    }
    
    let channelInfo;
    try {
      const infoContent = fs.readFileSync(infoPath, 'utf8');
      channelInfo = JSON.parse(infoContent);
      result.diagnostics.channelInfo = channelInfo;
      result.actions.push('Read channel info file');
    } catch (err) {
      result.errors.push(`Error reading channel info: ${err.message}`);
      return result;
    }
    
    // 4. Check head pointer
    const headPath = path.join(channelDir, 'head');
    let headPointer = null;
    
    if (fs.existsSync(headPath)) {
      try {
        headPointer = fs.readFileSync(headPath, 'utf8');
        result.diagnostics.existingHeadPointer = headPointer;
        result.actions.push(`Found existing head pointer: ${headPointer}`);
      } catch (err) {
        result.errors.push(`Error reading head pointer: ${err.message}`);
      }
    } else {
      result.actions.push('Head pointer file not found');
    }
    
    // 5. Check channel registry
    const channelRegistryPath = path.join(registryDir, 'channels.json');
    let channelRegistry = null;
    
    if (fs.existsSync(channelRegistryPath)) {
      try {
        const registryContent = fs.readFileSync(channelRegistryPath, 'utf8');
        channelRegistry = JSON.parse(registryContent);
        result.diagnostics.channelRegistry = channelRegistry;
        result.actions.push('Read channel registry');
      } catch (err) {
        result.errors.push(`Error reading channel registry: ${err.message}`);
      }
    } else {
      result.errors.push('Channel registry file not found');
      return result;
    }
    
    // 6. Check channel objects
    const objectsPath = path.join(channelDir, 'objects');
    let channelObjects = [];
    
    if (fs.existsSync(objectsPath)) {
      try {
        const objectsContent = fs.readFileSync(objectsPath, 'utf8');
        channelObjects = JSON.parse(objectsContent);
        result.diagnostics.objectCount = channelObjects.length;
        result.actions.push(`Found ${channelObjects.length} objects in channel`);
      } catch (err) {
        result.errors.push(`Error reading channel objects: ${err.message}`);
      }
    } else {
      result.actions.push('No objects file found, will create one');
      channelObjects = [];
    }

    // 7. Check ChannelInfo objects
    const channelInfoDir = path.join(objectsDir, 'ChannelInfo');
    
    if (!fs.existsSync(channelInfoDir)) {
      fs.mkdirSync(channelInfoDir, { recursive: true });
      result.actions.push('Created missing ChannelInfo directory');
    }
    
    // Find the most recent ChannelInfo object for our channel
    let latestChannelInfoObj = null;
    let latestTime = 0;
    
    try {
      const channelInfoFiles = fs.readdirSync(channelInfoDir);
      result.diagnostics.channelInfoFileCount = channelInfoFiles.length;
      
      for (const file of channelInfoFiles) {
        const filePath = path.join(channelInfoDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const obj = JSON.parse(content);
          
          // Check if this is a ChannelInfo for our channel
          if (obj.channelId === channelId) {
            const objTime = obj.modified || 0;
            if (objTime > latestTime) {
              latestTime = objTime;
              latestChannelInfoObj = obj;
              result.diagnostics.latestChannelInfoHash = file;
            }
          }
        } catch (err) {
          // Skip invalid files
          continue;
        }
      }
      
      if (latestChannelInfoObj) {
        result.actions.push(`Found latest ChannelInfo object with hash: ${result.diagnostics.latestChannelInfoHash}`);
      } else {
        result.actions.push('No ChannelInfo object found for this channel');
      }
    } catch (err) {
      result.errors.push(`Error reading ChannelInfo directory: ${err.message}`);
    }
    
    // 8. Now determine what we need to fix
    
    // Case 1: We have a valid ChannelInfo object but missing or incorrect head pointer
    if (latestChannelInfoObj && (!headPointer || headPointer !== result.diagnostics.latestChannelInfoHash)) {
      try {
        fs.writeFileSync(headPath, result.diagnostics.latestChannelInfoHash);
        result.actions.push(`Fixed head pointer: wrote ${result.diagnostics.latestChannelInfoHash} to head file`);
      } catch (err) {
        result.errors.push(`Failed to update head pointer: ${err.message}`);
        return result;
      }
    }
    // Case 2: We have a head pointer but no matching ChannelInfo object
    else if (headPointer && !latestChannelInfoObj) {
      // Create a new ChannelInfo object
      const newChannelInfo = {
        $type$: 'ChannelInfo',
        channelId: channelId,
        objects: channelObjects.map(obj => obj.hash || ''),
        created: Date.now(),
        modified: Date.now()
      };
      
      // Calculate a simple hash for the new object
      const hash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify(newChannelInfo))
        .digest('hex');
      
      try {
        fs.writeFileSync(path.join(channelInfoDir, hash), JSON.stringify(newChannelInfo));
        fs.writeFileSync(headPath, hash);
        result.actions.push(`Created new ChannelInfo object with hash: ${hash}`);
        result.actions.push(`Updated head pointer to new hash: ${hash}`);
        result.diagnostics.newChannelInfoHash = hash;
      } catch (err) {
        result.errors.push(`Failed to create new ChannelInfo object: ${err.message}`);
        return result;
      }
    }
    // Case 3: No head pointer and no ChannelInfo object
    else if (!headPointer && !latestChannelInfoObj) {
      // Create a new ChannelInfo object
      const newChannelInfo = {
        $type$: 'ChannelInfo',
        channelId: channelId,
        objects: channelObjects.map(obj => obj.hash || ''),
        created: Date.now(),
        modified: Date.now()
      };
      
      // Calculate a simple hash for the new object
      const hash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify(newChannelInfo))
        .digest('hex');
      
      try {
        fs.writeFileSync(path.join(channelInfoDir, hash), JSON.stringify(newChannelInfo));
        fs.writeFileSync(headPath, hash);
        result.actions.push(`Created new ChannelInfo object with hash: ${hash}`);
        result.actions.push(`Created new head pointer with hash: ${hash}`);
        result.diagnostics.newChannelInfoHash = hash;
      } catch (err) {
        result.errors.push(`Failed to create new ChannelInfo and head pointer: ${err.message}`);
        return result;
      }
    }
    // Case 4: Everything is in sync
    else if (headPointer && headPointer === result.diagnostics.latestChannelInfoHash) {
      result.actions.push('Head pointer is already in sync with latest ChannelInfo object');
    }
    
    // 9. Final verification
    try {
      const finalHeadPointer = fs.readFileSync(headPath, 'utf8');
      const channelInfoPath = path.join(channelInfoDir, finalHeadPointer);
      
      if (fs.existsSync(channelInfoPath)) {
        result.actions.push('Verification successful: head pointer references valid ChannelInfo object');
        result.success = true;
      } else {
        result.errors.push('Verification failed: head pointer references non-existent ChannelInfo object');
      }
    } catch (err) {
      result.errors.push(`Final verification failed: ${err.message}`);
    }
    
    return result;
  } catch (error) {
    result.errors.push(`Unexpected error: ${error.message}`);
    return result;
  }
}

// If called directly, run the fix
if (require.main === module) {
  const args = process.argv.slice(2);
  const storageDir = args[0];
  const channelId = args[1] || 'llm';
  
  if (!storageDir) {
    console.error('Error: Please provide a storage directory path as the first argument');
    console.error('Usage: node syncHeadPointerFix.js <storageDir> [channelId]');
    process.exit(1);
  }
  
  fixHeadPointerSync(storageDir, channelId).then(result => {
    console.log('\n=== Head Pointer Sync Fix Results ===');
    console.log('Success:', result.success);
    
    if (result.actions.length > 0) {
      console.log('\nActions taken:');
      result.actions.forEach((action, i) => {
        console.log(`${i+1}. ${action}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log('\nErrors encountered:');
      result.errors.forEach((error, i) => {
        console.log(`${i+1}. ${error}`);
      });
    }
    
    console.log('\nDiagnostic information:', JSON.stringify(result.diagnostics, null, 2));
    
    if (result.success) {
      console.log('\nFix was successful. Channel head pointer is now synchronized.');
      process.exit(0);
    } else {
      console.log('\nFix was not successful. Please check the errors above.');
      process.exit(1);
    }
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { fixHeadPointerSync }; 