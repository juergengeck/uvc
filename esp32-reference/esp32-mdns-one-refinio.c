/*
 * ESP-IDF adapter for the shared UVC DNS-SD identity contract.
 * Call only after QUICVC device/person identity has been loaded. The values
 * must be the same values used by the authenticated transport handshake.
 */
#include "esp_check.h"
#include "mdns.h"
#include <string.h>

#define UVC_QUICVC_PORT 49497

esp_err_t uvc_mdns_advertise_provisioning(
    const char *hardware_device_id,
    const char *bootstrap_public_key,
    const char *display_name
) {
    ESP_RETURN_ON_FALSE(hardware_device_id != NULL && hardware_device_id[0] != '\0', ESP_ERR_INVALID_ARG, "uvc-mdns", "missing hardware id");
    ESP_RETURN_ON_FALSE(bootstrap_public_key != NULL && bootstrap_public_key[0] != '\0', ESP_ERR_INVALID_ARG, "uvc-mdns", "missing bootstrap key");
    ESP_RETURN_ON_FALSE(display_name != NULL && display_name[0] != '\0', ESP_ERR_INVALID_ARG, "uvc-mdns", "missing name");
    ESP_RETURN_ON_ERROR(mdns_init(), "uvc-mdns", "mdns_init failed");
    const mdns_txt_item_t txt[] = {
        {"hardwareDeviceId", hardware_device_id},
        {"bootstrapKey", bootstrap_public_key},
        {"name", display_name},
        {"deviceType", "esp32"},
        {"protocol", "uvc-headless-provisioning-v1"},
        {"capabilities", "identity-assignment,device-key-generation,admin-grant"},
    };
    return mdns_service_add(
        hardware_device_id,
        "_uvc-provision",
        "_udp",
        UVC_QUICVC_PORT,
        txt,
        sizeof(txt) / sizeof(txt[0])
    );
}

esp_err_t uvc_mdns_stop_provisioning(void) {
    return mdns_service_remove("_uvc-provision", "_udp");
}

static bool uvc_is_hash64(const char *value) {
    if (value == NULL || strlen(value) != 64) return false;
    bool nonzero = false;
    for (size_t i = 0; i < 64; ++i) {
        const char c = value[i];
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
            return false;
        }
        nonzero = nonzero || c != '0';
    }
    return nonzero;
}

esp_err_t uvc_mdns_advertise(
    const char *instance_id,
    const char *person_id,
    const char *public_key,
    const char *display_name
) {
    ESP_RETURN_ON_FALSE(uvc_is_hash64(instance_id), ESP_ERR_INVALID_ARG, "uvc-mdns", "bad instance id");
    ESP_RETURN_ON_FALSE(uvc_is_hash64(person_id), ESP_ERR_INVALID_ARG, "uvc-mdns", "bad person id");
    ESP_RETURN_ON_FALSE(uvc_is_hash64(public_key), ESP_ERR_INVALID_ARG, "uvc-mdns", "bad public key");
    ESP_RETURN_ON_FALSE(display_name != NULL && display_name[0] != '\0', ESP_ERR_INVALID_ARG, "uvc-mdns", "missing name");

    char service_instance[17] = {0};
    memcpy(service_instance, instance_id, 16);
    /* The bootstrap service must disappear before the assigned identity appears. */
    (void)uvc_mdns_stop_provisioning();
    ESP_RETURN_ON_ERROR(mdns_init(), "uvc-mdns", "mdns_init failed");
    ESP_RETURN_ON_ERROR(mdns_hostname_set(service_instance), "uvc-mdns", "hostname failed");
    ESP_RETURN_ON_ERROR(mdns_instance_name_set(display_name), "uvc-mdns", "instance failed");
    ESP_RETURN_ON_ERROR(
        mdns_service_add(service_instance, "_one-refinio", "_udp", UVC_QUICVC_PORT, NULL, 0),
        "uvc-mdns",
        "service add failed"
    );
    const mdns_txt_item_t txt[] = {
        {"deviceId", instance_id},
        {"pubkey", public_key},
        {"personId", person_id},
        {"name", display_name},
        {"deviceType", "esp32"},
        {"platform", "one"},
        {"capabilities", "quicvc,phone-book,device-control,journal,light"},
    };
    return mdns_service_txt_set("_one-refinio", "_udp", txt, sizeof(txt) / sizeof(txt[0]));
}
