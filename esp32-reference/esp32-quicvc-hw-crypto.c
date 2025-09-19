// ESP32 QUICVC with Hardware Crypto Acceleration
// Uses ESP32's hardware AES, SHA, and RNG peripherals for better performance

#include "esp_log.h"
#include "esp_system.h"
#include "esp_random.h"
#include "mbedtls/aes.h"
#include "mbedtls/sha256.h"
#include "mbedtls/gcm.h"
#include "esp_crypto_lock.h"  // For hardware peripheral locking
#include "hal/aes_hal.h"      // Hardware AES
#include "hal/sha_hal.h"      // Hardware SHA

#define TAG "QUICVC_HW"

// When hardware crypto is enabled, mbedtls automatically uses it
// No need to explicitly call hardware functions - mbedtls does it for us

// Enhanced crypto context with hardware optimization hints
typedef struct {
    mbedtls_gcm_context gcm;
    uint8_t send_key[32] __attribute__((aligned(4)));    // Aligned for DMA
    uint8_t recv_key[32] __attribute__((aligned(4)));
    uint8_t send_iv[16] __attribute__((aligned(4)));     // Use 16 bytes for alignment
    uint8_t recv_iv[16] __attribute__((aligned(4)));
    uint64_t send_counter;
    uint64_t recv_counter;
    bool hw_initialized;
} quicvc_hw_crypto_t;

static quicvc_hw_crypto_t *hw_crypto = NULL;

// Generate truly random bytes using ESP32 hardware RNG
void quicvc_hw_random(uint8_t *buf, size_t len) {
    // esp_random() uses hardware RNG
    esp_fill_random(buf, len);
}

// Initialize hardware crypto
esp_err_t quicvc_hw_crypto_init(void) {
    if (hw_crypto) {
        quicvc_hw_crypto_cleanup();
    }
    
    // Allocate aligned memory for DMA
    hw_crypto = heap_caps_aligned_alloc(16, sizeof(quicvc_hw_crypto_t), 
                                        MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
    if (!hw_crypto) {
        ESP_LOGE(TAG, "Failed to allocate DMA-capable memory");
        return ESP_ERR_NO_MEM;
    }
    
    memset(hw_crypto, 0, sizeof(quicvc_hw_crypto_t));
    mbedtls_gcm_init(&hw_crypto->gcm);
    
    hw_crypto->hw_initialized = true;
    ESP_LOGI(TAG, "Hardware crypto initialized (AES=%d, SHA=%d)", 
             CONFIG_MBEDTLS_HARDWARE_AES, CONFIG_MBEDTLS_HARDWARE_SHA);
    
    return ESP_OK;
}

// Hardware-accelerated key derivation
esp_err_t quicvc_hw_derive_keys(const uint8_t *session_key, int is_server) {
    if (!hw_crypto || !hw_crypto->hw_initialized) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // mbedtls_sha256 automatically uses hardware when CONFIG_MBEDTLS_HARDWARE_SHA=y
    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    
    // Derive send key
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, session_key, 32);
    mbedtls_sha256_update(&sha, (uint8_t*)(is_server ? "server-send" : "client-send"), 11);
    mbedtls_sha256_finish(&sha, hw_crypto->send_key);
    
    // Derive receive key
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, session_key, 32);
    mbedtls_sha256_update(&sha, (uint8_t*)(is_server ? "client-send" : "server-send"), 11);
    mbedtls_sha256_finish(&sha, hw_crypto->recv_key);
    
    // Generate IVs using hardware RNG
    quicvc_hw_random(hw_crypto->send_iv, 16);
    quicvc_hw_random(hw_crypto->recv_iv, 16);
    
    mbedtls_sha256_free(&sha);
    
    // Setup GCM with hardware AES
    // mbedtls_gcm automatically uses hardware AES when CONFIG_MBEDTLS_HARDWARE_AES=y
    int ret = mbedtls_gcm_setkey(&hw_crypto->gcm, MBEDTLS_CIPHER_ID_AES,
                                hw_crypto->send_key, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to set GCM key: %d", ret);
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Keys derived using hardware acceleration");
    return ESP_OK;
}

// Hardware-accelerated packet encryption
esp_err_t quicvc_hw_encrypt_packet(const uint8_t *plaintext, size_t plain_len,
                                  uint8_t *ciphertext, size_t *cipher_len,
                                  uint64_t packet_number) {
    if (!hw_crypto || !hw_crypto->hw_initialized) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // Ensure alignment for hardware operations
    if ((uintptr_t)plaintext & 3 || (uintptr_t)ciphertext & 3) {
        ESP_LOGW(TAG, "Unaligned buffers, hardware may be slower");
    }
    
    // Prepare nonce
    uint8_t nonce[16] __attribute__((aligned(4)));
    memcpy(nonce, hw_crypto->send_iv, 16);
    
    // XOR packet number into nonce
    for (int i = 0; i < 8; i++) {
        nonce[15 - i] ^= (packet_number >> (i * 8)) & 0xFF;
    }
    
    // Hardware-accelerated AES-GCM encryption
    uint8_t tag[16] __attribute__((aligned(4)));
    int ret = mbedtls_gcm_crypt_and_tag(&hw_crypto->gcm,
                                        MBEDTLS_GCM_ENCRYPT,
                                        plain_len,
                                        nonce, 12,  // Use 12 bytes of nonce
                                        NULL, 0,    // No additional data
                                        plaintext,
                                        ciphertext,
                                        16, tag);
    if (ret != 0) {
        ESP_LOGE(TAG, "Hardware encryption failed: %d", ret);
        return ESP_FAIL;
    }
    
    // Append tag
    memcpy(ciphertext + plain_len, tag, 16);
    *cipher_len = plain_len + 16;
    
    hw_crypto->send_counter++;
    return ESP_OK;
}

