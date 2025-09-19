# Integration Strategy: QUIC/UDP with one.models

This document outlines the strategy for integrating QUIC/UDP functionality with the one.models network architecture.

## Current State Analysis

### QUIC/UDP Integration Strengths
- Device discovery and management capabilities
- Real-time data communication through one.core's QUIC transport
- Support for preliminary data streaming (video, chat feeds)
- Network diagnostics and connectivity management

### one.models Strengths
- Person/instance identity management
- Channel-based persistent storage
- Security and access control
- Higher-level communication patterns
- CRDT-based conflict resolution

### Integration Gaps
- Device management and embedded device support still needs refinement
- Streamlining the preliminary data channel for real-time content (video, chat feeds)
- Optimizing real-time streaming before persistence

## Complementary Strengths Integration

We're taking a **Complementary Capabilities** approach where:

1. **QUIC/UDP functionality for:**
   - Device discovery and management
   - Real-time communication channels
   - Preliminary data streaming (video, chat feeds, etc.)

2. **We leverage one.models for:**
   - Person/instance identity management
   - Channel-based persistent storage
   - Security and access control
   - Higher-level communication patterns

## Integration Architecture

### 1. Two-Tier Communication Model

```
[Application Layer]
   |
   |--- one.models: Person-to-person channels, persistent data
   |
   |--- QUIC/UDP: Device streams, preliminary data, real-time

[Transport Layer]
   |--- Unified connection management via one.core
```

### 2. Data Flow Integration

Bridge real-time streams with one.models storage:

1. **Stream Capture & Persistence:**
   - Use one.core's QUIC transport for real-time data streaming
   - Create snapshot mechanisms to persist relevant data to one.models channels
   - Implement trigger points for when to capture snapshots

2. **Reference System:**
   - Maintain references between one.models objects and device/stream identifiers
   - Allow querying from both directions (find streams related to a channel, find persisted data for a stream)

### 3. Device Identity Integration

Implement a lightweight mapping layer:

- Map device identities to "device instance" concepts that can be referenced by one.models
- Maintain a registry of known devices separate from but referenceable by one.models
- Extend discovery mechanisms to optionally publish to one.models when appropriate

## Key Integration Components

1. **QuicModel:**
   - Provides a lightweight wrapper around one.core's QUIC transport
   - Manages device discovery and UDP broadcasting
   - Handles connection lifecycle and events

2. **Device Registry:**
   - Manages discovered devices and their metadata
   - Makes devices referenceable within one.models
   - Maintains device-specific capabilities and connection information

3. **Real-time Communication Channel:**
   - Built on one.core's QUIC transport
   - Optimized for high-performance, real-time data (video, audio, chat)
   - Provides hooks for snapshot capture at appropriate moments

## Implementation Status

1. **Completed:**
   - Integration with one.core's QUIC transport
   - Basic UDP discovery functionality
   - QuicModel wrapper for simplified API access

2. **In Progress:**
   - Mapping system between device IDs and one.models references
   - Snapshot mechanism for chat/video content
   - Device registry implementation

3. **Future Work:**
   - Enhanced stream bridging with one.models
   - Unified query capabilities across systems
   - API harmonization for consistent developer experience

## Advantages of This Approach

1. **Directly leverages one.core capabilities** without duplicate implementation
2. **Simplifies maintenance** by reducing custom code
3. **Creates clearer separation of concerns:**
   - Real-time discovery & communication: QuicModel + one.core QUIC transport
   - Persistence/identity: one.models
4. **Maintains compatibility** with one.core's future improvements

## Technical Integration Points

### Connection Management
- QuicModel provides simplified access to one.core's QUIC transport
- Clear boundaries between real-time communication and persistent channels

### Identity Mapping
- Device discovery results map to one.models-compatible device identities
- Bidirectional references between devices and one.models entities

### Data Flow
- Implement triggers for when to capture stream data into one.objects
- Define serialization/deserialization between stream data and persistent objects

### Event Propagation
- Unified event system using OEvents for cross-component communication
- QuicModel exposes relevant network events through standard OEvent interface

## Next Steps

1. Complete device registry implementation
2. Finalize mapping between discovered devices and one.models references
3. Implement stream snapshot mechanism
4. Develop query API for cross-system data access
5. Document integration patterns for developers 