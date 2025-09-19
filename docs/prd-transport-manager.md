# PRD: Abstracted Transport Manager

## 1. Introduction

This document outlines the requirements for a `TransportManager` within the Lama application. The goal is to evolve our networking architecture from a WebSocket-dependent system to a flexible, multi-transport framework. This will enable future support for alternative communication protocols such as UDP for peer-to-peer (P2P) connections and Bluetooth Low Energy (BLE) for offline communication, enhancing the app's resilience, performance, and feature set.

## 2. Problem Statement

The current networking stack, while functional, is fundamentally built around a WebSocket-based communication model. As detailed in our `network.md` documentation, all layers—from the high-level `ConnectionsModel` down to the `EncryptedConnectionHandshake`—presume a reliable, stream-oriented connection like the one a WebSocket provides.

This tight coupling presents several limitations:
-   **Inflexibility:** It prevents the integration of other transport types that do not behave like WebSockets (e.g., connectionless UDP).
-   **Single Point of Failure:** It relies entirely on the availability of the central communication server.
-   **Limited Feature Scope:** It inhibits the development of features that require different network characteristics, such as low-latency local P2P or completely offline communication.

## 3. Goals and Objectives

The primary goal is to **decouple the application's communication logic from the underlying transport protocol**.

-   **Objective 1: Create a Transport Abstraction Layer.** Introduce a `TransportManager` that provides a unified interface for various transport mechanisms.
-   **Objective 2: Preserve Existing Functionality.** The initial implementation should integrate the existing WebSocket-based `ConnectionsModel` as the first transport type, ensuring no loss of current functionality.
-   **Objective 3: Enable Future Expansion.** The architecture must be extensible, allowing for the future addition of `UdpTransport` and `BleTransport` modules with minimal changes to the application logic.
-   **Objective 4: Improve Code Clarity.** Clearly separate transport-level concerns from the application's business logic.

## 4. Requirements

### 4.1. Core `TransportManager`

The `TransportManager` will be the central component responsible for managing all communication transports.

-   **Requirement 1.1: Transport Registration.** The manager must provide a mechanism to register and unregister multiple transport modules (e.g., `registerTransport(transport: ITransport)`).
-   **Requirement 1.2: Unified Interface (`ITransport`).** Define a common `ITransport` interface that all transport modules must implement. This interface will abstract methods for connecting, disconnecting, and sending data.
-   **Requirement 1.3: Event Aggregation.** The manager must aggregate events (e.g., `onMessage`, `onConnect`, `onDisconnect`) from all active transports and emit them as a single, unified stream for the application to consume.
-   **Requirement 1.4: Transport Selection.** (Future Scope) The manager will eventually include logic to select the best available transport for a given connection based on network conditions, peer availability, and application needs.

### 4.2. Initial Transport Implementation: `CommServerTransport`

To maintain existing functionality, the first transport will wrap our current WebSocket-based system.

-   **Requirement 2.1: Implement `ITransport`.** A new `CommServerTransport` class will be created that implements the `ITransport` interface.
-   **Requirement 2.2: Wrap `ConnectionsModel`.** This class will encapsulate the logic currently handled by `ConnectionsModel`, managing the connection to the communication server.
-   **Requirement 2.3: Seamless Integration.** The `TransportManager` will register an instance of `CommServerTransport` on application startup.

### 4.3. Application Integration

The application's high-level models must be refactored to use the `TransportManager`.

-   **Requirement 3.1: Remove Direct Dependencies.** All direct dependencies on `ConnectionsModel` for sending messages or handling connection events must be removed from the application logic.
-   **Requirement 3.2: Use `TransportManager`.** The application will interact exclusively with the `TransportManager` for all communication needs.

## 5. Future Scope & Vision

The successful implementation of the `TransportManager` paves the way for significant enhancements:

-   **UDP P2P Transport:** A `UdpTransport` can be developed to enable direct, low-latency communication between peers on the same local network, bypassing the central server.
-   **BLE Offline Transport:** A `BleTransport` will allow for communication when no internet connection is available, enabling use cases like offline message exchange.
-   **Intelligent Failover:** The `TransportManager` can be enhanced to automatically switch between transports if one fails (e.g., fall back to the comm server if a P2P connection is lost). 