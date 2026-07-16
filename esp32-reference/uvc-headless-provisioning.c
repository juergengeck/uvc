#include "uvc-headless-provisioning.h"

#include "esp_check.h"

#include <string.h>

static bool same_text(const char *left, const char *right) {
    return left != NULL && right != NULL && strcmp(left, right) == 0;
}

static bool present(const char *value) {
    return value != NULL && value[0] != '\0';
}

esp_err_t uvc_headless_provisioning_init(
    uvc_headless_provisioning_t *state,
    const char *hardware_device_id,
    bool already_provisioned
) {
    if (state == NULL || !present(hardware_device_id)) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(state, 0, sizeof(*state));
    strncpy(state->hardware_device_id, hardware_device_id, sizeof(state->hardware_device_id) - 1);
    state->provisioned = already_provisioned;
    return ESP_OK;
}

esp_err_t uvc_headless_accept_assignment(
    uvc_headless_provisioning_t *state,
    const uvc_headless_platform_t *platform,
    const uvc_verified_peer_t *verified_peer,
    const char *assignment_hash,
    const uvc_identity_assignment_t *assignment,
    uvc_device_identity_proof_t *proof_out
) {
    if (state == NULL || platform == NULL || verified_peer == NULL || assignment == NULL ||
        proof_out == NULL || !present(assignment_hash)) {
        return ESP_ERR_INVALID_ARG;
    }
    if (state->provisioned || state->ceremony_active) {
        return ESP_ERR_INVALID_STATE;
    }
    if (!same_text(assignment->hardware_device_id, state->hardware_device_id)) {
        return ESP_ERR_INVALID_STATE;
    }
    if (!same_text(assignment->administrator.person_id, verified_peer->person_id) ||
        !same_text(assignment->administrator.instance_id, verified_peer->instance_id) ||
        !same_text(assignment->administrator.public_sign_key, verified_peer->public_sign_key) ||
        assignment->administrator.sign_algorithm != verified_peer->sign_algorithm) {
        return ESP_ERR_INVALID_STATE;
    }
    const uint64_t now = platform->now_ms();
    if (assignment->expires_at <= assignment->issued_at || now > assignment->expires_at) {
        return ESP_ERR_INVALID_STATE;
    }
    ESP_RETURN_ON_ERROR(platform->verify_assignment(assignment), "uvc-provision", "assignment signature rejected");

    memset(proof_out, 0, sizeof(*proof_out));
    strncpy(proof_out->ceremony_id, assignment->ceremony_id, sizeof(proof_out->ceremony_id) - 1);
    strncpy(proof_out->assignment_hash, assignment_hash, sizeof(proof_out->assignment_hash) - 1);
    strncpy(proof_out->hardware_device_id, assignment->hardware_device_id, sizeof(proof_out->hardware_device_id) - 1);
    proof_out->created_at = now;
    ESP_RETURN_ON_ERROR(
        platform->random_challenge(proof_out->device_challenge, sizeof(proof_out->device_challenge)),
        "uvc-provision",
        "device challenge generation failed"
    );

    /* This is the only key-creation call. It persists the private key locally. */
    ESP_RETURN_ON_ERROR(
        platform->generate_identity(
            assignment->assigned_email,
            assignment->assigned_instance_name,
            proof_out
        ),
        "uvc-provision",
        "device-local identity creation failed"
    );
    ESP_RETURN_ON_ERROR(
        platform->sign_identity_proof(assignment, proof_out),
        "uvc-provision",
        "device identity proof signing failed"
    );

    state->assignment = *assignment;
    state->proof = *proof_out;
    state->ceremony_active = true;
    return platform->append_journal("device-keys-created", assignment_hash);
}

esp_err_t uvc_headless_accept_certificate(
    uvc_headless_provisioning_t *state,
    const uvc_headless_platform_t *platform,
    const char *certificate_hash,
    const uvc_device_identity_certificate_t *certificate,
    uvc_admin_role_grant_t *grant_out
) {
    if (state == NULL || platform == NULL || certificate == NULL || grant_out == NULL ||
        !present(certificate_hash)) {
        return ESP_ERR_INVALID_ARG;
    }
    if (state->provisioned || !state->ceremony_active) {
        return ESP_ERR_INVALID_STATE;
    }
    if (!same_text(certificate->ceremony_id, state->assignment.ceremony_id) ||
        !same_text(certificate->assignment_hash, state->proof.assignment_hash) ||
        !same_text(certificate->hardware_device_id, state->proof.hardware_device_id) ||
        !same_text(certificate->device_person_id, state->proof.device_person_id) ||
        !same_text(certificate->device_instance_id, state->proof.device_instance_id) ||
        !same_text(certificate->device_public_key, state->proof.device_public_key) ||
        !same_text(certificate->device_public_sign_key, state->proof.device_public_sign_key) ||
        certificate->device_sign_algorithm != state->proof.device_sign_algorithm ||
        !same_text(certificate->administrator_person_id, state->assignment.administrator.person_id)) {
        return ESP_ERR_INVALID_STATE;
    }
    ESP_RETURN_ON_ERROR(
        platform->verify_certificate(&state->assignment, &state->proof, certificate),
        "uvc-provision",
        "identity certificate rejected"
    );

    memset(grant_out, 0, sizeof(*grant_out));
    strncpy(grant_out->ceremony_id, certificate->ceremony_id, sizeof(grant_out->ceremony_id) - 1);
    strncpy(grant_out->certificate_hash, certificate_hash, sizeof(grant_out->certificate_hash) - 1);
    strncpy(grant_out->device_person_id, certificate->device_person_id, sizeof(grant_out->device_person_id) - 1);
    strncpy(grant_out->administrator_person_id, certificate->administrator_person_id, sizeof(grant_out->administrator_person_id) - 1);
    strncpy(grant_out->role, "admin", sizeof(grant_out->role) - 1);
    strncpy(
        grant_out->permissions,
        "admin-delegate,configure,control,journal-read,phone-book-share",
        sizeof(grant_out->permissions) - 1
    );
    grant_out->granted_at = platform->now_ms();
    ESP_RETURN_ON_ERROR(platform->sign_admin_grant(grant_out), "uvc-provision", "admin grant signing failed");

    /* The admin becomes active only after the exact device-signed grant is durable. */
    ESP_RETURN_ON_ERROR(platform->persist_admin_grant(grant_out), "uvc-provision", "admin grant persistence failed");
    ESP_RETURN_ON_ERROR(platform->append_journal("admin-granted", certificate_hash), "uvc-provision", "journal append failed");
    state->provisioned = true;
    state->ceremony_active = false;
    return ESP_OK;
}
