/**
 * SocketManager - Manages WebSocket connections between peers
 * Also coordinates with WebRTC connections when enabled
 */

const socketIO = require("socket.io");
const ConnectionManager = require("./connection-manager");
const SecurityManager = require("../../core/security");
const BroadcastManager = require("./broadcast-manager");
const { setupMessageHandlers } = require("../message-handlers");
const { PeerAuthenticator, RateLimiter } = require("./peer-auth");

class SocketManager {
  /**
   * Create a new SocketManager
   * @param {Object} server - P2PServer instance
   */
  constructor(server) {
    this.server = server;
    this.io = null;
    this.isShuttingDown = false;
    this.webrtcEnabled = server.webrtcEnabled || false;

    // Initialize subcomponents
    this.connectionManager = new ConnectionManager(this);
    this.securityManager = new SecurityManager(this);
    this.broadcastManager = new BroadcastManager(this);

    // Re-export properties from connection manager
    this.sockets = this.connectionManager.sockets;
    this.socketsByUrl = this.connectionManager.socketsByUrl;
    this.urlToPeerId = this.connectionManager.urlToPeerId;
    this.peerIdToUrl = this.connectionManager.peerIdToUrl;
    this.webrtcPeers = this.connectionManager.webrtcPeers;
    this.peerSockets = this.connectionManager.peerSockets;
    this.myUrl = null;

    // Create rate limiter instance
    this.rateLimiter = new RateLimiter({
      maxRequests: server.config?.rateLimit?.maxRequests || 100,
      windowMs: server.config?.rateLimit?.windowMs || 60000,
    });

    // Create peer authenticator if security is enabled
    if (server.securityEnabled && server.securityManager) {
      this.peerAuthenticator = new PeerAuthenticator(
        {
          allowedPeers: server.config?.security?.allowedPeers || [],
          allowedIPs: server.config?.security?.allowedIPs || [
            "127.0.0.1",
            "::1",
            "localhost",
          ],
        },
        server.securityManager
      );
    }
  }

  /**
   * Initialize socket server
   * @param {Object} httpServer - HTTP server instance
   */
  init(httpServer) {
    this.io = socketIO(httpServer);

    // Determine our protocol (localhost doesn't need https)
    const isLocalhost =
      this.server.port === "localhost" ||
      this.server.host === "127.0.0.1" ||
      this.server.host === "::1";

    this.myUrl = `http://${this.server.host || "localhost"}:${this.server.port}`;
    this.connectionManager.myUrl = this.myUrl;

    this.io.on("connection", (socket) => {
      // Don't accept new connections if shutting down
      if (this.isShuttingDown) {
        console.log(`Rejecting new connection during shutdown: ${socket.id}`);
        socket.disconnect(true);
        return;
      }

      this._handleNewConnection(socket);
    });
  }

  /**
   * Handle a new socket.io connection
   * @private
   * @param {Object} socket - Socket.IO socket
   */
  _handleNewConnection(socket) {
    // Get the client's IP address
    const clientIp = socket.handshake.address;
    console.log(`New connection from IP ${clientIp}: ${socket.id}`);

    // Track connection attempt for rate limiting
    const connectionId = clientIp || socket.id;

    // Apply rate limiting if enabled
    if (this.rateLimiter && this.rateLimiter.shouldLimit(connectionId)) {
      console.warn(`Rate limit exceeded for ${connectionId}, disconnecting`);
      socket.disconnect(true);
      return;
    }

    socket.on("identify", (data) => {
      this._handleIdentify(socket, data, clientIp);
    });

    // Set up message handlers for incoming connection
    setupMessageHandlers(socket, this.server, true);
  }

  /**
   * Handle socket identify event
   * @private
   * @param {Object} socket - Socket.IO socket
   * @param {Object} data - Identify data
   * @param {string} clientIp - Client IP address
   */
  _handleIdentify(socket, data, clientIp) {
    const peerId = data.serverID;
    const peerUrl = data.url;

    // Authenticate peer if authenticator is enabled
    if (this.peerAuthenticator) {
      // Check if peer is allowed
      if (!this.peerAuthenticator.isPeerAllowed(peerId, clientIp)) {
        console.warn(`Rejecting unauthorized peer ${peerId} from ${clientIp}`);
        socket.disconnect(true);
        return;
      }

      // Generate a challenge for later authentication
      const challenge = this.peerAuthenticator.generateChallenge(peerId);

      // Send challenge to peer
      socket.emit("auth-challenge", {
        challenge: challenge,
        serverId: this.server.serverID,
      });
    }

    // Register the new connection
    this.connectionManager.registerIncomingConnection(socket, peerId, peerUrl);

    // Handle authentication responses
    socket.on("auth-response", (data) => {
      this.securityManager.handleAuthResponse(socket, data);
    });

    // Set up WebRTC signaling handlers
    if (this.webrtcEnabled) {
      socket.on("webrtc-signal", (data) => {
        // Forward to webrtcManager
        if (this.server.webrtcManager) {
          this.server.webrtcManager.handleSignal(
            socket,
            data.peerId,
            data.signal
          );
        }
      });
    }
  }

  /**
   * Connect to known peers
   * @param {Array<string>} peerURLs - URLs of peers to connect to
   * @param {Object} [socketOptions={}] - Socket.IO options
   */
  connectToPeers(peerURLs, socketOptions = {}) {
    // Don't connect to peers if shutting down
    if (this.isShuttingDown) {
      console.log("Skipping peer connections during shutdown");
      return;
    }

    this.connectionManager.connectToPeers(peerURLs, socketOptions, this);
  }

  /**
   * Register a WebRTC peer connection
   * @param {string} peerId - Peer ID
   * @param {Object} peer - WebRTC peer or data channel
   */
  registerWebRTCPeer(peerId, peer) {
    this.connectionManager.registerWebRTCPeer(peerId, peer);
  }

  /**
   * Unregister a WebRTC peer connection
   * @param {string} peerId - Peer ID
   */
  unregisterWebRTCPeer(peerId) {
    this.connectionManager.unregisterWebRTCPeer(peerId);
  }

  /**
   * Close all socket connections properly
   */
  closeAllConnections() {
    this.isShuttingDown = true;
    this.connectionManager.closeAllConnections();
  }

  /**
   * Broadcast a message to all connected peers
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {number} - Number of peers message was sent to
   */
  broadcast(event, data) {
    // Skip broadcasting if shutting down
    if (this.isShuttingDown) {
      console.log("Skipping broadcast during shutdown");
      return 0;
    }

    return this.broadcastManager.broadcast(event, data);
  }

  /**
   * Get connection status information
   * @returns {Object} - Connection status info
   */
  getConnectionStatus() {
    return this.connectionManager.getConnectionStatus();
  }
}

module.exports = SocketManager;
