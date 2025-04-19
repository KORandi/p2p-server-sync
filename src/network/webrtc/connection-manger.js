/**
 * Connection Manager for WebRTC NAT
 * Manages peer connections and connection lifecycle
 */

class ConnectionManager {
  /**
   * Create a new ConnectionManager instance
   * @param {Object} webrtcManager - Parent WebRTCNATManager reference
   */
  constructor(webrtcManager) {
    this.webrtcManager = webrtcManager;
    this.connections = new Map(); // peerID -> { peer, connected }
    this.pendingConnections = new Map(); // peerId -> { initiator }
  }

  /**
   * Connect to a peer via WebRTC
   * @param {string} peerId - Peer ID to connect to
   * @param {number} retryCount - Number of previous retry attempts
   * @returns {Promise<boolean>} Whether connection was initiated successfully
   */
  async connectToPeer(peerId, retryCount = 0) {
    // Check if already connected
    if (this.connections.has(peerId)) {
      const peerInfo = this.connections.get(peerId);
      if (peerInfo.connected) {
        return true;
      }
    }

    // Check if already pending
    if (this.pendingConnections.has(peerId)) {
      return true;
    }

    console.log(`Initiating WebRTC connection to peer ${peerId}`);

    try {
      // Record pending connection
      this.pendingConnections.set(peerId, {
        initiator: true,
        retryCount: retryCount,
      });

      // Create a new peer connection as initiator
      this.webrtcManager.peerConnectionFactory.createPeerConnection(
        peerId,
        true
      );

      return true;
    } catch (error) {
      console.error(
        `Error initiating WebRTC connection to peer ${peerId}:`,
        error
      );
      this.pendingConnections.delete(peerId);
      return false;
    }
  }

  /**
   * Send a message to a peer via WebRTC
   * @param {string} peerId - Peer ID
   * @param {string} eventName - Event name (message type)
   * @param {Object} data - Message data
   * @returns {boolean} Whether message was sent successfully
   */
  sendToPeer(peerId, eventName, data) {
    const peerInfo = this.connections.get(peerId);

    if (!peerInfo || !peerInfo.connected) {
      return false;
    }

    try {
      // Create message with type field for event name
      const message = {
        type: eventName,
        ...data,
      };

      // Encrypt the message if security is enabled
      let messageToSend = message;
      if (
        this.webrtcManager.server.securityEnabled &&
        this.webrtcManager.server.securityManager
      ) {
        try {
          // Only encrypt if not already encrypted
          if (!message.encrypted) {
            messageToSend = this.webrtcManager.server.encryptData(message);
          }
        } catch (error) {
          console.error(
            `Error encrypting WebRTC message to peer ${peerId}:`,
            error
          );
          // Continue with unencrypted message if encryption fails
        }
      }

      // Send message as string
      peerInfo.peer.send(JSON.stringify(messageToSend));
      return true;
    } catch (error) {
      console.error(`Error sending WebRTC message to peer ${peerId}:`, error);
      return false;
    }
  }

  /**
   * Check if connected to a peer
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} Whether peer is connected
   */
  isConnectedToPeer(peerId) {
    const peerInfo = this.connections.get(peerId);
    return !!(peerInfo && peerInfo.connected);
  }

