// ESP32 Provisioning Acknowledgment Fix
// Update the send_provisioning_response function to include owner ID

// Send provisioning response with owner information
esp_err_t send_provisioning_response(const char *target_ip, int target_port, bool success, const char *status) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Create response
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "provisioning_ack");
    cJSON_AddStringToObject(root, "deviceId", device_id);
    cJSON_AddBoolToObject(root, "success", success);
    cJSON_AddStringToObject(root, "status", status);
    cJSON_AddNumberToObject(root, "timestamp", esp_timer_get_time() / 1000);
    
    // Add owner ID if device is owned (for successful provisioning)
    if (success && strcmp(status, "provisioned") == 0) {
        char owner_id[65] = {0};
        if (get_owner_id(owner_id, sizeof(owner_id)) == ESP_OK) {
            cJSON_AddStringToObject(root, "owner", owner_id);
            ESP_LOGI(TAG, "Including owner ID in provisioning_ack: %.16s...", owner_id);
        }
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    if (!json_str) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }
    
    // Create packet with SERVICE_TYPE_CREDENTIALS (2) - App expects it on type 2
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    packet[0] = 2;  // SERVICE_TYPE_CREDENTIALS - Changed from 11
    memcpy(packet + 1, json_str, json_len);
    
    // Send response
    struct sockaddr_in target_addr;
    memset(&target_addr, 0, sizeof(target_addr));
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(target_port);
    inet_pton(AF_INET, target_ip, &target_addr.sin_addr);
    
    ssize_t sent = sendto(service_socket, packet, json_len + 1, 0,
                         (struct sockaddr *)&target_addr, sizeof(target_addr));
    
    free(packet);
    cJSON_Delete(root);
    free(json_str);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send provisioning response: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📤 Provisioning response sent on service type 2: %s", status);
    return ESP_OK;
}