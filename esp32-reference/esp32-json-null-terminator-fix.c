// ESP32 JSON Null Terminator Fix
// Fix for discovery messages not being properly null-terminated

// In esp32-unified-service.c, update both send_discovery_broadcast() and send_discovery_response()

// FIX 1: In send_discovery_broadcast() around line 320:
// OLD CODE:
//     size_t json_len = strlen(json_str);
//     uint8_t *packet = malloc(json_len + 1);
//     packet[0] = SERVICE_DISCOVERY;
//     memcpy(packet + 1, json_str, json_len);

// NEW CODE:
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 2);  // +1 for service byte, +1 for null terminator
    packet[0] = SERVICE_DISCOVERY;
    memcpy(packet + 1, json_str, json_len + 1);  // Copy including null terminator
    
    // And update the sendto call:
    ssize_t sent = sendto(service_socket, packet, json_len + 2, 0,  // Send all bytes including null
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));


// FIX 2: In send_discovery_response() around line 360:
// OLD CODE:
//     size_t json_len = strlen(json_str);
//     uint8_t *packet = malloc(json_len + 1);
//     packet[0] = SERVICE_DISCOVERY;
//     memcpy(packet + 1, json_str, json_len);

// NEW CODE:
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 2);  // +1 for service byte, +1 for null terminator
    packet[0] = SERVICE_DISCOVERY;
    memcpy(packet + 1, json_str, json_len + 1);  // Copy including null terminator
    
    // And update the sendto call:
    ssize_t sent = sendto(service_socket, packet, json_len + 2, 0,  // Send all bytes including null
                         (struct sockaddr *)&dest_addr, sizeof(dest_addr));


// FIX 3: Also fix send_credential_ack() around line 400:
// OLD CODE:
//     size_t json_len = strlen(json_str);
//     uint8_t *packet = malloc(json_len + 1);
//     packet[0] = SERVICE_CREDENTIAL;
//     memcpy(packet + 1, json_str, json_len);

// NEW CODE:
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 2);  // +1 for service byte, +1 for null terminator
    packet[0] = SERVICE_CREDENTIAL;
    memcpy(packet + 1, json_str, json_len + 1);  // Copy including null terminator
    
    // And update the sendto call:
    ssize_t sent = sendto(service_socket, packet, json_len + 2, 0,  // Send all bytes including null
                         (struct sockaddr *)&sender_addr, sizeof(sender_addr));


// ALTERNATIVE FIX (if you prefer to be explicit):
// Instead of relying on the null terminator in json_str, explicitly add it:
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 2);
    packet[0] = SERVICE_DISCOVERY;
    memcpy(packet + 1, json_str, json_len);
    packet[json_len + 1] = '\0';  // Explicitly add null terminator
    
    ssize_t sent = sendto(service_socket, packet, json_len + 2, 0,
                         (struct sockaddr *)&dest_addr, sizeof(dest_addr));