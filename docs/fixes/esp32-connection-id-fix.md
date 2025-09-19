# ESP32 QUICVC Connection ID Tracking Fix

## Problem
The ESP32 firmware is not properly tracking connection IDs (DCID/SCID) established during the QUICVC handshake. This causes the React Native app to fail when looking up connections for PROTECTED packets.

## Root Cause Analysis

### Current Behavior
1. ESP32 receives INITIAL packet from app with specific DCID and SCID
2. ESP32 creates a connection but only tracks IP/port, not connection IDs
3. When sending PROTECTED packets, ESP32 always uses:
   - DCID: [0, 0, 0, 0, 0, 0, 0, 0] (zeros)
   - SCID: [MAC_ADDR, 0, 0] (device MAC + padding)
4. App can't find connection because IDs don't match handshake

### Expected Behavior
1. During handshake, ESP32 should store the DCID and SCID from the peer
2. When sending responses, ESP32 should swap IDs (peer's SCID becomes our DCID)
3. Use the correct connection IDs for all subsequent packets

## Fix Implementation

### 1. Update Connection Structure
Add connection ID fields to track the IDs:

```c
// In main.c, update the quicvc_connection_t structure:
typedef struct {
    uint32_t connection_id;
    struct sockaddr_in peer_addr;
    quicvc_connection_state_t state;
    uint64_t tx_packet_num;
    uint64_t rx_packet_num;
    uint64_t last_activity;
    bool is_authenticated;
    char owner_person_id[65];
    uint8_t session_key[32];
    bool is_active;
    
    // ADD THESE FIELDS:
    uint8_t local_cid[8];   // Our connection ID (SCID when sending)
    uint8_t remote_cid[8];  // Peer's connection ID (DCID when sending)
    bool cids_initialized;  // Whether CIDs have been set
} quicvc_connection_t;
```

### 2. Store Connection IDs During Handshake

```c
// In handle_initial_packet(), after parsing the header:
static esp_err_t handle_initial_packet(uint8_t *payload, size_t len, struct sockaddr_in *from_addr) {
    // ... existing header parsing code ...
    
    // After parsing DCID and SCID from the packet:
    uint8_t peer_dcid[8];
    uint8_t peer_scid[8];
    // ... extract these from packet ...
    
    // Find or create connection
    quicvc_connection_t *conn = find_connection(from_addr);
    if (!conn) {
        conn = create_connection(from_addr);
    }
    
    if (conn && !conn->cids_initialized) {
        // Store connection IDs (swap them for our perspective)
        memcpy(conn->remote_cid, peer_scid, 8);  // Their SCID is our DCID
        memcpy(conn->local_cid, peer_dcid, 8);   // Their DCID is our SCID
        conn->cids_initialized = true;
        
        ESP_LOGI(TAG, "Stored CIDs - Local: %02x%02x%02x%02x, Remote: %02x%02x%02x%02x",
                 conn->local_cid[0], conn->local_cid[1], conn->local_cid[2], conn->local_cid[3],
                 conn->remote_cid[0], conn->remote_cid[1], conn->remote_cid[2], conn->remote_cid[3]);
    }
    
    // ... rest of handling ...
}
```

### 3. Update send_quicvc_packet to Use Connection IDs

```c
static esp_err_t send_quicvc_packet_with_conn(quicvc_packet_type_t packet_type, 
                                              uint8_t *payload, size_t len, 
                                              struct sockaddr_in *to_addr,
                                              quicvc_connection_t *conn) {
    uint8_t *packet = malloc(MAX_PACKET_SIZE);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet buffer");
        return ESP_ERR_NO_MEM;
    }
    
    size_t packet_len = 0;
    
    // Build header
    uint8_t flags = 0x80 | (packet_type & 0x03);
    packet[packet_len++] = flags;
    
    // Version
    packet[packet_len++] = 0x00;
    packet[packet_len++] = 0x00;
    packet[packet_len++] = 0x00;
    packet[packet_len++] = 0x01;
    
    // Use connection IDs if available
    if (conn && conn->cids_initialized) {
        // DCID Length and value
        packet[packet_len++] = 8;
        memcpy(packet + packet_len, conn->remote_cid, 8);
        packet_len += 8;
        
        // SCID Length and value
        packet[packet_len++] = 8;
        memcpy(packet + packet_len, conn->local_cid, 8);
        packet_len += 8;
        
        ESP_LOGD(TAG, "Using connection CIDs - DCID: %02x%02x..., SCID: %02x%02x...",
                 conn->remote_cid[0], conn->remote_cid[1],
                 conn->local_cid[0], conn->local_cid[1]);
    } else {
        // Fallback to old behavior for discovery/initial packets
        packet[packet_len++] = 8;
        memset(packet + packet_len, 0, 8);
        packet_len += 8;
        
        packet[packet_len++] = 8;
        memcpy(packet + packet_len, device_mac, 6);
        packet[packet_len + 6] = 0;
        packet[packet_len + 7] = 0;
        packet_len += 8;
    }
    
    // Packet number
    if (conn) {
        packet[packet_len++] = conn->tx_packet_num & 0xFF;
        conn->tx_packet_num++;
    } else {
        packet[packet_len++] = 0x00;
    }
    
    // Add payload
    memcpy(packet + packet_len, payload, len);
    packet_len += len;
    
    // Send packet
    ssize_t sent = sendto(quicvc_socket, packet, packet_len, 0, 
                         (struct sockaddr*)to_addr, sizeof(struct sockaddr_in));
    
    free(packet);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send QUICVC packet: %d", errno);
        return ESP_FAIL;
    }
    
    return ESP_OK;
}
```

### 4. Update All Packet Sending Functions

```c
// Update send_frame_in_packet to pass connection:
static esp_err_t send_frame_in_packet(quicvc_packet_type_t packet_type, 
                                     quicvc_frame_type_t frame_type, 
                                     uint8_t *frame_data, size_t frame_len, 
                                     struct sockaddr_in *to_addr) {
    // Find connection for this address
    quicvc_connection_t *conn = find_connection(to_addr);
    
    uint8_t *payload = malloc(MAX_PACKET_SIZE);
    // ... build frame ...
    
    // Use new function with connection
    esp_err_t ret = send_quicvc_packet_with_conn(packet_type, payload, payload_len, to_addr, conn);
    free(payload);
    return ret;
}
```

### 5. Update Connection Lookup to Support CID Matching

```c
static quicvc_connection_t* find_connection_by_cid(uint8_t *dcid, uint8_t *scid) {
    for (int i = 0; i < MAX_CONNECTIONS; i++) {
        if (connections[i].is_active && connections[i].cids_initialized) {
            // Check if CIDs match (they may be swapped in the packet)
            if (memcmp(connections[i].local_cid, dcid, 8) == 0 ||
                memcmp(connections[i].remote_cid, scid, 8) == 0) {
                return &connections[i];
            }
        }
    }
    return NULL;
}
```

## Testing the Fix

### 1. Verify Discovery Still Works
- Device should broadcast with zero CIDs (no connection yet)
- App should receive and process discovery packets

### 2. Verify Handshake
- App sends INITIAL with specific CIDs
- ESP32 stores and swaps CIDs correctly
- Response uses correct CIDs

### 3. Verify PROTECTED Packets
- LED control commands should use established CIDs
- App should find connection and process response
- No more "connection not found" errors

### 4. Monitor with Logging
Add debug logging to verify CID usage:
```c
ESP_LOGI(TAG, "Packet CIDs - Type: %d, DCID: %02x%02x%02x%02x..., SCID: %02x%02x%02x%02x...",
         packet_type,
         dcid[0], dcid[1], dcid[2], dcid[3],
         scid[0], scid[1], scid[2], scid[3]);
```

## Expected Results
After implementing this fix:
1. ESP32 will properly track connection IDs from handshake
2. PROTECTED packets will use correct DCID/SCID
3. React Native app will successfully find connections
4. LED control and other commands will work reliably
5. No more "ESP32 response may have been lost" errors