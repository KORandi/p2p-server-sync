/**
 * Internal network security implementation for P2P Server
 * For nodes communicating on localhost or trusted internal networks
 */

// Add this to src/utils/peer-auth.js
class PeerAuthenticator {
  /**
   * Create a new PeerAuthenticator
   * @param {Object} options - Authentication options
   * @param {Array<string>} options.allowedPeers - Allowed peer IDs
   * @param {Array<string>} options.allowedIPs - Allowed IP addresses
   * @param {Object} securityManager - Security manager instance for crypto operations
   */
  constructor(options = {}, securityManager) {
    this.allowedPeers = new Set(options.allowedPeers || []);
    this.allowedIPs = new Set(
      options.allowedIPs || ["127.0.0.1", "::1", "localhost"]
    );
    this.securityManager = securityManager;
    this.challengeMap = new Map(); // Store active challenges
  }

  /**
   * Check if a peer is allowed to connect
   * @param {string} peerId - Peer ID to check
   * @param {string} ipAddress - IP address of connecting peer
   * @returns {boolean} - Whether peer is allowed
   */
  isPeerAllowed(peerId, ipAddress) {
    // Always allow localhost
    if (this.allowedIPs.has(ipAddress)) {
      return true;
    }

    // Check if peer is in allowed list (if list is provided)
    if (this.allowedPeers.size > 0) {
      return this.allowedPeers.has(peerId);
    }

    // If no explicit list is provided, default to allowing all peers
    return true;
  }

  /**
   * Generate an authentication challenge for a peer
   * @param {string} peerId - Peer ID
   * @returns {Object} - Challenge data
   */
  generateChallenge(peerId) {
    if (!this.securityManager) {
      throw new Error("Security manager is required for challenge generation");
    }

    // Create a random challenge
    const challenge = {
      id: this.securityManager.generateSecureId(),
      timestamp: Date.now(),
      nonce: this.securityManager.generateSecureId(),
    };

    // Store challenge for verification
    this.challengeMap.set(challenge.id, {
      peerId,
      challenge,
      timestamp: Date.now(),
    });

    // Clean up old challenges every few generations
    if (Math.random() < 0.1) {
      this._cleanupOldChallenges();
    }

    return challenge;
  }

  /**
   * Verify a challenge response
   * @param {string} challengeId - Challenge ID
   * @param {Object} response - Challenge response
   * @returns {boolean} - Whether the response is valid
   */
  verifyResponse(challengeId, response) {
    if (!this.securityManager) {
      return false;
    }

    // Get the original challenge
    const storedData = this.challengeMap.get(challengeId);
    if (!storedData) {
      console.warn(`No stored challenge found with ID ${challengeId}`);
      return false;
    }

    // Verify the signature if available
    if (response.signature && storedData.challenge.nonce) {
      const dataToVerify = `${storedData.peerId}:${storedData.challenge.nonce}:${storedData.challenge.timestamp}`;
      return this.securityManager.verifyMAC(dataToVerify, response.signature);
    }

    // Fallback verification (less secure)
    return response.peerId === storedData.peerId;
  }

  /**
   * Clean up old challenges
   * @private
   */
  _cleanupOldChallenges() {
    const now = Date.now();
    const expiryTime = 5 * 60 * 1000; // 5 minutes

    for (const [id, data] of this.challengeMap.entries()) {
      if (now - data.timestamp > expiryTime) {
        this.challengeMap.delete(id);
      }
    }
  }
}

// Create a RateLimiter utility
class RateLimiter {
  /**
   * Create a new RateLimiter
   * @param {Object} options - Rate limiting options
   * @param {number} options.maxRequests - Maximum requests per window
   * @param {number} options.windowMs - Time window in milliseconds
   */
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.clients = new Map(); // clientId -> [timestamps]
  }

  /**
   * Check if a client has exceeded rate limits
   * @param {string} clientId - Client identifier
   * @returns {boolean} - Whether client should be limited
   */
  shouldLimit(clientId) {
    const now = Date.now();

    // Initialize entry if it doesn't exist
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, [now]);
      return false;
    }

    // Get existing requests
    const requests = this.clients.get(clientId);

    // Filter to requests within the current window
    const windowStart = now - this.windowMs;
    const recentRequests = requests.filter((time) => time > windowStart);

    // Update the client record
    recentRequests.push(now);
    this.clients.set(clientId, recentRequests);

    // Check if limit is exceeded
    return recentRequests.length > this.maxRequests;
  }

  /**
   * Reset rate limiting for a client
   * @param {string} clientId - Client identifier
   */
  reset(clientId) {
    this.clients.delete(clientId);
  }
}

module.exports = {
  PeerAuthenticator,
  RateLimiter,
};
