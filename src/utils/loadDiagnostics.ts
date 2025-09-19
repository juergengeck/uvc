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

// Auto-load diagnostics when this module is imported
loadDiagnostics().catch(console.error);

// Also make the loader available globally
(globalThis as any).loadDiagnostics = loadDiagnostics;