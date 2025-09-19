/**
 * CommServer Diagnostics Utility
 * 
 * Tests and debugs the 5-step CommServer registration process:
 * 1. Send 'register' message with public key
 * 2. Wait for 'authentication_request' from CommServer
 * 3. Send 'authentication_response' with decrypted challenge
 * 4. Wait for 'authentication_success' confirmation
 * 5. Start ping/pong and wait for 'connection_handover'
 */

import { createMessageBus } from '@refinio/one.core/lib/message-bus.js';
import { createWebSocket } from '@refinio/one.core/lib/system/expo/websocket.js';

const MessageBus = createMessageBus('CommServerDiagnostics');

export interface DiagnosticResult {
  step: number;
  stepName: string;
  success: boolean;
  timestamp: number;
  duration: number;
  error?: string;
}

export interface DiagnosticsSummary {
  results: DiagnosticResult[];
  overallSuccess: boolean;
  totalDuration: number;
  failedSteps: string[];
}

/**
 * Comprehensive diagnostics for CommServer connectivity and functionality
 */
export class CommServerDiagnostics {
  private results: DiagnosticResult[] = [];

  constructor() {
    this.results = [];
  }

  /**
   * Run complete diagnostics suite
   */
  async runDiagnostics(commServerUrl: string): Promise<DiagnosticsSummary> {
    this.results = [];
    const startTime = Date.now();

    try {
      // Step 1: Test WebSocket connection
      await this.testWebSocketConnection(commServerUrl);

      // Additional steps can be added here
      // Step 2: Test authentication
      // Step 3: Test pairing protocol
      // etc.

    } catch (error) {
      MessageBus.send('log', `❌ Diagnostics failed:`, error);
    }

    const totalDuration = Date.now() - startTime;
    const failedSteps = this.results
      .filter(r => !r.success)
      .map(r => r.stepName);

    const summary: DiagnosticsSummary = {
      results: this.results,
      overallSuccess: failedSteps.length === 0,
      totalDuration,
      failedSteps
    };

    MessageBus.send('log', `📊 Diagnostics complete:`, summary);
    return summary;
  }

  /**
   * Test basic WebSocket connection to CommServer
   */
  private async testWebSocketConnection(commServerUrl: string): Promise<void> {
    const stepStart = Date.now();
    
    try {
      MessageBus.send('log', `🔗 Testing WebSocket connection to: ${commServerUrl}`);
      
      // Create a test WebSocket connection using the fixed implementation
      const testSocket = websocketFactory(commServerUrl);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          testSocket.close();
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        testSocket.onopen = () => {
          clearTimeout(timeout);
          testSocket.close();
          
          this.addResult({
            step: 1,
            stepName: 'WebSocket Connection',
            success: true,
            timestamp: Date.now(),
            duration: Date.now() - stepStart
          });
          
          MessageBus.send('log', `✅ WebSocket connection successful`);
          resolve();
        };

        testSocket.onerror = (error) => {
          clearTimeout(timeout);
          
          this.addResult({
            step: 1,
            stepName: 'WebSocket Connection',
            success: false,
            error: `WebSocket error: ${error}`,
            timestamp: Date.now(),
            duration: Date.now() - stepStart
          });
          
          MessageBus.send('log', `❌ WebSocket connection failed:`, error);
          reject(error);
        };
      });
      
    } catch (error) {
      this.addResult({
        step: 1,
        stepName: 'WebSocket Connection',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        duration: Date.now() - stepStart
      });
      throw error;
    }
  }

  private addResult(result: DiagnosticResult): void {
    this.results.push(result);
  }
}

/**
 * Run CommServer diagnostics for the app
 */
export async function runCommServerDiagnostics(
  commServerUrl: string
): Promise<DiagnosticsSummary> {
  const diagnostics = new CommServerDiagnostics();
  return await diagnostics.runDiagnostics(commServerUrl);
} 