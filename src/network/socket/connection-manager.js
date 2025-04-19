/**
 * ConnectionManager - Manages socket connection lifecycle
 */

const { io: ioClient } = require("socket.io-client");
const { setupMessageHandlers } = require("../message-handlers");

class ConnectionManager {
  /**
   * Create a new ConnectionManager
   * @param {Object} socketManager - SocketManager reference
   */
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.sockets = {}; // Map of peerID -> socket
    this.socketsByUrl = {}; // Map of url -> socket
    this.urlToPeerId = {}; // Map of url -> peerID
    this.peerIdToUrl = {}; // Map of peerID -> url
    this.webrtcPeers = {}; // Map of peerID -> WebRTC dataChannel
    this.peerSockets = []; // Store client socket connections
    this.myUrl = null;
  }

  /**
   * Register an incoming socket connection
   * @param {Object} socket - Socket.IO socket
   * @param {string} peerId - Peer ID
   * @param {string} peerUrl - Peer URL
   */
  registerIncomingConnection(socket, peerId, peerUrl) {
    // Store socket reference by ID
    this.sockets[peerId] = socket;

    // Store bidirectional mappings
    if (peerUrl) {
      this.socketsByUrl[peerUrl] = socket;
      this.peerIdToUrl[peerId] = peerUrl;
      this.urlToPeerId[peerUrl] = peerId;
      console.log(`Mapped peer ${peerId} to URL ${peerUrl}`);
    }

    console.log(`Peer identified: ${peerId} at ${peerUrl || "unknown"}`);

    // Log connection status
    const peerCount = Object.keys(this.sockets).length;
    const urlCount = Object.keys(this.socketsByUrl).length;
    console.log(`Current connections: ${peerCount} by ID, ${urlCount} by URL`);

    this._synchronizeWithNewPeer(socket, peerId);
  }

  /**
   * Synchronize data with a newly connected peer
   * @private
   * @param {Object} socket - Socket.IO socket
   * @param {string} peerId - Peer ID
   */
  _synchronizeWithNewPeer(socket, peerId) {
    // Immediately synchronize vector clocks with new peer
    if (this.socketManager.server.syncManager) {
      // Send our current vector clock to the new peer
      const syncMessage = {
        type: "vector-clock-sync",
        vectorClock: this.socketManager.server.syncManager.getVectorClock(),
        nodeId: this.socketManager.server.serverID,
        timestamp: Date.now(),
        syncId: `init-${this.socketManager.server.serverID}-${Date.now()}`,
      };

      socket.emit("vector-clock-sync", syncMessage);
    }

    // If WebRTC is enabled, try to establish a WebRTC connection
    if (
      this.socketManager.webrtcEnabled &&
      this.socketManager.server.webrtcManager
    ) {
      this.socketManager.server.webrtcManager
        .connectToPeer(peerId)
        .catch((err) =>
          console.warn(
            `Could not establish WebRTC connection with ${peerId}:`,
            err
          )
        );
    }
  }

  /**
   * Connect to known peers
   * @param {Array<string>} peerURLs - URLs of peers to connect to
   * @param {Object} socketOptions - Socket.IO options
   * @param {Object} socketManager - Reference to socket manager
   */
  connectToPeers(peerURLs, socketOptions = {}, socketManager) {
    this.peerSockets = []; // Store socket references for cleanup

    peerURLs.forEach((url) => {
      try {
        // Skip self connections
        if (url === this.myUrl) {
          console.log(`Skipping self-connection to ${url}`);
          return;
        }

        console.log(`Attempting to connect to peer: ${url}`);

        // No need to enforce HTTPS for localhost/internal network
        const socket = ioClient(url, socketOptions);

        // Store for cleanup
        this.peerSockets.push(socket);

        // Store socket by URL immediately
        this.socketsByUrl[url] = socket;

        socket.on("connect", () => {
          this._handleOutgoingConnection(socket, url, socketManager);
        });

        socket.on("disconnect", () => {
          this._handleDisconnection(url);
        });

        // Set up message handlers for outgoing connection
        setupMessageHandlers(socket, socketManager.server, false);
      } catch (err) {
        console.error(`Error setting up connection to peer ${url}:`, err);
      }
    });
  }

  /**
   * Handle successful outgoing connection
   * @private
   * @param {Object} socket - Socket.IO socket
   * @param {string} url - Peer URL
   * @param {Object} socketManager - Reference to socket manager
   */
  _handleOutgoingConnection(socket, url, socketManager) {
    console.log(`Connected to peer: ${url}`);

    // Identify ourselves to the peer
    socket.emit("identify", {
      serverID: socketManager.server.serverID,
      url: this.myUrl,
    });

    // Handle authentication challenges
    socket.on("auth-challenge", (data) => {
      if (!socketManager.server.securityManager) return;

      // Create a signed response
      const challenge = data.challenge;
      const dataToSign = `${socketManager.server.serverID}:${challenge.nonce}:${challenge.timestamp}`;
      const signature =
        socketManager.server.securityManager.createMAC(dataToSign);

      // Send response
      socket.emit("auth-response", {
        challengeId: challenge.id,
        response: {
          peerId: socketManager.server.serverID,
          timestamp: Date.now(),
          signature: signature,
        },
      });
    });

    // After connecting, immediately synchronize vector clocks
    if (socketManager.server.syncManager) {
      const syncMessage = {
        type: "vector-clock-sync",
        vectorClock: socketManager.server.syncManager.getVectorClock(),
        nodeId: socketManager.server.serverID,
        timestamp: Date.now(),
        syncId: `connect-${socketManager.server.serverID}-${Date.now()}`,
      };

      socket.emit("vector-clock-sync", syncMessage);
    }
  }

  /**
   * Handle socket disconnection
   * @private
   * @param {string} url - Peer URL
   */
  _handleDisconnection(url) {
    console.log(`Disconnected from peer: ${url}`);

    // Clean up the URL mapping
    delete this.socketsByUrl[url];

    // Find and clean up the ID mapping if it exists
    const peerId = this.urlToPeerId[url];
    if (peerId) {
      delete this.sockets[peerId];
      delete this.peerIdToUrl[peerId];
      delete this.urlToPeerId[url];
    }
  }

  /**
   * Register a WebRTC peer connection
   * @param {string} peerId - Peer ID
   * @param {Object} peer - WebRTC peer or data channel
   */
  registerWebRTCPeer(peerId, peer) {
    if (this.socketManager.isShuttingDown) return;

    console.log(`Registering WebRTC connection with peer ${peerId}`);
    this.webrtcPeers[peerId] = peer;
  }

  /**
   * Unregister a WebRTC peer connection
   * @param {string} peerId - Peer ID
   */
  unregisterWebRTCPeer(peerId) {
    if (this.socketManager.isShuttingDown) return;

    console.log(`Unregistering WebRTC connection with peer ${peerId}`);
    delete this.webrtcPeers[peerId];
  }

  /**
   * Close all socket connections properly
   */
  closeAllConnections() {
    console.log("Closing all socket connections");

    // Close WebRTC connections if available
    if (this.socketManager.server.webrtcManager) {
      this.socketManager.server.webrtcManager.closeAllConnections();
    }

    // Close server-side socket.io instance
    if (this.socketManager.io) {
      try {
        this.socketManager.io.close();
        console.log("Closed server socket.io instance");
      } catch (err) {
        console.error("Error closing socket.io server:", err);
      }
    }

    // Close all outgoing connections by URL
    if (this.peerSockets && this.peerSockets.length > 0) {
      console.log(`Disconnecting ${this.peerSockets.length} socket.io clients`);
      for (const socket of this.peerSockets) {
        try {
          if (socket) {
            socket.disconnect();
            socket.close();
            socket.removeAllListeners();
          }
        } catch (err) {
          console.error(`Error disconnecting socket:`, err);
        }
      }
      this.peerSockets = [];
    }

    // Close any remaining sockets by URL
    for (const [url, socket] of Object.entries(this.socketsByUrl)) {
      try {
        if (socket && socket.connected) {
          socket.disconnect();
          socket.close();
          socket.removeAllListeners();
          console.log(`Disconnected from peer: ${url}`);
        }
      } catch (err) {
        console.error(`Error disconnecting from ${url}:`, err);
      }
    }

    // Clear all socket collections
    this.sockets = {};
    this.socketsByUrl = {};
    this.urlToPeerId = {};
    this.peerIdToUrl = {};
    this.webrtcPeers = {};

    console.log("All socket connections closed");
  }

  /**
   * Get connection status information
   * @returns {Object} - Connection status info
   */
  getConnectionStatus() {
    return {
      peersById: Object.keys(this.sockets),
      peersByUrl: Object.keys(this.socketsByUrl),
      peerCount: Object.keys(this.sockets).length,
      webrtcPeers: Object.keys(this.webrtcPeers),
    };
  }
}

module.exports = ConnectionManager;
