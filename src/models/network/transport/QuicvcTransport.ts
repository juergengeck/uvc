/**
 * QuicvcTransport - A true QUIC-VC implementation
 * 
 * This class will contain the state machine and logic for the
 * QUIC protocol with Verifiable Credentials. It will use the
 * UdpServiceTransport for the underlying packet transmission.
 */
import type { IQuicTransport, QuicTransportOptions, TransportStats, UdpRemoteInfo } from '../interfaces';
import { UdpServiceTransport } from './UdpServiceTransport';
import Debug from 'debug';

const debug = Debug('one:quic:vc-transport');

export class QuicvcTransport implements IQuicTransport {
    // TODO: Implement the QUIC-VC state machine
    private underlyingTransport: UdpServiceTransport;

    constructor() {
        this.underlyingTransport = new UdpServiceTransport();
    }
    
    public on(event: "ready" | "close" | "error" | "message", listener: (...args: any[]) => void): this {
        // TODO: Relay events from underlying transport
        return this;
    }

    public async init(options?: QuicTransportOptions): Promise<void> {
        debug('QuicvcTransport init');
        // TODO: Initialize the QUIC engine and the underlying UdpServiceTransport
        await this.underlyingTransport.init(options);
    }

    public async listen(options?: QuicTransportOptions): Promise<void> {
        return this.init(options);
    }

    public async send(data: any, address: string, port: number): Promise<void> {
        debug('QuicvcTransport send');
        // TODO: Encrypt and frame data using QUIC protocol, then send via UdpServiceTransport
        await this.underlyingTransport.send(data, address, port);
    }

    public async close(): Promise<void> {
        debug('QuicvcTransport close');
        // TODO: Close the QUIC connection and the underlying UDP socket
        await this.underlyingTransport.close();
    }

    public addService(serviceType: number, handler: (data: any, rinfo: UdpRemoteInfo) => void): void {
        this.underlyingTransport.addService(serviceType, handler);
    }

    public removeService(serviceType: number): void {
        this.underlyingTransport.removeService(serviceType);
    }

    public clearServices(): void {
        this.underlyingTransport.clearServices();
    }

    public isInitialized(): boolean {
        return this.underlyingTransport.isInitialized();
    }

    public async getInfo(): Promise<{ port: number; host: string; } | null> {
        return this.underlyingTransport.getInfo();
    }

    public async runDiagnostics(): Promise<string> {
        return `QUIC-VC Layer:\n${await this.underlyingTransport.runDiagnostics()}`;
    }

    // ... other IQuicTransport methods would be implemented here ...
} 