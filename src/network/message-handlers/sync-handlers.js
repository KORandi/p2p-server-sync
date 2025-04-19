/**
 * Synchronization message handlers for P2P Server
 * Handles vector clock sync and anti-entropy operations
 */

/**
 * Set up synchronization message handlers
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {boolean} isIncoming - Whether this is an incoming connection
 * @param {Object} rateLimiter - Rate limiter instance
 */
function setupHandlers(socket, server, isIncoming, rateLimiter) {
  // Handle vector clock synchronization
  socket.on("vector-clock-sync", (data) => {
    if (server.isShuttingDown) return;

    // Anti-entropy messages are exempt from rate limiting
    const isAntiEntropy = data && data.isAntiEntropy === true;

    // Check rate limits (with exemption for anti-entropy)
    if (!isAntiEntropy && rateLimiter.shouldLimit("vector-clock-sync", data)) {
      rateLimiter.logLimitWarning("vector-clock-sync");
      return;
    }

    handleVectorClockSync(socket, server, data);
  });

  // Handle vector clock sync responses
  socket.on("vector-clock-sync-response", (data) => {
    if (server.isShuttingDown) return;
    handleVectorClockSyncResponse(server, data);
  });

  // Handle anti-entropy data requests (pull-based approach)
  socket.on("anti-entropy-request", (data) => {
    if (server.isShuttingDown) return;
    handleAntiEntropyRequest(socket, server, data);
  });

  // Handle anti-entropy data responses (also exempt from rate limiting)
  socket.on("anti-entropy-response", (data) => {
    if (server.isShuttingDown) return;
    handleAntiEntropyResponse(server, data);
  });
}

/**
 * Handle vector clock synchronization
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Sync message data
 */
function handleVectorClockSync(socket, server, data) {
  try {
    // Decrypt the data if it's encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted vector-clock-sync but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    // Process via sync manager
    if (server.syncManager) {
      server.syncManager.handleVectorClockSync(decryptedData, socket);
    }
  } catch (error) {
    console.error("Error processing vector-clock-sync message:", error);
  }
}

/**
 * Handle vector clock synchronization response
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Response data
 */
function handleVectorClockSyncResponse(server, data) {
  try {
    // Decrypt the data if it's encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted vector-clock-sync-response but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    if (server.syncManager) {
      server.syncManager.handleVectorClockSyncResponse(decryptedData);
    }
  } catch (error) {
    console.error(
      "Error processing vector-clock-sync-response message:",
      error
    );
  }
}

/**
 * Handle anti-entropy data request
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Request data
 */
function handleAntiEntropyRequest(socket, server, data) {
  try {
    // Decrypt the data if it's encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted anti-entropy-request but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    // Always set isAntiEntropy flag to ensure exemption
    decryptedData.isAntiEntropy = true;

    // Process via sync manager
    if (server.syncManager) {
      server.syncManager.handleAntiEntropyRequest(decryptedData, socket);
    }
  } catch (error) {
    console.error("Error processing anti-entropy-request message:", error);
  }
}

/**
 * Handle anti-entropy data response
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Response data
 */
function handleAntiEntropyResponse(server, data) {
  try {
    // Decrypt the data if it's encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted anti-entropy-response but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    // Always set isAntiEntropy flag to ensure exemption
    decryptedData.isAntiEntropy = true;

    // Process via sync manager
    if (server.syncManager) {
      server.syncManager.handleAntiEntropyResponse(decryptedData);
    }
  } catch (error) {
    console.error("Error processing anti-entropy-response message:", error);
  }
}

module.exports = {
  setupHandlers,
  handleVectorClockSync,
  handleVectorClockSyncResponse,
  handleAntiEntropyRequest,
  handleAntiEntropyResponse,
};
