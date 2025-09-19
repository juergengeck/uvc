/**
 * UDP Packet Sender
 * 
 * This script provides a simple way to send UDP packets for testing.
 * It can be used to verify if the UDP socket is receiving packets.
 */

// Use platform UDP abstraction instead of direct dgram import
import { createSocket } from './udp';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { UdpModel } from '../models/network/UdpModel';
import { NetworkServiceType } from '../models/network/interfaces';
import Debug from 'debug';

// Configuration
const DEFAULT_PORT = 49497;
const DEFAULT_ADDRESS = '255.255.255.255'; // Broadcast
const DEFAULT_MESSAGE = 'LAMA_UDP_TEST';
const DEFAULT_INTERVAL = 1000; // 1 second

/**
 * Log a message with timestamp
 */
function log(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

/**
 * Send a UDP packet
 */
async function sendUdpPacket(
  message: string = DEFAULT_MESSAGE,
  port: number = DEFAULT_PORT,
  address: string = DEFAULT_ADDRESS
): Promise<void> {
  // Create a UDP socket using the platform abstraction
  const socket = await createSocket({ type: 'udp4' });
  
  try {
    // Enable broadcast
    await socket.setBroadcast(true);
    
    // Create message buffer
    const messageWithTimestamp = `${message}_${Date.now()}`;
    const buffer = Buffer.from(messageWithTimestamp);
    
    log(`Sending UDP packet to ${address}:${port}: ${messageWithTimestamp}`);
    
    // Send the message using the correct parameter order (message, host, port)
    await socket.send(buffer, address, port);
    log('UDP packet sent successfully');
  } catch (err: any) {
    log(`Error sending UDP packet: ${err.message}`);
    throw err;
  } finally {
    // Always close the socket
    await socket.close();
  }
}

/**
 * Send UDP packets at regular intervals
 */
async function sendUdpPacketsInterval(
  count: number = 10,
  interval: number = DEFAULT_INTERVAL,
  message: string = DEFAULT_MESSAGE,
  port: number = DEFAULT_PORT,
  address: string = DEFAULT_ADDRESS
): Promise<void> {
  log(`Starting to send ${count} UDP packets at ${interval}ms intervals`);
  
  for (let i = 0; i < count; i++) {
    try {
      await sendUdpPacket(`${message}_${i+1}of${count}`, port, address);
      
      // Wait for the interval unless it's the last packet
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      log(`Failed to send packet ${i+1}: ${error}`);
    }
  }
  
  log(`Finished sending ${count} UDP packets`);
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  count: number;
  interval: number;
  message: string;
  port: number;
  address: string;
} {
  const args = process.argv.slice(2);
  
  // Default values
  const options = {
    count: 10,
    interval: DEFAULT_INTERVAL,
    message: DEFAULT_MESSAGE,
    port: DEFAULT_PORT,
    address: DEFAULT_ADDRESS
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--count':
      case '-c':
        options.count = parseInt(args[++i], 10);
        break;
      case '--interval':
      case '-i':
        options.interval = parseInt(args[++i], 10);
        break;
      case '--message':
      case '-m':
        options.message = args[++i];
        break;
      case '--port':
      case '-p':
        options.port = parseInt(args[++i], 10);
        break;
      case '--address':
      case '-a':
        options.address = args[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
    }
  }
  
  return options;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log('UDP Packet Sender');
  console.log('----------------');
  console.log('Usage: npx ts-node src/platform/udp-sender.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --count, -c     Number of packets to send (default: 10)');
  console.log('  --interval, -i  Interval between packets in ms (default: 1000)');
  console.log('  --message, -m   Message to send (default: LAMA_UDP_TEST)');
  console.log('  --port, -p      Port to send to (default: 49497)');
  console.log('  --address, -a   Address to send to (default: 255.255.255.255)');
  console.log('  --help, -h      Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node src/platform/udp-sender.ts');
  console.log('  npx ts-node src/platform/udp-sender.ts -c 5 -i 500');
  console.log('  npx ts-node src/platform/udp-sender.ts -a 192.168.1.255 -p 8080');
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const options = parseArgs();
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }
  
  log('UDP Packet Sender');
  log('----------------');
  log(`Configuration:`);
  log(`- Count: ${options.count}`);
  log(`- Interval: ${options.interval}ms`);
  log(`- Message: ${options.message}`);
  log(`- Port: ${options.port}`);
  log(`- Address: ${options.address}`);
  log('');
  
  await sendUdpPacketsInterval(
    options.count,
    options.interval,
    options.message,
    options.port,
    options.address
  );
}

// Run the main function
main().catch(err => {
  log(`Unhandled error: ${err}`);
  process.exit(1);
}); 