/**
 * P2PServer - Main Server Class
 * Coordinates all components of the P2P synchronization system
 */

const express = require("express");
const { createServer } = require("http");
const { randomBytes } = require("crypto");

// Import core managers
const DatabaseManager = require("./database-manager");

// Import network components
const SocketManager = require("../network/socket-manager");
const WebRTCNATManager = require("../network/webrtc-nat-manager");

// Import sync components
const SyncManager = require("../sync/sync-manager");
const { getDefaultConfig, validateConfig } = require("./config");
const VectorClock = require("../sync/vector-clock");
const deepmerge = require("deepmerge");

// Import security manager
const SecurityManager = require("../utils/security");

class P2PServer {
  /**
   * Create a new P2P Server instance
   * @param {Object} options - Server configuration options
   */
  constructor(options = {}) {
    const config = deepmerge(getDefaultConfig(), options);
    validateConfig(config);

    // Server identification and configuration
    this.serverID = config.serverID;
    this.port = config.port;
    this.dbPath = config.dbPath;
    this.peers = config.peers || [];
    this.isShuttingDown = false;

    // Security configuration
    // Security configuration
    this.securityEnabled = config.security?.enabled !== false; // Default to true if not explicitly disabled
    this.securityConfig = config.security || {};

    // Initialize Express and HTTP server
    this.app = express();
    this.app.use(express.json());
    this.server = createServer(this.app);

    // Initialize core components
    this.db = new DatabaseManager(this.dbPath);

    // Initialize security manager if enabled
    if (this.securityEnabled) {
      if (!this.securityConfig.masterKey) {
        throw new Error(
          "Security is enabled by default. Please provide a master key (PSK) " +
            "using the security.masterKey option, or explicitly disable security " +
            "by setting security.enabled to false."
        );
      }

      try {
        this.securityManager = new SecurityManager(this.securityConfig);
        console.log(
          `Security enabled with ${this.securityConfig.algorithm} encryption`
        );
      } catch (error) {
        console.error("Failed to initialize security manager:", error);
        throw new Error(`Security initialization failed: ${error.message}`);
      }
    } else {
      console.warn(
        "WARNING: Security is disabled - data will be transmitted in cleartext. " +
          "This is NOT recommended for production environments."
      );
    }

    // Initialize socket manager (pass security manager if enabled)
    this.socketManager = new SocketManager(this);

    // Initialize WebRTC NAT traversal if enabled
    if (this.webrtcEnabled) {
      this.webrtcManager = new WebRTCNATManager(this.webrtcConfig, this);

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
    } else {
      console.log("WebRTC support is disabled");
    }

    this.syncManager = new SyncManager(
      this,
      config.sync || {},
      config.conflict || {}
    );
  }

  /**
   * Start the server and connect to peers
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve) => {
      // Initialize socket connections
      this.socketManager.init(this.server);

      // Initialize WebRTC if enabled
      if (this.webrtcEnabled && this.webrtcManager) {
        this.webrtcManager.init();
      }

      // Connect to peers via websocket
      this.socketManager.connectToPeers(this.peers);

      // Start HTTP server
      this.server.listen(this.port, () => {
        console.log(
          `P2P Server started on port ${this.port} with ID: ${this.serverID}`
        );
        console.log(`Database path: ${this.dbPath}`);
        console.log(`Known peers: ${this.peers.join(", ") || "none"}`);
        console.log(`WebRTC enabled: ${this.webrtcEnabled}`);
        console.log(`Security enabled: ${this.securityEnabled}`);
        resolve();
      });
    });
  }

  /**
   * Store data at the specified path and synchronize with peers
   * @param {string} path - Data path
   * @param {any} value - Data value
   * @returns {Promise<Object>} - Result with timestamp and vector clock
   */
  async put(path, value) {
    if (this.isShuttingDown) {
      throw new Error("Server is shutting down, cannot accept new data");
    }

    // Get our current vector clock and increment it for this update
    const currentClock = this.syncManager.getVectorClock();
    const vectorClock = new VectorClock(currentClock);
    vectorClock.increment(this.serverID);

    // Generate a secure message ID if security is enabled
    const msgId = this.securityEnabled
      ? this.securityManager.generateSecureId()
      : randomBytes(16).toString("hex");

    // Create data object with metadata
    const data = {
      path,
      value,
      msgId,
      origin: this.serverID,
      vectorClock: vectorClock.toJSON(),
    };

    // Process through sync manager
    const result = await this.syncManager.handlePut(data);

    return {
      path,
      value: result.value,
      vectorClock: result.vectorClock,
    };
  }

