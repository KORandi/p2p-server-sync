/**
 * MessageHandler - Manages WebRTC message processing
 */

class MessageHandler {
  /**
   * Create a new MessageHandler
   * @param {Object} webrtcManager - Parent WebRTCNATManager reference
   */
  constructor(webrtcManager) {
    this.webrtcManager = webrtcManager;
  }

  /**
   * Process received WebRTC data message
   * @param {string} peerId - Peer ID that sent the message
   * @param {string} data - Raw message data
   */
  processMessage(peerId, data) {
    try {
      // Parse the message
      const message = JSON.parse(data.toString());
      const { type } = message;

      // Handle encrypted data if security is enabled
      let decryptedMessage = message;
      if (
        message.encrypted &&
        this.webrtcManager.server.securityEnabled &&
        this.webrtcManager.server.securityManager
      ) {
        try {
          decryptedMessage = this.webrtcManager.server.decryptData(message);
          // Keep the type from the original message
          decryptedMessage.type = type;
        } catch (error) {
          console.error(
            `Error decrypting WebRTC message from peer ${peerId}:`,
            error
          );
          return; // Skip processing this message
        }
      }

      // Extract type and payload from the decrypted message
      const { type: msgType, ...payload } = decryptedMessage;

      // Handle different message types
      switch (msgType) {
        case "put":
          this._handlePutMessage(payload);
          break;

        case "vector-clock-sync":
          this._handleVectorClockSync(payload, peerId);
          break;

        case "vector-clock-sync-response":
          this._handleVectorClockSyncResponse(payload);
          break;

        case "anti-entropy-request":
          this._handleAntiEntropyRequest(payload, peerId);
          break;

        case "anti-entropy-response":
          this._handleAntiEntropyResponse(payload);
          break;

        case "security-handshake":
          this._handleSecurityHandshake(payload, peerId);
          break;

        default:
          console.warn(
            `Unknown WebRTC message type from peer ${peerId}:`,
            msgType
          );
      }
    } catch (error) {
      console.error(
        `Error processing WebRTC message from peer ${peerId}:`,
        error
      );
    }
  }

  /**
   * Handle put message
   * @private
   * @param {Object} payload - Message payload
   */
  _handlePutMessage(payload) {
    if (this.webrtcManager.server.syncManager) {
      this.webrtcManager.server.syncManager.handlePut(payload);
    }
  }

  /**
   * Handle vector clock sync message
   * @private
   * @param {Object} payload - Message payload
   * @param {string} peerId - Peer ID
   */
  _handleVectorClockSync(payload, peerId) {
    if (this.webrtcManager.server.syncManager) {
      this.webrtcManager.server.syncManager.handleVectorClockSync(payload, {
        emit: (eventName, data) => {
          this.webrtcManager.sendToPeer(peerId, eventName, data);
        },
        id: `webrtc-${peerId}`,
        connected: true,
      });
    }
  }

  /**
   * Handle vector clock sync response
   * @private
   * @param {Object} payload - Message payload
   */
  _handleVectorClockSyncResponse(payload) {
    if (this.webrtcManager.server.syncManager) {
      this.webrtcManager.server.syncManager.handleVectorClockSyncResponse(
        payload
      );
    }
  }

  /**
   * Handle anti-entropy request
   * @private
   * @param {Object} payload - Message payload
   * @param {string} peerId - Peer ID
   */
  _handleAntiEntropyRequest(payload, peerId) {
    if (this.webrtcManager.server.syncManager) {
      this.webrtcManager.server.syncManager.handleAntiEntropyRequest(payload, {
        emit: (eventName, data) => {
          this.webrtcManager.sendToPeer(peerId, eventName, data);
        },
        id: `webrtc-${peerId}`,
        connected: true,
      });
    }
  }

  /**
   * Handle anti-entropy response
   * @private
   * @param {Object} payload - Message payload
   */
  _handleAntiEntropyResponse(payload) {
    if (this.webrtcManager.server.syncManager) {
      this.webrtcManager.server.syncManager.handleAntiEntropyResponse(payload);
    }
  }

  /**
   * Handle security handshake
   * @private
   * @param {Object} payload - Message payload
   * @param {string} peerId - Peer ID
   */
  _handleSecurityHandshake(payload, peerId) {
    // Handle security handshake for WebRTC
    if (
      this.webrtcManager.server.securityEnabled &&
      this.webrtcManager.server.securityManager
    ) {
      try {
        const challenge = payload.challenge;
        if (!challenge) {
          this.webrtcManager.sendToPeer(peerId, "security-handshake-response", {
            success: false,
            securityEnabled: true,
            message: "Invalid handshake challenge",
          });
          return;
        }

        // Try to decrypt the challenge
        const decryptedChallenge =
          this.webrtcManager.server.decryptData(challenge);

        // Create response with MAC
        const response = {
          success: true,
          serverID: this.webrtcManager.server.serverID,
          timestamp: Date.now(),
          originalChallenge: decryptedChallenge,
        };

        // Sign the response with MAC
        const mac =
          this.webrtcManager.server.securityManager.createMAC(response);

        // Send back the response
        this.webrtcManager.sendToPeer(peerId, "security-handshake-response", {
          ...response,
          mac,
        });

        console.log(`WebRTC security handshake successful with peer ${peerId}`);
      } catch (error) {
        // Failed to decrypt - likely using a different key
        this.webrtcManager.sendToPeer(peerId, "security-handshake-response", {
          success: false,
          securityEnabled: true,
          message: "Security handshake failed: invalid master key",
        });

        console.warn(
          `WebRTC security handshake failed with peer ${peerId}: ${error.message}`
        );
      }
    } else {
      this.webrtcManager.sendToPeer(peerId, "security-handshake-response", {
        success: false,
        securityEnabled: false,
        message: "Security is not enabled on this server",
      });
    }
  }
}

module.exports = MessageHandler;
