/**
 * A utility class for handling async conditional checks with timeout
 */
export class AsyncConditional {
  private readonly timeoutMs: number;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private isResolved = false;
  
  /**
   * Creates a new AsyncConditional instance
   * @param timeoutMs The timeout in milliseconds
   */
  constructor(timeoutMs: number = 5000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Waits for a condition to be true with a timeout
   * @param condition A function that returns a boolean or Promise<boolean>
   * @param intervalMs How often to check the condition
   * @param errorMessage The error message if timeout occurs
   * @returns A promise that resolves when the condition is true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    intervalMs: number = 100,
    errorMessage: string = 'Operation timed out'
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Set timeout
      this.timeout = setTimeout(() => {
        this.isResolved = true;
        reject(new Error(errorMessage));
      }, this.timeoutMs);

      // Check condition periodically
      const checkCondition = async () => {
        if (this.isResolved) return;
        
        try {
          const result = await condition();
          if (result) {
            this.clearTimeout();
            this.isResolved = true;
            resolve();
          } else if (!this.isResolved) {
            setTimeout(checkCondition, intervalMs);
          }
        } catch (error) {
          this.clearTimeout();
          this.isResolved = true;
          reject(error);
        }
      };

      // Start checking
      checkCondition();
    });
  }

  /**
   * Clears the timeout if it exists
   */
  private clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /**
   * Cancels the current operation
   */
  cancel(reason: string = 'Operation cancelled') {
    this.clearTimeout();
    this.isResolved = true;
  }
} 