  /**
   * Retrieve data from the specified path
   * @param {string} path - Data path
   * @returns {Promise<any>} - Data value
   */
  async get(path) {
    try {
      const data = await this.db.get(path);

      if (data && typeof data === "object" && "value" in data) {
        return data.value;
      }

      return null;
    } catch (error) {
      if (
        error.notFound ||
        error.code === "LEVEL_NOT_FOUND" ||
        error.type === "NotFoundError"
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete data at the specified path
   * @param {string} path - Data path
   * @returns {Promise<boolean>} - Success indicator
   */
  async del(path) {
    try {
      if (this.isShuttingDown) {
        throw new Error("Server is shutting down, cannot delete data");
      }

      // Check if path exists
      const exists = await this.get(path);

      if (exists === null) {
        return false;
      }

      // Soft delete by setting value to null
      await this.put(path, null);
      return true;
    } catch (error) {
      console.error(`Error deleting ${path}:`, error);
      return false;
    }
  }

  /**
   * Subscribe to changes at a path or prefix
   * @param {string} path - Path prefix to subscribe to
   * @param {Function} callback - Function called on changes
   * @returns {Promise<Function>} - Unsubscribe function
   */
  async subscribe(path, callback) {
    if (this.isShuttingDown) {
      throw new Error(
        "Server is shutting down, cannot accept new subscriptions"
      );
    }

    return this.syncManager.subscribe(path, callback);
  }

  /**
   * Scan database entries by prefix
   * @param {string} prefix - Path prefix
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} - Matching entries
   */
  async scan(prefix, options = {}) {
    return this.db.scan(prefix, options);
  }

  /**
   * Get version history for a path
   * @param {string} path - Data path
   * @returns {Array} - Version history
   */
  getVersionHistory(path) {
    return this.syncManager.getVersionHistory(path);
  }

  /**
   * Set conflict resolution strategy for a path
   * @param {string} path - Data path or prefix
   * @param {string} strategy - Strategy name
   */
  setConflictStrategy(path, strategy) {
    this.syncManager.setConflictStrategy(path, strategy);
  }

  /**
   * Register a custom conflict resolver
   * @param {string} path - Data path or prefix
   * @param {Function} resolverFn - Resolver function
   */
  registerConflictResolver(path, resolverFn) {
    this.syncManager.registerConflictResolver(path, resolverFn);
  }

  /**
   * Run anti-entropy synchronization
   * @param {string} path - Data path or prefix
   * @returns {Promise<void>}
   */
  async runAntiEntropy(path = "") {
    if (this.isShuttingDown) {
      console.log("Skipping anti-entropy during shutdown");
      return;
    }

    return this.syncManager.runAntiEntropy(path);
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
      securityEnabled: this.securityEnabled,
    };
  }

  /**
   * Check if a peer has the necessary security configuration
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} - Whether communication with this peer is secure
   */
  isPeerSecure(peerId) {
    // Security must be enabled locally first
    if (!this.securityEnabled) {
      return false;
    }

    // For now, we assume all peers with the same securityConfig are secure
    // In a more advanced implementation, this would check for key exchange confirmation
    return true;
  }

  /**
   * Encrypt data for network transmission
   * @param {Object} data - Data to encrypt
   * @returns {Object} - Encrypted data package
   */
  encryptData(data) {
    if (!this.securityEnabled || !this.securityManager) {
      return { encrypted: false, data };
    }

    try {
      return this.securityManager.encrypt(data);
    } catch (error) {
      console.error("Encryption error:", error);
      // Fallback to unencrypted if encryption fails
      return { encrypted: false, data };
    }
  }

  /**
   * Decrypt received data
   * @param {Object} encryptedData - Encrypted data package
   * @returns {Object} - Decrypted data
   */
  decryptData(encryptedData) {
    if (!encryptedData.encrypted) {
      return encryptedData.data || encryptedData;
    }

    if (!this.securityEnabled || !this.securityManager) {
      console.warn("Received encrypted data but security is disabled");
      throw new Error("Cannot decrypt: security is disabled");
    }

    try {
      return this.securityManager.decrypt(encryptedData);
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * Close server and database connections
   * @returns {Promise<void>}
   */
  async close() {
    this.isShuttingDown = true;
    console.log(`Server ${this.serverID} beginning shutdown process`);

    return new Promise(async (resolve, reject) => {
      try {
        // Stop sync manager first
        if (this.syncManager) {
          this.syncManager.prepareForShutdown();
          console.log(`Server ${this.serverID} stopped sync manager`);
        }

        // Close socket and WebRTC connections
        if (this.socketManager) {
          this.socketManager.closeAllConnections();
          console.log(`Server ${this.serverID} closed socket connections`);
        }

        // Close WebRTC separately if necessary
        if (this.webrtcEnabled && this.webrtcManager) {
          this.webrtcManager.closeAllConnections();
          console.log(`Server ${this.serverID} closed WebRTC connections`);
        }

        // Small delay for sockets to disconnect
        await new Promise((r) => setTimeout(r, 500));

        // Close HTTP server
        this.server.close(async () => {
          try {
            // Finally close the database
            await this.db.close();
            console.log(`Server ${this.serverID} database closed`);
            resolve();
          } catch (dbErr) {
            reject(dbErr);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
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

module.exports = P2PServer;
