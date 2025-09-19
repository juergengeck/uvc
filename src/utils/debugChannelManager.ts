/**
 * Debug utilities for investigating ChannelManager duplicate issues
 */

import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';

/**
 * Investigate why ChannelManager.getObjectsWithType returns duplicates
 */
export async function debugChannelManagerDuplicates(
  channelManager: ChannelManager,
  channelId: string
): Promise<void> {
  console.log(`\n🔍 [ChannelManager Debug] Investigating duplicates for channel: ${channelId}`);
  console.log('='.repeat(80));

  try {
    // 1. Get channel info
    console.log('\n1️⃣ CHANNEL INFO:');
    const channelInfos = await channelManager.getMatchingChannelInfos({ channelId });
    console.log(`   Found ${channelInfos.length} channel info(s)`);
    
    channelInfos.forEach((info, index) => {
      console.log(`   Channel ${index + 1}:`);
      console.log(`     - Owner: ${info.owner?.substring(0, 8) || 'null'}`);
      console.log(`     - Hash: ${info.idHash?.substring(0, 8)}`);
      console.log(`     - Head: ${info.head?.substring(0, 8) || 'null'}`);
    });

    // 2. Test different query approaches
    console.log('\n2️⃣ QUERY METHODS COMPARISON:');
    
    // Method 1: getObjectsWithType (current approach)
    console.log('\n   📋 Method 1: getObjectsWithType');
    try {
      const objects1 = await channelManager.getObjectsWithType('ChatMessage' as any, {
        channelId,
        orderBy: Order.Descending
      } as any);
      
      console.log(`     - Result count: ${objects1.length}`);
      
      if (objects1.length > 0) {
        const hashes1 = objects1.map(obj => obj.dataHash);
        const uniqueHashes1 = new Set(hashes1);
        const duplicateCount1 = hashes1.length - uniqueHashes1.size;
        
        console.log(`     - Unique hashes: ${uniqueHashes1.size}`);
        console.log(`     - Duplicate count: ${duplicateCount1}`);
        
        if (duplicateCount1 > 0) {
          console.log(`     🚨 DUPLICATES FOUND in getObjectsWithType!`);
          
          // Show which hashes are duplicated
          const hashCounts = new Map<string, number>();
          hashes1.forEach(hash => {
            if (hash) {
              hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
            }
          });
          
          const duplicatedHashes = Array.from(hashCounts.entries())
            .filter(([_, count]) => count > 1)
            .slice(0, 3); // Show first 3
            
          duplicatedHashes.forEach(([hash, count]) => {
            console.log(`       - Hash ${hash.substring(0, 8)} appears ${count} times`);
          });
        }
      }
    } catch (error) {
      console.error(`     ❌ Error: ${error.message}`);
    }

    // Method 2: getObjects (alternative approach)
    console.log('\n   📋 Method 2: getObjects');
    try {
      const objects2 = await channelManager.getObjects({
        channelId,
        orderBy: Order.Descending
      });
      
      console.log(`     - Result count: ${objects2.length}`);
      
      if (objects2.length > 0) {
        const hashes2 = objects2.map(obj => obj.idHash).filter(Boolean);
        const uniqueHashes2 = new Set(hashes2);
        const duplicateCount2 = hashes2.length - uniqueHashes2.size;
        
        console.log(`     - Unique hashes: ${uniqueHashes2.size}`);
        console.log(`     - Duplicate count: ${duplicateCount2}`);
        
        if (duplicateCount2 > 0) {
          console.log(`     🚨 DUPLICATES FOUND in getObjects!`);
        } else {
          console.log(`     ✅ No duplicates in getObjects`);
        }
      }
    } catch (error) {
      console.error(`     ❌ Error: ${error.message}`);
    }

    // 3. Check raw channel entries
    console.log('\n3️⃣ RAW CHANNEL ENTRIES:');
    try {
      // Try to get raw channel iterator like one.leute does
      if (channelInfos.length > 0) {
        const channelInfo = channelInfos[0];
        console.log(`   Using channel info: ${channelInfo.idHash?.substring(0, 8)}`);
        
        // Get raw channel entries
        const iterator = (ChannelManager as any).singleChannelObjectIterator?.(channelInfo);
        if (iterator) {
          console.log(`   ✅ Got raw channel iterator`);
          
          const rawEntries = [];
          let count = 0;
          for await (const entry of iterator) {
            rawEntries.push(entry);
            count++;
            if (count >= 10) break; // Limit to first 10 for testing
          }
          
          console.log(`   - Raw entries retrieved: ${rawEntries.length}`);
          
          const rawHashes = rawEntries.map(entry => entry.dataHash).filter(Boolean);
          const uniqueRawHashes = new Set(rawHashes);
          const duplicateRawCount = rawHashes.length - uniqueRawHashes.size;
          
          console.log(`   - Unique raw hashes: ${uniqueRawHashes.size}`);
          console.log(`   - Duplicate raw count: ${duplicateRawCount}`);
          
          if (duplicateRawCount > 0) {
            console.log(`   🚨 DUPLICATES FOUND in raw channel entries!`);
          } else {
            console.log(`   ✅ No duplicates in raw channel entries`);
          }
        } else {
          console.log(`   ❌ Could not get raw channel iterator`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error getting raw entries: ${error.message}`);
    }

    // 4. Compare query parameters
    console.log('\n4️⃣ QUERY PARAMETER EFFECTS:');
    
    const testQueries = [
      { name: 'No parameters', params: { channelId } },
      { name: 'With Order.Descending', params: { channelId, orderBy: Order.Descending } },
      { name: 'With limit 10', params: { channelId, orderBy: Order.Descending, limit: 10 } },
      { name: 'With limit 50', params: { channelId, orderBy: Order.Descending, limit: 50 } }
    ];
    
    for (const query of testQueries) {
      try {
        console.log(`\n   📊 Testing: ${query.name}`);
        const results = await channelManager.getObjectsWithType('ChatMessage' as any, query.params as any);
        
        const hashes = results.map(obj => obj.dataHash).filter(Boolean);
        const uniqueHashes = new Set(hashes);
        const duplicateCount = hashes.length - uniqueHashes.size;
        
        console.log(`     - Total: ${results.length}, Unique: ${uniqueHashes.size}, Duplicates: ${duplicateCount}`);
        
        if (duplicateCount > 0) {
          console.log(`     🚨 ${duplicateCount} duplicates with these parameters!`);
        }
      } catch (error) {
        console.log(`     ❌ Error: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }

  console.log('='.repeat(80));
  console.log('🔍 [ChannelManager Debug] Complete\n');
}

/**
 * Quick duplicate check for a channel
 */
export async function quickDuplicateCheck(
  channelManager: ChannelManager,
  channelId: string
): Promise<boolean> {
  try {
    const objects = await channelManager.getObjectsWithType('ChatMessage' as any, {
      channelId,
      orderBy: Order.Descending
    } as any);
    
    const hashes = objects.map(obj => obj.dataHash).filter(Boolean);
    const uniqueHashes = new Set(hashes);
    const hasDuplicates = hashes.length !== uniqueHashes.size;
    
    if (hasDuplicates) {
      console.warn(`[QuickDuplicateCheck] 🚨 Duplicates detected in channel ${channelId}: ${hashes.length} total, ${uniqueHashes.size} unique`);
    }
    
    return hasDuplicates;
  } catch (error) {
    console.error(`[QuickDuplicateCheck] Error: ${error.message}`);
    return false;
  }
}