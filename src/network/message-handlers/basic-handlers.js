/**
 * Basic message handlers for P2P Server
 * Handles put operations and other core functionality
 */

/**
 * Set up basic message handlers
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {boolean} isIncoming - Whether this is an incoming connection
 * @param {Object} rateLimiter - Rate limiter instance
 */
function setupHandlers(socket, server, isIncoming, rateLimiter) {
  // Handle 'put' messages (data updates)
  socket.on("put", (data) => {
    // Ignore if shutting down
    if (server.isShuttingDown) {
      console.log("Ignoring put message during shutdown");
      return;
    }

    // Check rate limits (with exemption for anti-entropy)
    if (rateLimiter.shouldLimit("put", data)) {
      rateLimiter.logLimitWarning("put");
      return;
    }

    handlePutMessage(socket, server, data, isIncoming);
  });
}

/**
 * Handle a put message with proper sender identification
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {Object} data - Message data
 * @param {boolean} isIncoming - Whether this is an incoming connection
 */
function handlePutMessage(socket, server, data, isIncoming) {
  try {
    // Handle encrypted data if security is enabled
    let decryptedData;
    try {
      // Try to decrypt the data if it's encrypted
      if (data.encrypted) {
        if (server.securityEnabled && server.securityManager) {
          decryptedData = server.decryptData(data);
        } else {
          console.warn("Received encrypted data but security is disabled");
          return; // Skip processing this message
        }
      } else {
        decryptedData = data;
      }

      console.log(
        `Received put from ${isIncoming ? "incoming" : "outgoing"} socket ${socket.id} for ${decryptedData.path}`
      );

      // Try to determine the peer ID
      let senderId = identifySender(socket, server, isIncoming);

      // Add sender info to data
      if (senderId) {
        decryptedData.sender = senderId;
      }

      // Process the update
      server.syncManager.handlePut(decryptedData);
    } catch (error) {
      console.error("Error processing put message:", error);
    }
  } catch (error) {
    console.error("Error in put message handler:", error);
  }
}

/**
 * Identify the sender of a message
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 * @param {boolean} isIncoming - Whether this is an incoming connection
 * @returns {string|null} - Sender ID or null if not identified
 */
function identifySender(socket, server, isIncoming) {
  let senderId = null;

  if (isIncoming) {
    // For incoming connections, try to find in socket mapping
    for (const [id, s] of Object.entries(server.socketManager.sockets)) {
      if (s === socket) {
        senderId = id;
        break;
      }
    }
  } else {
    // For outgoing connections, we can get it from URL mapping
    for (const [url, s] of Object.entries(server.socketManager.socketsByUrl)) {
      if (s === socket) {
        senderId = server.socketManager.urlToPeerId[url];
        break;
      }
    }
  }

  return senderId;
}

module.exports = {
  setupHandlers,
  handlePutMessage,
};
