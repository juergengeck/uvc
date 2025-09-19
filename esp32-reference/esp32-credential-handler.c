// ESP32 Credential Handler Implementation
// Add this to your ESP32 main.c file after the includes and before unified_service_task

#include "nvs_flash.h"
#include "nvs.h"

// Credential storage definitions
#define NVS_NAMESPACE "credentials"
#define MAX_CREDENTIAL_SIZE 2048
#define MAX_CREDENTIALS 5

// Credential structure for parsing
typedef struct {
    char id[128];
    char iss[128];      // Issuer
    char sub[128];      // Subject (user ID)
    char dev[128];      // Device ID
    char typ[64];       // Device type
    time_t iat;         // Issued at
    time_t exp;         // Expiration (0 = never)
    char own[32];       // Ownership type
    char prm[256];      // Permissions
    char prf[512];      // Proof
    char mac[18];       // MAC address (optional)
    bool is_valid;
} parsed_credential_t;

// Global owner info
static char current_owner[128] = {0};
static bool has_owner_flag = false;
static nvs_handle_t nvs_handle = 0;

// Initialize credential storage
esp_err_t init_credential_storage(void) {
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS for credentials: %s", esp_err_to_name(err));
        return err;
    }
    
    // Try to load existing owner
    size_t owner_len = sizeof(current_owner);
    err = nvs_get_str(nvs_handle, "owner", current_owner, &owner_len);
    if (err == ESP_OK && owner_len > 0) {
        has_owner_flag = true;
        ESP_LOGI(TAG, "Loaded existing owner: %s", current_owner);
    }
    
    return ESP_OK;
}

// Check if device has an owner
bool has_owner(void) {
    return has_owner_flag && strlen(current_owner) > 0;
}

// Parse credential JSON
bool parse_credential_json(const char *json_str, parsed_credential_t *cred) {
    cJSON *root = cJSON_Parse(json_str);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse credential JSON");
        return false;
    }
    
    // Extract credential from packet
    cJSON *credential = cJSON_GetObjectItem(root, "credential");
    if (!credential || !cJSON_IsString(credential)) {
        ESP_LOGE(TAG, "No credential field in packet");
        cJSON_Delete(root);
        return false;
    }
    
    // Decode base64 credential
    const char *cred_b64 = cJSON_GetStringValue(credential);
    size_t out_len = 0;
    unsigned char *decoded = NULL;
    
    // Simple base64 decode (you may need to implement or use a library)
    // For now, we'll parse it as if it's JSON directly
    // In production, properly decode base64 first
    
    cJSON *cred_json = cJSON_Parse(cred_b64);
    if (!cred_json) {
        ESP_LOGE(TAG, "Failed to parse credential data");
        cJSON_Delete(root);
        return false;
    }
    
    // Parse all fields
    cJSON *field;
    
    field = cJSON_GetObjectItem(cred_json, "id");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->id, cJSON_GetStringValue(field), sizeof(cred->id) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "iss");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->iss, cJSON_GetStringValue(field), sizeof(cred->iss) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "sub");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->sub, cJSON_GetStringValue(field), sizeof(cred->sub) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "dev");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->dev, cJSON_GetStringValue(field), sizeof(cred->dev) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "typ");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->typ, cJSON_GetStringValue(field), sizeof(cred->typ) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "iat");
    if (field && cJSON_IsNumber(field)) {
        cred->iat = (time_t)cJSON_GetNumberValue(field);
    }
    
    field = cJSON_GetObjectItem(cred_json, "exp");
    if (field && cJSON_IsNumber(field)) {
        cred->exp = (time_t)cJSON_GetNumberValue(field);
    }
    
    field = cJSON_GetObjectItem(cred_json, "own");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->own, cJSON_GetStringValue(field), sizeof(cred->own) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "prm");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->prm, cJSON_GetStringValue(field), sizeof(cred->prm) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "prf");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->prf, cJSON_GetStringValue(field), sizeof(cred->prf) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "mac");
    if (field && cJSON_IsString(field)) {
        strncpy(cred->mac, cJSON_GetStringValue(field), sizeof(cred->mac) - 1);
    }
    
    field = cJSON_GetObjectItem(cred_json, "is_valid");
    if (field && cJSON_IsBool(field)) {
        cred->is_valid = cJSON_IsTrue(field);
    }
    
    cJSON_Delete(cred_json);
    cJSON_Delete(root);
    
    ESP_LOGI(TAG, "Parsed credential: ID=%s, Subject=%s, Device=%s", 
             cred->id, cred->sub, cred->dev);
    
    return true;
}

// Validate credential
bool validate_credential(const parsed_credential_t *cred) {
    // Check if credential is for this device
    if (strcmp(cred->dev, device_id) != 0) {
        ESP_LOGW(TAG, "Credential is for different device: %s vs %s", 
                 cred->dev, device_id);
        return false;
    }
    
    // Check if credential is marked as valid
    if (!cred->is_valid) {
        ESP_LOGW(TAG, "Credential is marked as invalid");
        return false;
    }
    
    // Check expiration if set
    if (cred->exp > 0) {
        time_t now = time(NULL);
        if (now > cred->exp) {
            ESP_LOGW(TAG, "Credential has expired");
            return false;
        }
    }
    
    // Check ownership type
    if (strcmp(cred->own, "owner") != 0 && strcmp(cred->own, "admin") != 0) {
        ESP_LOGW(TAG, "Invalid ownership type: %s", cred->own);
        return false;
    }
    
    // TODO: Verify cryptographic proof in cred->prf
    // This would involve checking the signature against the issuer's public key
    
    return true;
}

