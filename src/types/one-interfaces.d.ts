/**
 * ONE Object Interfaces
 * 
 * Extends the ONE object interfaces with our custom types.
 */

import type { RoleCertificate } from '../models/roles/recipes';

declare module '@OneObjectInterfaces' {
    interface OneCertificateInterfaces {
        RoleCertificate: RoleCertificate;
        TrustKeysCertificate: {
            $type$: 'TrustKeysCertificate';
            profile: string;
        };
    }

    interface OneUnversionedObjectInterfaces {
        UITracker: {
            $type$: 'UITracker';
            elementId: string;
            action: string;
            timestamp: number;
            screenContext?: string;
            metadata?: Record<string, unknown>;
        };
    }
} 

// Add empty default export since this is a type-only file
export default {};