  /**
   * Broadcast a message to all connected WebRTC peers
   * @param {string} eventName - Event name
   * @param {Object} data - Message data
   * @returns {number} Number of peers message was sent to
   */
  broadcast(eventName, data) {
    let sentCount = 0;

    for (const [peerId, peerInfo] of this.connections.entries()) {
      if (peerInfo.connected && this.sendToPeer(peerId, eventName, data)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Handle peer connection failure
   * @param {string} peerId - Peer ID that failed
   */
  handlePeerFailure(peerId) {
    // Clean up the failed connection
    this.handlePeerDisconnect(peerId);

    // If this was a pending connection, try again with a delay
    if (this.pendingConnections.has(peerId)) {
      const pendingInfo = this.pendingConnections.get(peerId);
      this.pendingConnections.delete(peerId);

      // Try again if we were the initiator, with exponential backoff
      if (pendingInfo.initiator && pendingInfo.retryCount < 3) {
        const retryDelay = Math.pow(2, pendingInfo.retryCount || 0) * 1000;
        console.log(`Scheduling retry for peer ${peerId} in ${retryDelay}ms`);

        setTimeout(() => {
          if (
            !this.webrtcManager.isShuttingDown &&
            this.webrtcManager.enabled
          ) {
            console.log(`Retrying connection to peer ${peerId}`);
            this.connectToPeer(peerId, (pendingInfo.retryCount || 0) + 1);
          }
        }, retryDelay);
      }
    }
  }

  /**
   * Handle peer disconnection
   * @param {string} peerId - Peer ID that disconnected
   */
  handlePeerDisconnect(peerId) {
    const peerInfo = this.connections.get(peerId);

    if (peerInfo) {
      peerInfo.connected = false;

      // Notify the socket manager
      if (this.webrtcManager.server.socketManager) {
        this.webrtcManager.server.socketManager.unregisterWebRTCPeer(peerId);
      }
    }

    // Remove from connections map
    this.connections.delete(peerId);
    this.pendingConnections.delete(peerId);
  }

  /**
   * Handle an incoming signal for a peer
   * @param {string} peerId - Peer ID
   * @param {Object} signal - Signal data
   * @param {string} type - Signal type
   */
  handleIncomingSignal(peerId, signal, type) {
    // Get existing connection or create new one
    let peerConnection = this.connections.get(peerId);

    if (peerConnection && peerConnection.peer) {
      // Use existing connection
      try {
        peerConnection.peer.signal(signal);
      } catch (error) {
        console.error(`Error processing signal from peer ${peerId}:`, error);
      }
    } else if (type === "offer") {
      // Create new peer connection as non-initiator (answering)
      console.log(
        `Creating new peer connection in response to offer from ${peerId}`
      );
      this.webrtcManager.peerConnectionFactory.createPeerConnection(
        peerId,
        false
      );

      // Mark as pending
      this.pendingConnections.set(peerId, { initiator: false });

      // Process the signal with the new peer
      const newConnection = this.connections.get(peerId);
      if (newConnection && newConnection.peer) {
        try {
          newConnection.peer.signal(signal);
        } catch (error) {
          console.error(`Error processing offer from peer ${peerId}:`, error);
        }
      }
    } else {
      console.warn(
        `Received signal from ${peerId} but no connection exists and it's not an offer`
      );
    }
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    const connectedPeers = [];
    const pendingPeers = [];

    for (const [peerId, peerInfo] of this.connections.entries()) {
      if (peerInfo.connected) {
        connectedPeers.push(peerId);
      } else {
        pendingPeers.push(peerId);
      }
    }

    return {
      connectedPeers,
      pendingPeers,
      connectedCount: connectedPeers.length,
      pendingCount: pendingPeers.length,
      totalCount: this.connections.size,
      signalingConnected: this.webrtcManager.signalingManager
        ? this.webrtcManager.signalingManager.isConnected()
        : false,
    };
  }

  /**
   * Close all WebRTC connections
   */
  closeAllConnections() {
    // Close all peer connections
    for (const [peerId, peerInfo] of this.connections.entries()) {
      try {
        console.log(`Closing WebRTC connection to peer ${peerId}`);
        if (peerInfo.peer) {
          peerInfo.peer.destroy();
        }
      } catch (error) {
        console.error(
          `Error closing WebRTC connection to peer ${peerId}:`,
          error
        );
      }
    }

    this.connections.clear();
    this.pendingConnections.clear();
  }

  /**
   * Initiate synchronization with a newly connected peer
   * @param {string} peerId - Peer ID to sync with
   */
  initiateSync(peerId) {
    if (this.webrtcManager.isShuttingDown || !this.webrtcManager.enabled)
      return;

    // Immediately synchronize vector clocks
    if (this.webrtcManager.server.syncManager) {
      const syncMessage = {
        type: "vector-clock-sync",
        vectorClock: this.webrtcManager.server.syncManager.getVectorClock(),
        nodeId: this.webrtcManager.server.serverID,
        timestamp: Date.now(),
        syncId: `webrtc-init-${this.webrtcManager.server.serverID}-${Date.now()}`,
      };

      this.sendToPeer(peerId, "vector-clock-sync", syncMessage);

      // Run anti-entropy to sync data
      setTimeout(() => {
        if (
          !this.webrtcManager.isShuttingDown &&
          this.webrtcManager.server.syncManager
        ) {
          this.webrtcManager.server.syncManager.runAntiEntropy();
        }
      }, 1000);
    }
  }
}

module.exports = ConnectionManager;
