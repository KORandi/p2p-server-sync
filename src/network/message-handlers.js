/**
 * Message Handlers for P2P Server
 * Processes WebSocket messages from peers
 */

/**
 * Set up socket message handlers
 * @param {Object} socket - Socket.IO socket instance
 * @param {Object} server - P2PServer instance
 * @param {boolean} [isIncoming=true] - Whether this is an incoming connection
 */
function setupMessageHandlers(socket, server, isIncoming = true) {
  const connectionType = isIncoming ? "incoming" : "outgoing";

  // Handle 'put' messages (data updates)
  socket.on("put", (data) => {
    // Ignore if shutting down
    if (server.isShuttingDown) {
      console.log("Ignoring put message during shutdown");
      return;
    }

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
        `Received put from ${connectionType} socket ${socket.id} for ${decryptedData.path}`
      );

      // Try to determine the peer ID
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
        for (const [url, s] of Object.entries(
          server.socketManager.socketsByUrl
        )) {
          if (s === socket) {
            senderId = server.socketManager.urlToPeerId[url];
            break;
          }
        }
      }

      // Add sender info to data
      if (senderId) {
        decryptedData.sender = senderId;
      }

      // Process the update
      server.syncManager.handlePut(decryptedData);
    } catch (error) {
      console.error("Error processing put message:", error);
    }
  });

  // Handle vector clock synchronization
  socket.on("vector-clock-sync", (data) => {
    if (server.isShuttingDown) return;

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
  });

  // Handle vector clock synchronization responses
  socket.on("vector-clock-sync-response", (data) => {
    if (server.isShuttingDown) return;

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

      // Process via sync manager
      if (server.syncManager) {
        server.syncManager.handleVectorClockSyncResponse(decryptedData);
      }
    } catch (error) {
      console.error(
        "Error processing vector-clock-sync-response message:",
        error
      );
    }
  });

  // Handle anti-entropy data requests (pull-based approach)
  socket.on("anti-entropy-request", (data) => {
    if (server.isShuttingDown) return;

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

      // Process via sync manager
      if (server.syncManager) {
        server.syncManager.handleAntiEntropyRequest(decryptedData, socket);
      }
    } catch (error) {
      console.error("Error processing anti-entropy-request message:", error);
    }
  });

  // Handle anti-entropy data responses
  socket.on("anti-entropy-response", (data) => {
    if (server.isShuttingDown) return;

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

      // Process via sync manager
      if (server.syncManager) {
        server.syncManager.handleAntiEntropyResponse(decryptedData);
      }
    } catch (error) {
      console.error("Error processing anti-entropy-response message:", error);
    }
  });

  // Handle security handshake (for initial key verification)
  socket.on("security-handshake", (data) => {
    if (server.isShuttingDown) return;

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
  });

  // Handle disconnect event
  socket.on("disconnect", () => {
    // This is handled by SocketManager's connection tracking
    console.log(
      `Socket ${socket.id} disconnected (${connectionType} connection)`
    );
  });
}

/**
 * Set up handlers for vector clock synchronization
 * @param {Object} server - P2PServer instance
 */
function handleVectorClockSync(data, socket, server) {
  // Skip if shutting down
  if (server.isShuttingDown) return;

  try {
    // Decrypt data if encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted vector clock sync data but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    // Validate the data
    if (!decryptedData || !decryptedData.vectorClock || !decryptedData.nodeId) {
      console.warn("Invalid vector clock sync data:", decryptedData);
      return;
    }

    // Handle via sync manager
    server.syncManager.handleVectorClockSync(decryptedData, socket);
  } catch (error) {
    console.error("Error handling vector clock sync:", error);
  }
}

/**
 * Handle response to vector clock synchronization
 * @param {Object} data - Response data
 * @param {Object} server - P2PServer instance
 */
function handleVectorClockSyncResponse(data, server) {
  // Skip if shutting down
  if (server.isShuttingDown) return;

  try {
    // Decrypt data if encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted vector clock sync response but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    server.syncManager.handleVectorClockSyncResponse(decryptedData);
  } catch (error) {
    console.error("Error handling vector clock sync response:", error);
  }
}

/**
 * Handle anti-entropy data request
 * @param {Object} data - Request data
 * @param {Object} socket - Socket.IO socket
 * @param {Object} server - P2PServer instance
 */
function handleAntiEntropyRequest(data, socket, server) {
  // Skip if shutting down
  if (server.isShuttingDown) return;

  try {
    // Decrypt data if encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted anti-entropy request but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    server.syncManager.handleAntiEntropyRequest(decryptedData, socket);
  } catch (error) {
    console.error("Error handling anti-entropy request:", error);
  }
}

/**
 * Handle anti-entropy data response
 * @param {Object} data - Response data
 * @param {Object} server - P2PServer instance
 */
function handleAntiEntropyResponse(data, server) {
  // Skip if shutting down
  if (server.isShuttingDown) return;

  try {
    // Decrypt data if encrypted
    let decryptedData;
    if (data.encrypted) {
      if (server.securityEnabled && server.securityManager) {
        decryptedData = server.decryptData(data);
      } else {
        console.warn(
          "Received encrypted anti-entropy response but security is disabled"
        );
        return;
      }
    } else {
      decryptedData = data;
    }

    server.syncManager.handleAntiEntropyResponse(decryptedData);
  } catch (error) {
    console.error("Error handling anti-entropy response:", error);
  }
}

module.exports = {
  setupMessageHandlers,
  handleVectorClockSync,
  handleVectorClockSyncResponse,
  handleAntiEntropyRequest,
  handleAntiEntropyResponse,
};
