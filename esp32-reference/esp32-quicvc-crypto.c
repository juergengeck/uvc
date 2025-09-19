// ESP32 QUICVC Crypto Implementation
// Adds proper encryption to the minimal QUICVC implementation

#include "mbedtls/aes.h"
#include "mbedtls/gcm.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"

// Crypto context for QUICVC
typedef struct {
    mbedtls_gcm_context gcm;
    uint8_t send_key[32];
    uint8_t recv_key[32];
    uint8_t send_iv[12];
    uint8_t recv_iv[12];
    uint64_t send_counter;
    uint64_t recv_counter;
} quicvc_crypto_t;

static quicvc_crypto_t *crypto_ctx = NULL;

// Initialize crypto context
esp_err_t quicvc_crypto_init(void) {
    if (crypto_ctx) {
        quicvc_crypto_cleanup();
    }
    
    crypto_ctx = calloc(1, sizeof(quicvc_crypto_t));
    if (!crypto_ctx) {
        return ESP_ERR_NO_MEM;
    }
    
    mbedtls_gcm_init(&crypto_ctx->gcm);
    return ESP_OK;
}

// Derive encryption keys from session key
esp_err_t quicvc_derive_keys(const uint8_t *session_key, int is_server) {
    if (!crypto_ctx) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // Derive separate keys for send/receive
    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    
    // Send key
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, session_key, 32);
    mbedtls_sha256_update(&sha, (uint8_t*)(is_server ? "server-send" : "client-send"), 11);
    mbedtls_sha256_finish(&sha, crypto_ctx->send_key);
    
    // Receive key
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, session_key, 32);
    mbedtls_sha256_update(&sha, (uint8_t*)(is_server ? "client-send" : "server-send"), 11);
    mbedtls_sha256_finish(&sha, crypto_ctx->recv_key);
    
    // IVs
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, session_key, 32);
    mbedtls_sha256_update(&sha, (uint8_t*)"iv-material", 11);
    uint8_t iv_material[32];
    mbedtls_sha256_finish(&sha, iv_material);
    
    memcpy(crypto_ctx->send_iv, iv_material, 12);
    memcpy(crypto_ctx->recv_iv, &iv_material[12], 12);
    
    mbedtls_sha256_free(&sha);
    
    // Setup GCM for sending
    int ret = mbedtls_gcm_setkey(&crypto_ctx->gcm, MBEDTLS_CIPHER_ID_AES, 
                                crypto_ctx->send_key, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to set GCM key: %d", ret);
        return ESP_FAIL;
    }
    
    return ESP_OK;
}

// Encrypt packet payload
esp_err_t quicvc_encrypt_packet(const uint8_t *plaintext, size_t plain_len,
                               uint8_t *ciphertext, size_t *cipher_len,
                               uint64_t packet_number) {
    if (!crypto_ctx) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // Prepare nonce (IV + packet number)
    uint8_t nonce[12];
    memcpy(nonce, crypto_ctx->send_iv, 12);
    for (int i = 0; i < 8; i++) {
        nonce[11 - i] ^= (packet_number >> (i * 8)) & 0xFF;
    }
    
    // Encrypt with AES-GCM
    uint8_t tag[16];
    int ret = mbedtls_gcm_crypt_and_tag(&crypto_ctx->gcm,
                                        MBEDTLS_GCM_ENCRYPT,
                                        plain_len,
                                        nonce, 12,
                                        NULL, 0,  // No additional data
                                        plaintext,
                                        ciphertext,
                                        16, tag);
    if (ret != 0) {
        ESP_LOGE(TAG, "Encryption failed: %d", ret);
        return ESP_FAIL;
    }
    
    // Append tag to ciphertext
    memcpy(ciphertext + plain_len, tag, 16);
    *cipher_len = plain_len + 16;
    
    crypto_ctx->send_counter++;
    return ESP_OK;
}

// Decrypt packet payload
esp_err_t quicvc_decrypt_packet(const uint8_t *ciphertext, size_t cipher_len,
                               uint8_t *plaintext, size_t *plain_len,
                               uint64_t packet_number) {
    if (!crypto_ctx || cipher_len < 16) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Setup GCM for receiving
    mbedtls_gcm_context recv_gcm;
    mbedtls_gcm_init(&recv_gcm);
    int ret = mbedtls_gcm_setkey(&recv_gcm, MBEDTLS_CIPHER_ID_AES,
                                crypto_ctx->recv_key, 256);
    if (ret != 0) {
        mbedtls_gcm_free(&recv_gcm);
        return ESP_FAIL;
    }
    
    // Prepare nonce
    uint8_t nonce[12];
    memcpy(nonce, crypto_ctx->recv_iv, 12);
    for (int i = 0; i < 8; i++) {
        nonce[11 - i] ^= (packet_number >> (i * 8)) & 0xFF;
    }
    
    // Decrypt
    size_t data_len = cipher_len - 16;
    ret = mbedtls_gcm_auth_decrypt(&recv_gcm,
                                   data_len,
                                   nonce, 12,
                                   NULL, 0,  // No additional data
                                   ciphertext + data_len, 16,  // Tag at end
                                   ciphertext,
                                   plaintext);
    
    mbedtls_gcm_free(&recv_gcm);
    
    if (ret != 0) {
        ESP_LOGE(TAG, "Decryption failed: %d", ret);
        return ESP_FAIL;
    }
    
    *plain_len = data_len;
    crypto_ctx->recv_counter++;
    return ESP_OK;
}

