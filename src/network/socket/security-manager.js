/**
 * SecurityManager - Manages socket security and authentication
 */

class SecurityManager {
  /**
   * Create a new SecurityManager
   * @param {Object} socketManager - SocketManager reference
   */
  constructor(socketManager) {
    this.socketManager = socketManager;
  }

  /**
   * Handle authentication response from a peer
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Authentication response data
   */
  handleAuthResponse(socket, data) {
    if (!this.socketManager.peerAuthenticator) return;

    // Verify the response
    const isValid = this.socketManager.peerAuthenticator.verifyResponse(
      data.challengeId,
      data.response
    );

    if (!isValid) {
      console.warn(
        `Invalid authentication response from ${socket.id}, disconnecting`
      );
      socket.disconnect(true);
    } else {
      console.log(`Peer ${data.response.peerId} authenticated successfully`);
    }
  }

  /**
   * Generate a security challenge for a peer
   * @param {string} peerId - Peer ID to challenge
   * @returns {Object} Challenge data
   */
  generateChallenge(peerId) {
    if (!this.socketManager.peerAuthenticator) {
      return { error: "Authentication not available" };
    }

    return this.socketManager.peerAuthenticator.generateChallenge(peerId);
  }

  /**
   * Verify a peer's authentication state
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} Whether peer is authenticated
   */
  isPeerAuthenticated(peerId) {
    // This is a placeholder - would need to track authentication state
    // In a real implementation, you would maintain a map of authenticated peers
    return true;
  }

  /**
   * Create encrypted challenge for a peer
   * @param {string} peerId - Peer ID
   * @returns {Object} Encrypted challenge
   */
  createEncryptedChallenge(peerId) {
    if (
      !this.socketManager.server.securityEnabled ||
      !this.socketManager.server.securityManager
    ) {
      return { encrypted: false, error: "Security not enabled" };
    }

    try {
      const challenge = {
        type: "auth-challenge",
        peerId: this.socketManager.server.serverID,
        timestamp: Date.now(),
        nonce: this.socketManager.server.securityManager.generateSecureId(),
      };

      return this.socketManager.server.encryptData(challenge);
    } catch (error) {
      console.error("Error creating encrypted challenge:", error);
      return { encrypted: false, error: error.message };
    }
  }
}

module.exports = SecurityManager;
