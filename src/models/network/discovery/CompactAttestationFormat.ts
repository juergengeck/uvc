/**
 * Compact Attestation Format for UDP Discovery
 * 
 * Minimal HTML microdata format optimized for UDP packets.
 * ESP32 devices can generate this format efficiently.
 */

import type { Attestation } from '@src/recipes/Attestations/Attestation';

/**
 * Create compact discovery HTML
 * 
 * This format is optimized for:
 * - Small UDP packet size
 * - Easy generation on ESP32
 * - Valid HTML5 microdata
 * - ONE object compatibility
 */
export function createCompactDiscoveryHtml(
    deviceId: string,
    deviceType: string,
    isOwned: boolean = false,
    ownerId?: string
): string {
    // Ultra-compact but valid HTML5
    // Note: Owner information is intentionally omitted from discovery for privacy
    // Authentication status should be determined via VC exchange, not discovery
    return `<!DOCTYPE html>
<html itemscope itemtype="https://refinio.one/DevicePresence">
<meta itemprop="$type$" content="DevicePresence">
<meta itemprop="id" content="${deviceId}">
<meta itemprop="type" content="${deviceType}">
<meta itemprop="status" content="online">
</html>`;
}

/**
 * Parse compact discovery HTML
 */
export function parseCompactDiscoveryHtml(html: string): {
    deviceId: string;
    deviceType: string;
    isOwned: boolean;
    ownerId?: string;
} | null {
    try {
        // Extract device info using simple regex (fast for ESP32)
        const deviceIdMatch = html.match(/itemprop="id"\s+content="([^"]+)"/);
        const deviceTypeMatch = html.match(/itemprop="type"\s+content="([^"]+)"/);
        const ownershipMatch = html.match(/itemprop="ownership"\s+content="([^"]+)"/);
        
        if (!deviceIdMatch || !deviceTypeMatch) {
            return null;
        }
        
        // If device is sending discovery/heartbeat, it's online by definition
        // Check ownership status if provided (claimed/unclaimed)
        const isOwned = ownershipMatch && ownershipMatch[1] === 'claimed';
        
        return {
            deviceId: deviceIdMatch[1],
            deviceType: deviceTypeMatch[1],
            isOwned: isOwned,
            ownerId: undefined // Owner ID must be verified via QUIC-VC, not from discovery
        };
    } catch (error) {
        return null;
    }
}

/**
 * Create full attestation HTML (for QUIC/TCP)
 */
export function createAttestationHtml(attestation: Attestation): string {
    const claimEntries: string[] = [];
    
    // Convert claim Map to HTML
    for (const [key, value] of attestation.claim) {
        if (typeof value === 'object' && value !== null) {
            // Nested object
            claimEntries.push(`<div itemprop="${key}" itemscope>`);
            for (const [k, v] of Object.entries(value)) {
                claimEntries.push(`<meta itemprop="${k}" content="${escapeHtml(String(v))}">`);
            }
            claimEntries.push('</div>');
        } else {
            claimEntries.push(`<meta itemprop="${key}" content="${escapeHtml(String(value))}">`);
        }
    }
    
    return `<!DOCTYPE html>
<html itemscope itemtype="https://refinio.one/Attestation">
<head>
<title>${attestation.attestationType}</title>
</head>
<body>
<meta itemprop="$type$" content="Attestation">
<meta itemprop="attestationType" content="${attestation.attestationType}">
<meta itemprop="license" content="${attestation.license}">
<meta itemprop="timestamp" content="${attestation.timestamp.toISOString()}">
${attestation.validUntil ? `<meta itemprop="validUntil" content="${attestation.validUntil.toISOString()}">` : ''}
<div itemprop="claim" itemscope itemtype="https://refinio.one/${attestation.attestationType}">
${claimEntries.join('\n')}
</div>
${attestation.references ? attestation.references.map(ref => 
    `<link itemprop="references" href="one://${ref}">`
).join('\n') : ''}
</body>
</html>`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Example ESP32 compatible format
 * 
 * This shows what ESP32 should generate for discovery:
 * 
 * ```c
 * const char* discovery_template = 
 *     "<!DOCTYPE html>"
 *     "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">"
 *     "<meta itemprop=\"$type$\" content=\"DevicePresence\">"
 *     "<meta itemprop=\"id\" content=\"%s\">"
 *     "<meta itemprop=\"type\" content=\"ESP32\">"
 *     "<meta itemprop=\"status\" content=\"online\">"
 *     "%s"  // Optional owner meta tag
 *     "</html>";
 * ```
 */