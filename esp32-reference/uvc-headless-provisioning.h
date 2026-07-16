#pragma once

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define UVC_ID_HEX_LENGTH 64
#define UVC_ID_BUFFER_LENGTH 65
#define UVC_KEY_BUFFER_LENGTH 192
#define UVC_SIGNATURE_BUFFER_LENGTH 192
#define UVC_TEXT_BUFFER_LENGTH 128

typedef enum {
    UVC_SIGN_ED25519,
    UVC_SIGN_ECDSA_P256_SHA256,
} uvc_sign_algorithm_t;

typedef struct {
    char person_id[UVC_ID_BUFFER_LENGTH];
    char instance_id[UVC_ID_BUFFER_LENGTH];
    char public_sign_key[UVC_KEY_BUFFER_LENGTH];
    uvc_sign_algorithm_t sign_algorithm;
} uvc_verified_peer_t;

typedef struct {
    char ceremony_id[UVC_TEXT_BUFFER_LENGTH];
    char hardware_device_id[UVC_TEXT_BUFFER_LENGTH];
    char assigned_email[UVC_TEXT_BUFFER_LENGTH];
    char assigned_instance_name[UVC_TEXT_BUFFER_LENGTH];
    uvc_verified_peer_t administrator;
    char challenge[UVC_TEXT_BUFFER_LENGTH];
    uint64_t issued_at;
    uint64_t expires_at;
    char administrator_signature[UVC_SIGNATURE_BUFFER_LENGTH];
} uvc_identity_assignment_t;

typedef struct {
    char ceremony_id[UVC_TEXT_BUFFER_LENGTH];
    char assignment_hash[UVC_ID_BUFFER_LENGTH];
    char hardware_device_id[UVC_TEXT_BUFFER_LENGTH];
    char device_person_id[UVC_ID_BUFFER_LENGTH];
    char device_instance_id[UVC_ID_BUFFER_LENGTH];
    char device_public_key[UVC_KEY_BUFFER_LENGTH];
    char device_public_sign_key[UVC_KEY_BUFFER_LENGTH];
    uvc_sign_algorithm_t device_sign_algorithm;
    char device_challenge[UVC_TEXT_BUFFER_LENGTH];
    uint64_t created_at;
    char device_signature[UVC_SIGNATURE_BUFFER_LENGTH];
} uvc_device_identity_proof_t;

typedef struct {
    char ceremony_id[UVC_TEXT_BUFFER_LENGTH];
    char assignment_hash[UVC_ID_BUFFER_LENGTH];
    char proof_hash[UVC_ID_BUFFER_LENGTH];
    char hardware_device_id[UVC_TEXT_BUFFER_LENGTH];
    char device_person_id[UVC_ID_BUFFER_LENGTH];
    char device_instance_id[UVC_ID_BUFFER_LENGTH];
    char device_public_key[UVC_KEY_BUFFER_LENGTH];
    char device_public_sign_key[UVC_KEY_BUFFER_LENGTH];
    uvc_sign_algorithm_t device_sign_algorithm;
    char administrator_person_id[UVC_ID_BUFFER_LENGTH];
    uint64_t certified_at;
    char administrator_signature[UVC_SIGNATURE_BUFFER_LENGTH];
} uvc_device_identity_certificate_t;

typedef struct {
    char ceremony_id[UVC_TEXT_BUFFER_LENGTH];
    char certificate_hash[UVC_ID_BUFFER_LENGTH];
    char device_person_id[UVC_ID_BUFFER_LENGTH];
    char administrator_person_id[UVC_ID_BUFFER_LENGTH];
    char role[16];
    char permissions[160];
    uint64_t granted_at;
    char device_signature[UVC_SIGNATURE_BUFFER_LENGTH];
} uvc_admin_role_grant_t;

/**
 * Firmware owns these functions. generate_identity MUST create and persist the
 * private keys on the ESP32. No callback may export private key material.
 * Signature callbacks use the exact v1 transcripts from uvc.core.
 */
typedef struct {
    uint64_t (*now_ms)(void);
    esp_err_t (*random_challenge)(char *output, size_t output_size);
    esp_err_t (*verify_assignment)(const uvc_identity_assignment_t *assignment);
    esp_err_t (*generate_identity)(
        const char *assigned_email,
        const char *assigned_instance_name,
        uvc_device_identity_proof_t *proof
    );
    esp_err_t (*sign_identity_proof)(
        const uvc_identity_assignment_t *assignment,
        uvc_device_identity_proof_t *proof
    );
    esp_err_t (*verify_certificate)(
        const uvc_identity_assignment_t *assignment,
        const uvc_device_identity_proof_t *proof,
        const uvc_device_identity_certificate_t *certificate
    );
    esp_err_t (*sign_admin_grant)(uvc_admin_role_grant_t *grant);
    esp_err_t (*persist_admin_grant)(const uvc_admin_role_grant_t *grant);
    esp_err_t (*append_journal)(const char *event_type, const char *evidence_hash);
} uvc_headless_platform_t;

typedef struct {
    bool provisioned;
    bool ceremony_active;
    char hardware_device_id[UVC_TEXT_BUFFER_LENGTH];
    uvc_identity_assignment_t assignment;
    uvc_device_identity_proof_t proof;
} uvc_headless_provisioning_t;

esp_err_t uvc_headless_provisioning_init(
    uvc_headless_provisioning_t *state,
    const char *hardware_device_id,
    bool already_provisioned
);

esp_err_t uvc_headless_accept_assignment(
    uvc_headless_provisioning_t *state,
    const uvc_headless_platform_t *platform,
    const uvc_verified_peer_t *verified_peer,
    const char *assignment_hash,
    const uvc_identity_assignment_t *assignment,
    uvc_device_identity_proof_t *proof_out
);

esp_err_t uvc_headless_accept_certificate(
    uvc_headless_provisioning_t *state,
    const uvc_headless_platform_t *platform,
    const char *certificate_hash,
    const uvc_device_identity_certificate_t *certificate,
    uvc_admin_role_grant_t *grant_out
);
