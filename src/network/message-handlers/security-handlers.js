/**
 * Security message handlers for P2P Server
 * Handles security handshake and authentication
 */

/**
 * Set up security message handlers
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {boolean} isIncoming - Whether this is an incoming connection
 * @param {Object} rateLimiter - Rate limiter instance
 */
function setupHandlers(socket, server, isIncoming, rateLimiter) {
  // Handle security handshake (for initial key verification)
  socket.on("security-handshake", (data) => {
    if (server.isShuttingDown) return;

    // Security handshakes are not rate limited
    handleSecurityHandshake(socket, server, data);
  });
}

/**
 * Handle security handshake
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Handshake data
 */
function handleSecurityHandshake(socket, server, data) {
  try {
    // Only process if security is enabled
    if (!server.securityEnabled || !server.securityManager) {
      socket.emit("security-handshake-response", {
        success: false,
        securityEnabled: false,
        message: "Security is not enabled on this server",
      });
      return;
    }

    // Verify the handshake challenge
    const challenge = data.challenge;
    if (!challenge) {
      socket.emit("security-handshake-response", {
        success: false,
        securityEnabled: true,
        message: "Invalid handshake challenge",
      });
      return;
    }

    // Try to decrypt the challenge
    try {
      const decryptedChallenge = server.decryptData(challenge);

      // Create response with MAC
      const response = {
        success: true,
        serverID: server.serverID,
        timestamp: Date.now(),
        originalChallenge: decryptedChallenge,
      };

      // Sign the response with MAC
      const mac = server.securityManager.createMAC(response);

      // Encrypt the response
      const encryptedResponse = server.encryptData({
        ...response,
        mac,
      });

      // Send back the response
      socket.emit("security-handshake-response", encryptedResponse);

      console.log(`Security handshake successful with socket ${socket.id}`);
    } catch (error) {
      // Failed to decrypt - likely using a different key
      socket.emit("security-handshake-response", {
        success: false,
        securityEnabled: true,
        message: "Security handshake failed: invalid master key",
      });

      console.warn(
        `Security handshake failed with socket ${socket.id}: ${error.message}`
      );
    }
  } catch (error) {
    console.error("Error processing security-handshake message:", error);
  }
}

/**
 * Handle security handshake response
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Handshake response data
 * @returns {boolean} - Whether handshake was successful
 */
function handleSecurityHandshakeResponse(server, data) {
  try {
    if (!server.securityEnabled || !server.securityManager) {
      return false;
    }

    // Decrypt the response if it's encrypted
    let response;
    if (data.encrypted) {
      response = server.decryptData(data);
    } else {
      response = data;
    }

    // Verify the response
    if (!response.success) {
      console.warn(`Security handshake failed: ${response.message}`);
      return false;
    }

    // Verify MAC if present
    if (response.mac) {
      const { mac, ...dataToVerify } = response;
      const isValid = server.securityManager.verifyMAC(dataToVerify, mac);

      if (!isValid) {
        console.warn("Security handshake failed: invalid MAC");
        return false;
      }
    }

    console.log(`Security handshake successful with peer ${response.serverID}`);
    return true;
  } catch (error) {
    console.error("Error handling security handshake response:", error);
    return false;
  }
}

module.exports = {
  setupHandlers,
  handleSecurityHandshake,
  handleSecurityHandshakeResponse,
};
