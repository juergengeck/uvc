# Pairing Debug Guide

This guide explains how to use the enhanced debugging capabilities for pairing operations between Lama and one.leute.

## Overview

The enhanced pairing debug system provides comprehensive logging and monitoring for connection establishment issues. It tracks every phase of the pairing process and provides detailed insights into where connections fail.

## Components

### 1. PairingDebugService

A comprehensive debugging service that tracks:
- Pairing attempts with unique IDs
- Phases of the pairing process with timing
- Connection states for monitoring
- Success/failure/timeout tracking
- Debug report generation

### 2. Enhanced PairingService

The PairingService has been enhanced with comprehensive debug tracking throughout the `acceptInvitation` method:

- **Initialization phase**: Person ID verification, key analysis
- **Connection setup**: Routes, GlueTopic verification
- **Connection attempt**: WebSocket establishment, handshake monitoring
- **Progress monitoring**: Real-time connection state tracking
- **Error handling**: Detailed error categorization and reporting

### 3. Debug Configuration

Enhanced debug configuration in `src/config/debug.ts` enables:
- ONE core pairing and connection debugging
- WebSocket transport debugging
- Network layer debugging
- Comprehensive error logging

## Usage

### Basic Debug Operations

```typescript
import { getPairingService } from '@src/services/PairingService';

const pairingService = getPairingService();

// Enable debug logging
pairingService.setPairingDebugEnabled(true);

// Get debug summary
const summary = pairingService.getPairingDebugSummary();
console.log('Pairing attempts:', summary.totalAttempts);
console.log('Success rate:', summary.successfulAttempts / summary.totalAttempts);

// Print comprehensive debug report
pairingService.printPairingDebugReport();

// Clear debug history
pairingService.clearPairingDebugHistory();
```

### Monitoring Pairing Attempts

When you call `acceptInvitation`, the debug service automatically tracks:

1. **Initialization** - Person ID and key verification
2. **Identity Verification** - Main identity and key analysis
3. **Key Analysis** - Cryptographic key validation
4. **Connection Setup** - Routes and GlueTopic preparation
5. **Connection Attempt** - WebSocket establishment
6. **Progress Monitoring** - Real-time connection state tracking
7. **Success/Failure** - Final outcome with detailed error analysis

### Debug Output Examples

#### Successful Connection
```
[PairingDebug] 🚀 Starting pairing attempt: pairing_1703123456789_abc123def
[PairingDebug] ✅ Phase: initialization (+15ms)
[PairingDebug] ✅ Phase: identity_verification (+25ms)
[PairingDebug] ✅ Phase: key_analysis (+10ms)
[PairingDebug] ✅ Phase: connection_attempt_start (+5ms)
[PairingDebug] ✅ Phase: connect_using_invitation_success (+2500ms)
[PairingDebug] ✅ Phase: connection_established (+100ms)
[PairingDebug] ✅ Pairing attempt pairing_1703123456789_abc123def succeeded after 2655ms
```

#### Failed Connection
```
[PairingDebug] 🚀 Starting pairing attempt: pairing_1703123456789_xyz789ghi
[PairingDebug] ✅ Phase: initialization (+15ms)
[PairingDebug] ❌ Phase: key_analysis (+10ms) Error: Failed to retrieve key object
[PairingDebug] ❌ Phase: connect_using_invitation_error (+30000ms)
[PairingDebug] ❌ Pairing attempt pairing_1703123456789_xyz789ghi failed after 30025ms: WebSocket connection failed
```

#### Timeout
```
[PairingDebug] 🚀 Starting pairing attempt: pairing_1703123456789_timeout1
[PairingDebug] ✅ Phase: initialization (+15ms)
[PairingDebug] ✅ Phase: connection_attempt_start (+5ms)
[PairingDebug] ⚠️  Phase: no_progress_warning (+30000ms)
[PairingDebug] ❌ Phase: pairing_stalled (+60000ms)
[PairingDebug] ⏰ Pairing attempt pairing_1703123456789_timeout1 timed out after 90000ms (timeout: 90000ms)
```

## Debug Report

