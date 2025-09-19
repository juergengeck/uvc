/**
 * UDP Packet Sender (JavaScript version)
 * 
 * This script provides a simple way to send UDP packets for testing.
 * It can be used to verify if the UDP socket is receiving packets.
 */

const dgram = require('dgram');

// Configuration
const DEFAULT_PORT = 49497;
const DEFAULT_ADDRESS = '255.255.255.255'; // Broadcast
const DEFAULT_MESSAGE = 'LAMA_UDP_TEST';
const DEFAULT_INTERVAL = 1000; // 1 second

/**
 * Log a message with timestamp
 */
function log(message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

/**
 * Send a UDP packet
 */
async function sendUdpPacket(
  message = DEFAULT_MESSAGE,
  port = DEFAULT_PORT,
  address = DEFAULT_ADDRESS
) {
  return new Promise((resolve, reject) => {
    // Create a UDP socket
    const socket = dgram.createSocket('udp4');
    
    // Enable broadcast
    socket.setBroadcast(true);
    
    // Create message buffer
    const messageWithTimestamp = `${message}_${Date.now()}`;
    const buffer = Buffer.from(messageWithTimestamp);
    
    log(`Sending UDP packet to ${address}:${port}: ${messageWithTimestamp}`);
    
    // Send the message
    socket.send(buffer, 0, buffer.length, port, address, (err) => {
      if (err) {
        log(`Error sending UDP packet: ${err.message}`);
        socket.close();
        reject(err);
        return;
      }
      
      log('UDP packet sent successfully');
      socket.close();
      resolve();
    });
  });
}

/**
 * Send UDP packets at regular intervals
 */
async function sendUdpPacketsInterval(
  count = 10,
  interval = DEFAULT_INTERVAL,
  message = DEFAULT_MESSAGE,
  port = DEFAULT_PORT,
  address = DEFAULT_ADDRESS
) {
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
function parseArgs() {
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
function printUsage() {
  console.log('UDP Packet Sender');
  console.log('----------------');
  console.log('Usage: node src/platform/udp-sender.js [options]');
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
  console.log('  node src/platform/udp-sender.js');
  console.log('  node src/platform/udp-sender.js -c 5 -i 500');
  console.log('  node src/platform/udp-sender.js -a 192.168.1.255 -p 8080');
}

/**
 * Main function
 */
async function main() {
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