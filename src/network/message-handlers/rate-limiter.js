/**
 * Rate limiter for message handlers
 * Tracks message rates and limits based on configured thresholds
 */

class RateLimiter {
  /**
   * Create a new RateLimiter for a specific client
   * @param {string} clientId - Client identifier
   * @param {Object} server - P2PServer instance
   */
  constructor(clientId, server) {
    this.clientId = clientId;
    this.server = server;

    // Track message counts by type for rate limiting
    this.messageCount = {
      total: 0,
      lastResetTime: Date.now(),
    };
  }

  /**
   * Check if a message should be rate limited
   * @param {string} eventName - Event name
   * @param {Object} data - Message data
   * @returns {boolean} - Whether message should be limited
   */
  shouldLimit(eventName, data) {
    // Skip rate limiting if it's not enabled
    if (!this.server.socketManager.rateLimiter) {
      return false; // Not limited
    }

    // Exempt anti-entropy messages from rate limiting
    if (data && data.isAntiEntropy === true) {
      return false; // Not limited
    }

    // Reset counters hourly
    const now = Date.now();
    if (now - this.messageCount.lastResetTime > 3600000) {
      // 1 hour
      this.messageCount.total = 0;
      this.messageCount.lastResetTime = now;
    }

    // Track message count
    this.messageCount.total++;

    // Check rate limits
    return this.server.socketManager.rateLimiter.shouldLimit(this.clientId);
  }

  /**
   * Log a rate limit warning
   * @param {string} eventName - Event name that was limited
   */
  logLimitWarning(eventName) {
    console.warn(
      `Rate limit exceeded for ${this.clientId}, dropping ${eventName} message`
    );
  }
}

module.exports = RateLimiter;