The debug report provides a comprehensive overview:

```
[PairingDebug] ===== PAIRING DEBUG REPORT =====
[PairingDebug] Total attempts: 5
[PairingDebug] Successful: 2
[PairingDebug] Failed: 2
[PairingDebug] Timed out: 1
[PairingDebug] Average duration: 45000ms

[PairingDebug] Recent attempts:
[PairingDebug]   ✅ pairing_1703123456789_success1: success (2655ms)
[PairingDebug]     ✅ initialization (+15ms)
[PairingDebug]     ✅ connection_established (+2640ms)
[PairingDebug]   ❌ pairing_1703123456789_failed1: failed (30025ms)
[PairingDebug]     ✅ initialization (+15ms)
[PairingDebug]     ❌ connection_error_details (+30010ms)

[PairingDebug] Latest connection state:
[PairingDebug]   Total connections: 1
[PairingDebug]   Active connections: 1
[PairingDebug]     1. sha256:abc123... - Connected: true, Route: true
[PairingDebug] ===== END DEBUG REPORT =====
```

## Troubleshooting Common Issues

### 1. WebSocket Connection Failures
**Symptoms**: Errors containing "WebSocket" or "websocket"
**Debug phases to check**: `connect_using_invitation_error`
**Common causes**: Network connectivity, server unavailability

### 2. Key Mismatch Errors
**Symptoms**: Errors containing "EP-KEYMISSMATCH" or "Key does not match"
**Debug phases to check**: `key_analysis`, `identity_verification`
**Common causes**: Device previously connected with different keys

### 3. Timeout Issues
**Symptoms**: No progress for 90+ seconds
**Debug phases to check**: `pairing_stalled`, `no_progress_warning`
**Common causes**: Network issues, server overload, protocol hangs

### 4. Initialization Failures
**Symptoms**: Errors in early phases
**Debug phases to check**: `initialization`, `identity_verification`
**Common causes**: App not fully initialized, missing dependencies

## Advanced Debugging

### Connection State Monitoring

The debug service records connection states throughout the pairing process:

```typescript
// Connection states are automatically recorded during pairing
// You can see them in the debug report or access them directly
const summary = pairingService.getPairingDebugSummary();
// Check recent attempts for connection state changes
```

### Phase-by-Phase Analysis

Each pairing attempt is broken down into phases:

1. **initialization** - Basic setup and validation
2. **identity_verification** - Person ID and identity checks
3. **key_analysis** - Cryptographic key validation
4. **connection_attempt_start** - Beginning of connection process
5. **pairing_manager_check** - Verification of pairing manager
6. **pre_connection_state** - Initial connection state
7. **connect_using_invitation_start** - Start of ONE protocol connection
8. **monitoring_start** - Beginning of progress monitoring
9. **progress_check** - Regular progress monitoring
10. **connection_success** - Successful connection establishment
11. **connection_established** - Final connection confirmation

### Error Categorization

Errors are automatically categorized:

- **Timeout errors**: Network or server response issues
- **WebSocket errors**: Transport layer problems
- **Encryption errors**: Protocol or key issues
- **Key mismatch errors**: Identity/key conflicts
- **General errors**: Other connection failures

## Integration with Existing Code

The debug system is automatically active when:
1. Debug configuration is loaded (happens at app startup)
2. PairingService is used for connection attempts
3. Development mode is enabled (`__DEV__` is true)

No additional setup is required - just use the PairingService normally and debug information will be automatically collected and available through the debug methods.

## Performance Considerations

- Debug logging is automatically disabled in production builds
- History is limited to 50 attempts to prevent memory leaks
- Connection state recording is throttled to avoid performance impact
- Debug output can be disabled at runtime if needed

## Next Steps

With this enhanced debugging in place, you can:

1. **Test connection attempts** with comprehensive logging
2. **Identify specific failure points** in the pairing process
3. **Monitor connection state changes** in real-time
4. **Generate detailed reports** for troubleshooting
5. **Track success rates** and performance metrics

The debug system will help identify exactly where the pairing process is failing when connecting to https://leute.demo.refinio.one/. 