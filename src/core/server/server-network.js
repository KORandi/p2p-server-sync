/**
 * ServerNetwork - Manages network connections and WebRTC
 */
const SocketManager = require("../../network/socket");
const WebRTCNATManager = require("../../network/webrtc");

class ServerNetwork {
  /**
   * Create a new ServerNetwork instance
   * @param {Object} server - P2PServer instance
   * @param {Object} config - Server configuration
   */
  constructor(server, config) {
    this.server = server;

    // WebRTC configuration
    this.webrtcEnabled = config.webrtc?.enabled || false;
    this.webrtcConfig = config.webrtc || {};
    this.webrtcManager = null;

    // Initialize socket manager
    this.socketManager = new SocketManager(server);

    // Initialize WebRTC NAT traversal if enabled
    if (this.webrtcEnabled) {
      this._initWebRTC();
    } else {
      console.log("WebRTC support is disabled");
    }
  }

  /**
   * Initialize WebRTC manager
   * @private
   */
  _initWebRTC() {
    this.webrtcManager = new WebRTCNATManager(this.webrtcConfig, this.server);

    const stunServers = this.webrtcConfig.stunServers || [
      "stun:stun.l.google.com:19302",
    ];
    const signalingServer = this.webrtcConfig.signalingServer || null;

    console.log("WebRTC support is enabled with:");
    console.log("- STUN servers:", stunServers);
    console.log(
      "- Signaling server:",
      signalingServer || "Not configured (limited NAT traversal)"
    );
  }

  /**
   * Connect to a specific peer via WebRTC (NAT traversal)
   * @param {string} peerId - Peer ID to connect to
   * @returns {Promise<boolean>} - Whether connection was initiated
   */
  async connectToPeerViaWebRTC(peerId) {
    if (!this.webrtcEnabled || !this.webrtcManager) {
      console.warn("WebRTC is not enabled, cannot connect to peer via WebRTC");
      return false;
    }

    return this.webrtcManager.connectToPeer(peerId);
  }

  /**
   * Check WebRTC connection status with a peer
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} - Whether a WebRTC connection is established
   */
  hasWebRTCConnection(peerId) {
    if (!this.webrtcEnabled || !this.webrtcManager) {
      return false;
    }

    return this.webrtcManager.isConnectedToPeer(peerId);
  }

  /**
   * Get connection statistics
   * @returns {Object} - Connection statistics
   */
  getConnectionStats() {
    const socketStats = this.socketManager.getConnectionStatus();

    let webrtcStats = {
      connected: 0,
      peers: [],
      pendingPeers: [],
    };

    if (this.webrtcEnabled && this.webrtcManager) {
      const stats = this.webrtcManager.getConnectionStats();
      webrtcStats.connected = stats.connectedCount;
      webrtcStats.peers = stats.connectedPeers;
      webrtcStats.pendingPeers = stats.pendingPeers;
      webrtcStats.signalingConnected = stats.signalingConnected;
    }

    return {
      websocket: socketStats,
      webrtc: webrtcStats,
      totalPeers: new Set([...socketStats.peersById, ...webrtcStats.peers])
        .size,
      securityEnabled: this.server.securityEnabled,
    };
  }

  /**
   * Event listener when new socket identifies
   * @param {(socket: Object) => void} callback
   */
  onSocketConnect(callback) {
    this.socketManager.io.on("connection", (socket) => {
      socket.on("identify", () => {
        callback(socket);
      });
    });
  }
}

module.exports = ServerNetwork;
