/**
 * WebRTCNATManager - Specialized manager for WebRTC connections that can traverse NAT
 * Uses a signaling server to connect peers that would otherwise be unreachable
 */

const ConnectionManager = require("./connection-manger");
const SignalingManager = require("./signaling-manager");
const MessageHandler = require("./message-handler");
const PeerConnectionFactory = require("./peer-connection-factory");

class WebRTCNATManager {
  /**
   * Create a new WebRTCNATManager
   * @param {Object} options - WebRTC configuration options
   * @param {Object} server - P2PServer instance
   */
  constructor(options, server) {
    this.server = server;
    this.enabled = options.enabled || false;
    this.isShuttingDown = false;

    // WebRTC configuration with STUN servers
    this.config = {
      iceServers: [
        {
          urls: options.stunServers || [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
          ],
        },
      ],
    };

    // Initialize component managers
    this.connectionManager = new ConnectionManager(this);
    this.peerConnectionFactory = new PeerConnectionFactory(this);
    this.messageHandler = new MessageHandler(this);

    // Get signaling server URL
    this.signalingServer = options.signalingServer || null;

    // Initialize signaling manager if signaling server is configured
    if (this.signalingServer) {
      this.signalingManager = new SignalingManager(this, this.signalingServer);
    } else {
      this.signalingManager = null;
    }

    // Log initialization
    this._logInitialization();
  }

  /**
   * Log initialization information
   * @private
   */
  _logInitialization() {
    console.log(
      "WebRTC NAT traversal manager created with config:",
      JSON.stringify(this.config, null, 2)
    );

    if (this.signalingServer) {
      console.log(`Using signaling server: ${this.signalingServer}`);
    } else {
      console.log(
        "No signaling server configured. WebRTC connections will only work with direct peer connections or over local network."
      );
    }
  }

  /**
   * Initialize the WebRTC NAT manager
   */
  init() {
    if (!this.enabled) {
      console.log("WebRTC is disabled, skipping initialization");
      return;
    }

    try {
      // Check if WebRTC implementation is available
      if (!this.peerConnectionFactory.isWebRTCAvailable()) {
        console.warn(
          "WebRTC implementation (@roamhq/wrtc package) not available, WebRTC will be disabled"
        );
        this.enabled = false;
        return;
      }

      // Connect to signaling server if configured
      if (this.signalingManager) {
        this.signalingManager.connect();
      }

      console.log("WebRTC NAT traversal manager initialized successfully");
    } catch (error) {
      console.error("Error initializing WebRTC NAT manager:", error);
      this.enabled = false;
    }
  }

  /**
   * Connect to a peer via WebRTC
   * @param {string} peerId - Peer ID to connect to
   * @param {number} retryCount - Number of previous retry attempts
   * @returns {Promise<boolean>} Whether connection was initiated successfully
   */
  async connectToPeer(peerId, retryCount = 0) {
    if (this.isShuttingDown || !this.enabled) return false;

    // Don't connect to ourselves
    if (peerId === this.server.serverID) {
      return false;
    }

    return this.connectionManager.connectToPeer(peerId, retryCount);
  }

  /**
   * Send a message to a peer via WebRTC
   * @param {string} peerId - Peer ID
   * @param {string} eventName - Event name (message type)
   * @param {Object} data - Message data
   * @returns {boolean} Whether message was sent successfully
   */
  sendToPeer(peerId, eventName, data) {
    if (this.isShuttingDown || !this.enabled) return false;
    return this.connectionManager.sendToPeer(peerId, eventName, data);
  }

  /**
   * Check if connected to a peer via WebRTC
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} Whether connected to this peer
   */
  isConnectedToPeer(peerId) {
    if (!this.enabled) return false;
    return this.connectionManager.isConnectedToPeer(peerId);
  }

  /**
   * Broadcast a message to all connected WebRTC peers
   * @param {string} eventName - Event name
   * @param {Object} data - Message data
   * @returns {number} Number of peers message was sent to
   */
  broadcast(eventName, data) {
    if (this.isShuttingDown || !this.enabled) return 0;
    return this.connectionManager.broadcast(eventName, data);
  }

  /**
   * Get connection statistics
   * @returns {Object} Connection statistics
   */
  getConnectionStats() {
    return this.connectionManager.getConnectionStats();
  }

  /**
   * Close all WebRTC connections
   */
  closeAllConnections() {
    this.isShuttingDown = true;
    console.log("Closing all WebRTC NAT connections");

    // Close signaling client
    if (this.signalingManager) {
      this.signalingManager.close();
    }

    // Close all peer connections
    this.connectionManager.closeAllConnections();
  }

  /**
   * Handle a signal received from the signaling server
   * @param {string} peerId - Peer ID sending the signal
   * @param {Object} signal - The WebRTC signal
   * @param {string} type - Signal type (optional)
   */
  onSignalReceived(peerId, signal, type) {
    if (this.isShuttingDown || !this.enabled) return;
    this.connectionManager.handleIncomingSignal(peerId, signal, type);
  }

  /**
   * Handle a peer discovered via signaling server
   * @param {string} peerId - The discovered peer ID
   */
  onPeerDiscovered(peerId) {
    if (this.isShuttingDown || !this.enabled) return;
    console.log(`Discovered peer via signaling server: ${peerId}`);
    this.connectToPeer(peerId);
  }

  /**
   * Handler for when signaling server connects
   */
  onSignalingConnected() {
    console.log(
      "Connected to signaling server, can now establish WebRTC connections with NAT traversal"
    );

    // Notify server that we can accept WebRTC connections
    if (this.server.socketManager) {
      this.server.socketManager.webrtcEnabled = true;
    }
  }
}

module.exports = WebRTCNATManager;
