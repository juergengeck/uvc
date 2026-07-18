/**
 * Load all diagnostic functions into global scope
 */

export async function loadDiagnostics() {
    console.log('Loading diagnostic functions...');
    
    try {
        // Import all diagnostic functions
        await import('./debugChannelAccess');
        await import('./debugMessageTransfer');
        await import('./testChannelAccessGrants');
        await import('./verifyChumChannelSync');
        await import('./debugChumParser');
        await import('./debugChumSync');
        await import('./debugAccessGrantCreation');
        await import('./verifyChannelInfoHash');
        
        console.log('✅ Diagnostic functions loaded:');
        console.log('  - debugChannelAccess()');
        console.log('  - debugMessageTransfer()');
        console.log('  - testChannelAccessGrants()');
        console.log('  - verifyChumChannelSync()');
        console.log('  - debugChumParser()');
        console.log('  - debugChumSync()');
        console.log('  - debugAccessGrantCreation()');
        console.log('  - verifyChannelInfoHash()');
        
        return true;
    } catch (error) {
        console.error('❌ Failed to load diagnostics:', error);
        return false;
    }
}

// Diagnostic split bundles are optional developer tools. The physical
// integration runtime keeps Metro focused on the application graph it is
// exercising; loading every diagnostic entry point adds unrelated lazy-bundle
// failures to the device error overlay and can fail model initialization.
if (process.env.EXPO_PUBLIC_UVC_INTEGRATION !== '1') {
    loadDiagnostics().catch(console.error);
} else {
    console.log('[Diagnostics] Auto-load skipped in UVC integration mode');
}

// Also make the loader available globally
(globalThis as any).loadDiagnostics = loadDiagnostics;
