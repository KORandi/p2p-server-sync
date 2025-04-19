/**
 * ExecutionManager - Manages anti-entropy execution state and scheduling logic
 */

class ExecutionManager {
  /**
   * Create a new ExecutionManager
   * @param {Object} antiEntropy - Parent AntiEntropy instance
   */
  constructor(antiEntropy) {
    this.antiEntropy = antiEntropy;

    // Execution state
    this.isRunning = false;
    this.consecutiveRuns = 0;
    this.lastRunTime = 0;
    this.backoffTime = 1000; // Start with 1s backoff
  }

  /**
   * Check if anti-entropy can run now
   * @param {boolean} force - Force run
   * @param {boolean} isScheduled - Whether this is a scheduled run
   * @returns {boolean} Whether anti-entropy can run
   */
  canRun(force, isScheduled) {
    // Skip if another process is already running and not forced
    if (this.isRunning && !force) {
      console.log("Anti-entropy process already running, skipping this cycle");

      // Increment consecutive skips for potential notification
      this.consecutiveRuns++;

      if (this.consecutiveRuns > 5 && isScheduled) {
        console.warn(
          `Anti-entropy has been skipped ${this.consecutiveRuns} consecutive times. Consider increasing the interval.`
        );
      }

      return false;
    }

    // Apply backoff if runs are too frequent
    const now = Date.now();
    const timeSinceLastRun = now - this.lastRunTime;

    if (timeSinceLastRun < this.backoffTime && !force) {
      console.log(
        `Anti-entropy running too frequently, applying backoff (${this.backoffTime}ms)`
      );
      return false;
    }

    return true;
  }

  /**
   * Mark anti-entropy as running
   */
  markRunning() {
    this.isRunning = true;
    this.lastRunTime = Date.now();
    this.consecutiveRuns = 0; // Reset consecutive runs counter
  }

  /**
   * Mark anti-entropy as completed
   * @param {boolean} success - Whether execution was successful
   */
  markCompleted(success) {
    this.isRunning = false;

    // Adjust backoff based on success/failure pattern
    const now = Date.now();
    const timeSinceLastRun = now - this.lastRunTime;

    if (success) {
      // On success, reduce backoff time if it's been running well
      if (timeSinceLastRun > this.backoffTime * 5) {
        // If it's been a while since last run, reduce backoff
        this.backoffTime = Math.max(1000, this.backoffTime / 2);
      }

      // On success, reduce backoff time
      this.backoffTime = Math.max(1000, this.backoffTime * 0.8);
    } else {
      // On error, increase backoff time
      this.backoffTime = Math.min(30000, this.backoffTime * 2);
    }
  }
}

module.exports = ExecutionManager;