// Build encrypted QUICVC packet
esp_err_t quicvc_build_encrypted_packet(quicvc_connection_t *conn,
                                       const uint8_t *payload, size_t payload_len,
                                       uint8_t *packet, size_t *packet_len) {
    if (!conn || conn->state != 2) {
        return ESP_ERR_INVALID_STATE;
    }
    
    size_t offset = 0;
    
    // Header
    packet[offset++] = QUICVC_PROTECTED;
    
    // Version
    uint32_t version = htonl(QUICVC_VERSION);
    memcpy(&packet[offset], &version, 4);
    offset += 4;
    
    // Connection IDs
    packet[offset++] = CONNECTION_ID_LEN;
    packet[offset++] = CONNECTION_ID_LEN;
    memcpy(&packet[offset], conn->dcid, CONNECTION_ID_LEN);
    offset += CONNECTION_ID_LEN;
    memcpy(&packet[offset], conn->scid, CONNECTION_ID_LEN);
    offset += CONNECTION_ID_LEN;
    
    // Packet number
    uint64_t pkt_num = conn->packet_number++;
    memcpy(&packet[offset], &pkt_num, 8);
    offset += 8;
    
    // Encrypt payload
    size_t encrypted_len;
    esp_err_t err = quicvc_encrypt_packet(payload, payload_len,
                                         &packet[offset], &encrypted_len,
                                         pkt_num);
    if (err != ESP_OK) {
        return err;
    }
    
    *packet_len = offset + encrypted_len;
    return ESP_OK;
}

// Handle encrypted packet
esp_err_t quicvc_handle_encrypted_packet(quicvc_connection_t *conn,
                                        const uint8_t *packet, size_t packet_len,
                                        uint64_t packet_number) {
    if (!conn || conn->state != 2) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // Decrypt payload
    uint8_t plaintext[1024];
    size_t plain_len;
    esp_err_t err = quicvc_decrypt_packet(packet, packet_len,
                                         plaintext, &plain_len,
                                         packet_number);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to decrypt packet");
        return err;
    }
    
    // Process decrypted frames
    if (plain_len > 0) {
        uint8_t frame_type = plaintext[0];
        const uint8_t *frame_data = &plaintext[1];
        size_t frame_len = plain_len - 1;
        
        switch (frame_type) {
            case FRAME_HEARTBEAT:
                ESP_LOGD(TAG, "Decrypted heartbeat");
                break;
                
            case FRAME_DATA:
                ESP_LOGI(TAG, "Decrypted data: %.*s", (int)frame_len, frame_data);
                // Handle commands here
                handle_command((const char*)frame_data, frame_len);
                break;
                
            default:
                ESP_LOGW(TAG, "Unknown frame type: 0x%02x", frame_type);
        }
    }
    
    return ESP_OK;
}

// Example command handler
void handle_command(const char *data, size_t len) {
    cJSON *cmd = cJSON_ParseWithLength(data, len);
    if (!cmd) {
        ESP_LOGE(TAG, "Failed to parse command");
        return;
    }
    
    cJSON *type = cJSON_GetObjectItem(cmd, "type");
    if (type && cJSON_IsString(type)) {
        if (strcmp(type->valuestring, "led_control") == 0) {
            cJSON *state = cJSON_GetObjectItem(cmd, "state");
            if (state && cJSON_IsString(state)) {
                bool led_on = strcmp(state->valuestring, "on") == 0;
                gpio_set_level(BLUE_LED_GPIO, led_on ? 1 : 0);
                ESP_LOGI(TAG, "LED set to %s via QUICVC", led_on ? "ON" : "OFF");
                
                // Send response
                char response[128];
                snprintf(response, sizeof(response), 
                        "{\"type\":\"led_response\",\"state\":\"%s\"}", 
                        led_on ? "on" : "off");
                quicvc_send_data(response);
            }
        }
    }
    
    cJSON_Delete(cmd);
}

// Send encrypted data
esp_err_t quicvc_send_data(const char *data) {
    if (!active_connection || active_connection->state != 2) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // Build data frame
    uint8_t frame[512];
    frame[0] = FRAME_DATA;
    size_t data_len = strlen(data);
    memcpy(&frame[1], data, data_len);
    
    // Build and send encrypted packet
    uint8_t packet[1024];
    size_t packet_len;
    esp_err_t err = quicvc_build_encrypted_packet(active_connection,
                                                 frame, data_len + 1,
                                                 packet, &packet_len);
    if (err != ESP_OK) {
        return err;
    }
    
    // Send to peer
    struct sockaddr_in peer_addr;
    // Note: You'll need to store peer address from initial connection
    
    ESP_LOGI(TAG, "Sent encrypted data: %s", data);
    return ESP_OK;
}

// Cleanup
void quicvc_crypto_cleanup(void) {
    if (crypto_ctx) {
        mbedtls_gcm_free(&crypto_ctx->gcm);
        memset(crypto_ctx, 0, sizeof(quicvc_crypto_t));
        free(crypto_ctx);
        crypto_ctx = NULL;
    }
}