// Hardware-accelerated packet decryption
esp_err_t quicvc_hw_decrypt_packet(const uint8_t *ciphertext, size_t cipher_len,
                                  uint8_t *plaintext, size_t *plain_len,
                                  uint64_t packet_number) {
    if (!hw_crypto || !hw_crypto->hw_initialized || cipher_len < 16) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Setup receive GCM context
    mbedtls_gcm_context recv_gcm;
    mbedtls_gcm_init(&recv_gcm);
    int ret = mbedtls_gcm_setkey(&recv_gcm, MBEDTLS_CIPHER_ID_AES,
                                hw_crypto->recv_key, 256);
    if (ret != 0) {
        mbedtls_gcm_free(&recv_gcm);
        return ESP_FAIL;
    }
    
    // Prepare nonce
    uint8_t nonce[16] __attribute__((aligned(4)));
    memcpy(nonce, hw_crypto->recv_iv, 16);
    
    // XOR packet number into nonce
    for (int i = 0; i < 8; i++) {
        nonce[15 - i] ^= (packet_number >> (i * 8)) & 0xFF;
    }
    
    // Hardware-accelerated decryption
    size_t data_len = cipher_len - 16;
    ret = mbedtls_gcm_auth_decrypt(&recv_gcm,
                                   data_len,
                                   nonce, 12,
                                   NULL, 0,
                                   ciphertext + data_len, 16,  // Tag at end
                                   ciphertext,
                                   plaintext);
    
    mbedtls_gcm_free(&recv_gcm);
    
    if (ret != 0) {
        ESP_LOGE(TAG, "Hardware decryption failed: %d", ret);
        return ESP_FAIL;
    }
    
    *plain_len = data_len;
    hw_crypto->recv_counter++;
    return ESP_OK;
}

// Generate connection IDs using hardware RNG
void quicvc_hw_generate_connection_ids(uint8_t *dcid, uint8_t *scid, size_t len) {
    quicvc_hw_random(dcid, len);
    quicvc_hw_random(scid, len);
}

// Performance monitoring
void quicvc_hw_print_stats(void) {
    if (!hw_crypto) return;
    
    ESP_LOGI(TAG, "Hardware crypto stats:");
    ESP_LOGI(TAG, "  Packets sent: %llu", hw_crypto->send_counter);
    ESP_LOGI(TAG, "  Packets received: %llu", hw_crypto->recv_counter);
    ESP_LOGI(TAG, "  Hardware AES: %s", CONFIG_MBEDTLS_HARDWARE_AES ? "enabled" : "disabled");
    ESP_LOGI(TAG, "  Hardware SHA: %s", CONFIG_MBEDTLS_HARDWARE_SHA ? "enabled" : "disabled");
    
    // Check free heap for crypto operations
    size_t free_heap = esp_get_free_heap_size();
    size_t largest_block = heap_caps_get_largest_free_block(MALLOC_CAP_DMA);
    ESP_LOGI(TAG, "  Free heap: %u bytes", free_heap);
    ESP_LOGI(TAG, "  Largest DMA block: %u bytes", largest_block);
}

// Cleanup
void quicvc_hw_crypto_cleanup(void) {
    if (hw_crypto) {
        mbedtls_gcm_free(&hw_crypto->gcm);
        
        // Clear sensitive data
        memset(hw_crypto, 0, sizeof(quicvc_hw_crypto_t));
        
        // Free DMA-capable memory
        heap_caps_free(hw_crypto);
        hw_crypto = NULL;
        
        ESP_LOGI(TAG, "Hardware crypto cleaned up");
    }
}

// Example integration with main QUICVC code
void quicvc_hw_example_usage(void) {
    // Initialize hardware crypto
    if (quicvc_hw_crypto_init() != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize hardware crypto");
        return;
    }
    
    // Generate session key using hardware RNG
    uint8_t session_key[32];
    quicvc_hw_random(session_key, 32);
    
    // Derive keys using hardware SHA
    quicvc_hw_derive_keys(session_key, 1);  // Server mode
    
    // Example data
    const char *data = "Hello QUICVC with hardware crypto!";
    size_t data_len = strlen(data);
    
    // Encrypt using hardware AES-GCM
    uint8_t encrypted[256];
    size_t encrypted_len;
    quicvc_hw_encrypt_packet((uint8_t*)data, data_len, 
                            encrypted, &encrypted_len, 1);
    
    ESP_LOGI(TAG, "Encrypted %u bytes -> %u bytes", data_len, encrypted_len);
    
    // Decrypt to verify
    uint8_t decrypted[256];
    size_t decrypted_len;
    quicvc_hw_decrypt_packet(encrypted, encrypted_len,
                            decrypted, &decrypted_len, 1);
    
    decrypted[decrypted_len] = '\0';
    ESP_LOGI(TAG, "Decrypted: %s", decrypted);
    
    // Print performance stats
    quicvc_hw_print_stats();
    
    // Cleanup
    quicvc_hw_crypto_cleanup();
}

// Key features of hardware crypto on ESP32:
// 1. AES operations are 3-5x faster than software
// 2. SHA operations are 2-3x faster than software
// 3. Hardware RNG provides true randomness
// 4. DMA-capable memory for efficient transfers
// 5. Lower CPU usage leaves more time for application logic
//
// The mbedtls library automatically uses hardware when:
// - CONFIG_MBEDTLS_HARDWARE_AES=y
// - CONFIG_MBEDTLS_HARDWARE_SHA=y
// - CONFIG_MBEDTLS_HARDWARE_MPI=y (for RSA/ECC)
//
// No code changes needed - just enable in sdkconfig!