// Store credential
esp_err_t store_credential(const parsed_credential_t *cred) {
    if (!nvs_handle) {
        ESP_LOGE(TAG, "NVS not initialized");
        return ESP_FAIL;
    }
    
    // Store as owner if this is an owner credential
    if (strcmp(cred->own, "owner") == 0) {
        esp_err_t err = nvs_set_str(nvs_handle, "owner", cred->sub);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to store owner: %s", esp_err_to_name(err));
            return err;
        }
        
        // Store the full credential
        char key[32];
        snprintf(key, sizeof(key), "cred_%s", cred->id);
        
        // Serialize credential to JSON for storage
        cJSON *store_json = cJSON_CreateObject();
        cJSON_AddStringToObject(store_json, "id", cred->id);
        cJSON_AddStringToObject(store_json, "iss", cred->iss);
        cJSON_AddStringToObject(store_json, "sub", cred->sub);
        cJSON_AddStringToObject(store_json, "dev", cred->dev);
        cJSON_AddStringToObject(store_json, "own", cred->own);
        cJSON_AddStringToObject(store_json, "prm", cred->prm);
        cJSON_AddNumberToObject(store_json, "iat", cred->iat);
        cJSON_AddNumberToObject(store_json, "exp", cred->exp);
        
        char *store_str = cJSON_PrintUnformatted(store_json);
        cJSON_Delete(store_json);
        
        if (store_str) {
            err = nvs_set_str(nvs_handle, key, store_str);
            free(store_str);
            
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to store credential: %s", esp_err_to_name(err));
                return err;
            }
        }
        
        // Commit to flash
        err = nvs_commit(nvs_handle);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to commit NVS: %s", esp_err_to_name(err));
            return err;
        }
        
        // Update global state
        strncpy(current_owner, cred->sub, sizeof(current_owner) - 1);
        has_owner_flag = true;
        
        ESP_LOGI(TAG, "✅ Stored owner credential for: %s", cred->sub);
    }
    
    return ESP_OK;
}

// Send credential acknowledgment
void send_credential_ack(struct sockaddr_in *dest_addr, const char *credential_id, bool success) {
    if (g_service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return;
    }
    
    // Create acknowledgment JSON
    cJSON *ack = cJSON_CreateObject();
    cJSON_AddStringToObject(ack, "type", "credential_ack");
    cJSON_AddStringToObject(ack, "credential_id", credential_id);
    cJSON_AddBoolToObject(ack, "success", success);
    cJSON_AddStringToObject(ack, "device_id", device_id);
    cJSON_AddNumberToObject(ack, "timestamp", xTaskGetTickCount());
    
    if (!success) {
        cJSON_AddStringToObject(ack, "error", "Credential validation failed");
    }
    
    char *json_str = cJSON_PrintUnformatted(ack);
    cJSON_Delete(ack);
    
    if (!json_str) {
        ESP_LOGE(TAG, "Failed to create ACK JSON");
        return;
    }
    
    // Create service packet with credentials service type
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    if (!packet) {
        free(json_str);
        return;
    }
    
    packet[0] = SERVICE_CREDENTIALS;
    memcpy(packet + 1, json_str, json_len);
    
    // Send acknowledgment
    ssize_t sent = sendto(g_service_socket, packet, json_len + 1, MSG_DONTWAIT,
                         (struct sockaddr *)dest_addr, sizeof(struct sockaddr_in));
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send credential ACK: %s", strerror(errno));
    } else {
        ESP_LOGI(TAG, "📤 Sent credential ACK to %s:%d (success=%s)",
                 inet_ntoa(dest_addr->sin_addr), 
                 ntohs(dest_addr->sin_port),
                 success ? "true" : "false");
    }
    
    free(packet);
    free(json_str);
}

// Handle credential service messages
void handle_credential_service(const char *payload, size_t len, struct sockaddr_in *src_addr) {
    ESP_LOGI(TAG, "🔐 Handling credential service message (%d bytes)", (int)len);
    
    // Null terminate the payload
    char *json_payload = malloc(len + 1);
    if (!json_payload) {
        ESP_LOGE(TAG, "Failed to allocate memory for payload");
        return;
    }
    
    memcpy(json_payload, payload, len);
    json_payload[len] = '\0';
    
    ESP_LOGD(TAG, "Credential payload: %s", json_payload);
    
    // Parse the credential
    parsed_credential_t cred = {0};
    if (!parse_credential_json(json_payload, &cred)) {
        ESP_LOGE(TAG, "Failed to parse credential");
        send_credential_ack(src_addr, "", false);
        free(json_payload);
        return;
    }
    
    free(json_payload);
    
    // Check if we already have an owner
    if (has_owner() && strcmp(current_owner, cred.sub) != 0) {
        ESP_LOGW(TAG, "Device already has owner: %s (rejecting %s)", 
                 current_owner, cred.sub);
        send_credential_ack(src_addr, cred.id, false);
        return;
    }
    
    // Validate the credential
    if (!validate_credential(&cred)) {
        ESP_LOGE(TAG, "Credential validation failed");
        send_credential_ack(src_addr, cred.id, false);
        return;
    }
    
    // Store the credential
    if (store_credential(&cred) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to store credential");
        send_credential_ack(src_addr, cred.id, false);
        return;
    }
    
    // Send success acknowledgment
    send_credential_ack(src_addr, cred.id, true);
    
    // Update LED to show ownership
    set_led_color(0, 255, 0); // Green for owned
    
    ESP_LOGI(TAG, "✅ Device now owned by: %s", cred.sub);
}

// Add this function to check ownership (used by discovery)
const char* get_owner_id(void) {
    return has_owner_flag ? current_owner : NULL;
}

// Add to your main() or app_main() initialization
void init_credentials(void) {
    esp_err_t err = init_credential_storage();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize credential storage");
    }
}