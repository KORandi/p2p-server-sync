/**
 * P2PServer - Main Server Class
 * Coordinates all components of the P2P synchronization system
 */

const express = require("express");
const { createServer } = require("http");
const deepmerge = require("deepmerge");

// Import core components
const DatabaseManager = require("../database");
const { getDefaultConfig, validateConfig } = require("../config");

// Import server components
const ServerInit = require("./server-init");
const ServerAPI = require("./server-api");
const ServerSync = require("./server-sync");
const ServerSecurity = require("./server-security");
const ServerNetwork = require("./server-network");
const ServerUtils = require("./server-utils");

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

    // Initialize Express and HTTP server
    this.app = express();
    this.app.use(express.json());
    this.server = createServer(this.app);

    // Initialize core components
    this.db = new DatabaseManager(this.dbPath);

    // Initialize all server components
    this.security = new ServerSecurity(this, config);
    this.network = new ServerNetwork(this, config);
    this.sync = new ServerSync(this, config);
    this.api = new ServerAPI(this);
    this.utils = new ServerUtils(this);
    this.init = new ServerInit(this);

    // Re-export properties from security component
    this.securityEnabled = this.security.securityEnabled;
    this.securityManager = this.security.securityManager;
    this.securityConfig = this.security.securityConfig;

    // Re-export properties from network component
    this.socketManager = this.network.socketManager;
    this.webrtcEnabled = this.network.webrtcEnabled;
    this.webrtcManager = this.network.webrtcManager;
    this.webrtcConfig = this.network.webrtcConfig;

    // Re-export properties from sync component
    this.syncManager = this.sync.syncManager;
  }

  /**
   * Start the server and connect to peers
   * @returns {Promise<void>}
   */
  async start() {
    return this.init.start();
  }

  /**
   * Store data at the specified path and synchronize with peers
   * @param {string} path - Data path
   * @param {any} value - Data value
   * @returns {Promise<Object>} - Result with timestamp and vector clock
   */
  async put(path, value) {
    return this.api.put(path, value);
  }

  /**
   * Retrieve data from the specified path
   * @param {string} path - Data path
   * @returns {Promise<any>} - Data value
   */
  async get(path) {
    return this.api.get(path);
  }

  /**
   * Delete data at the specified path
   * @param {string} path - Data path
   * @returns {Promise<boolean>} - Success indicator
   */
  async del(path) {
    return this.api.del(path);
  }

  /**
   * Subscribe to changes at a path or prefix
   * @param {string} path - Path prefix to subscribe to
   * @param {Function} callback - Function called on changes
   * @returns {Promise<Function>} - Unsubscribe function
   */
  async subscribe(path, callback) {
    return this.api.subscribe(path, callback);
  }

  /**
   * Scan database entries by prefix
   * @param {string} prefix - Path prefix
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} - Matching entries
   */
  async scan(prefix, options = {}) {
    return this.api.scan(prefix, options);
  }

  /**
   * Get version history for a path
   * @param {string} path - Data path
   * @returns {Array} - Version history
   */
  getVersionHistory(path) {
    return this.sync.getVersionHistory(path);
  }

  /**
   * Set conflict resolution strategy for a path
   * @param {string} path - Data path or prefix
   * @param {string} strategy - Strategy name
   */
  setConflictStrategy(path, strategy) {
    return this.sync.setConflictStrategy(path, strategy);
  }

  /**
   * Register a custom conflict resolver
   * @param {string} path - Data path or prefix
   * @param {Function} resolverFn - Resolver function
   */
  registerConflictResolver(path, resolverFn) {
    return this.sync.registerConflictResolver(path, resolverFn);
  }

  /**
   * Run anti-entropy synchronization
   * @param {string} path - Data path or prefix
   * @returns {Promise<void>}
   */
  async runAntiEntropy(path = "") {
    return this.sync.runAntiEntropy(path);
  }

  /**
   * Connect to a specific peer via WebRTC (NAT traversal)
   * @param {string} peerId - Peer ID to connect to
   * @returns {Promise<boolean>} - Whether connection was initiated
   */
  async connectToPeerViaWebRTC(peerId) {
    return this.network.connectToPeerViaWebRTC(peerId);
  }

  /**
   * Check WebRTC connection status with a peer
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} - Whether a WebRTC connection is established
   */
  hasWebRTCConnection(peerId) {
    return this.network.hasWebRTCConnection(peerId);
  }

  /**
   * Get connection statistics
   * @returns {Object} - Connection statistics
   */
  getConnectionStats() {
    return this.network.getConnectionStats();
  }

  /**
   * Check if a peer has the necessary security configuration
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} - Whether communication with this peer is secure
   */
  isPeerSecure(peerId) {
    return this.security.isPeerSecure(peerId);
  }

  /**
   * Encrypt data for network transmission
   * @param {Object} data - Data to encrypt
   * @returns {Object} - Encrypted data package
   */
  encryptData(data) {
    return this.security.encryptData(data);
  }

  /**
   * Decrypt received data
   * @param {Object} encryptedData - Encrypted data package
   * @returns {Object} - Decrypted data
   */
  decryptData(encryptedData) {
    return this.security.decryptData(encryptedData);
  }

  /**
   * Close server and database connections
   * @returns {Promise<void>}
   */
  async close() {
    this.isShuttingDown = true;
    console.log(`Server ${this.serverID} beginning shutdown process`);

    return this.init.close();
  }

  /**
   * Event listener when new socket identifies
   * @param {(socket: Object) => void} callback
   */
  onSocketConnect(callback) {
    this.network.onSocketConnect(callback);
  }
}

module.exports = P2PServer;
