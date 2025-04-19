/**
 * SyncManager - Handles data synchronization between peers
 * Coordinates vector clocks and conflict resolution
 */

const VectorClock = require("../vector-clock");
const ConflictResolver = require("../conflict");
const AntiEntropy = require("../anti-entropy");
const MessageProcessor = require("./message-processor");
const SubscriptionManager = require("./subscription-manager");
const VersionManager = require("./version-manager");

class SyncManager {
  /**
   * Create a new SyncManager
   * @param {Object} server - P2PServer instance
   * @param {Object} syncOptions - Synchronization options
   * @param {Object} conflictOptions - Conflict resolution options
   */
  constructor(server, syncOptions = {}, conflictOptions = {}) {
    this.server = server;
    this.isShuttingDown = false;
    this.knownNodeIds = new Set([server.serverID]);

    // Initialize configuration
    this.maxMessageAge = syncOptions.maxMessageAge || 300000; // 5 minutes
    this.maxVersions = syncOptions.maxVersions || 10;

    // Initialize components
    this.vectorClock = new VectorClock();
    this.vectorClock.increment(this.server.serverID);

    this.conflictResolver = new ConflictResolver(conflictOptions);

    // Make VectorClock class available to components that need it
    this.constructor.VectorClock = VectorClock;

    // Initialize managers
    this.messageProcessor = new MessageProcessor(this);
    this.subscriptionManager = new SubscriptionManager(this);
    this.versionManager = new VersionManager(this);

    // Initialize AntiEntropy after setting up vectorClock
    this.antiEntropy = new AntiEntropy(this);

    // Initialize cleanup and sync intervals
    this._setupIntervals(syncOptions);
  }

  /**
   * Set up periodic maintenance intervals
   * @private
   */
  _setupIntervals(options) {
    this.cleanupInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.messageProcessor.cleanupProcessedMessages();
      }
    }, 60000); // Every minute

    // Anti-entropy sync interval (optional)
    if (
      options.antiEntropyInterval !== null &&
      options.antiEntropyInterval !== undefined
    ) {
      this.antiEntropyInterval = setInterval(() => {
        if (!this.isShuttingDown) {
          // Pass isScheduled=true to indicate this is a scheduled run
          this.runAntiEntropy(null, false, true).catch((err) =>
            console.error("Anti-entropy error:", err)
          );
        }
      }, options.antiEntropyInterval);
      console.log(
        `Automatic anti-entropy scheduled every ${options.antiEntropyInterval}ms`
      );
    } else if (options.antiEntropyInterval === null) {
      console.log("Automatic anti-entropy synchronization disabled");
    }

    // Vector clock synchronization interval
    this.clockSyncInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.synchronizeVectorClocks().catch((err) =>
          console.error("Vector clock sync error:", err)
        );
      }
    }, 2000); // Every 2 seconds
  }

  /**
   * Get current vector clock
   * @returns {Object} - Vector clock as JSON
   */
  getVectorClock() {
    return this.vectorClock.toJSON();
  }

  /**
   * Prepare for shutdown
   */
  prepareForShutdown() {
    this.isShuttingDown = true;

    // Clear all intervals
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.antiEntropyInterval) clearInterval(this.antiEntropyInterval);
    if (this.clockSyncInterval) clearInterval(this.clockSyncInterval);

    console.log("SyncManager prepared for shutdown");
  }

  /**
   * Handle PUT operations with correct anti-entropy handling
   * @param {Object} data - Data object with path, value, vectorClock, etc.
   * @returns {Promise<Object>} - Processed data
   */
  async handlePut(data) {
    return this.messageProcessor.handlePut(data);
  }

  /**
   * Get version history for a path
   * @param {string} path - Data path
   * @returns {Array} - Version history
   */
  getVersionHistory(path) {
    return this.versionManager.getVersionHistory(path);
  }

  /**
   * Subscribe to changes at a path
   * @param {string} path - Path to subscribe to
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(path, callback) {
    return this.subscriptionManager.subscribe(path, callback);
  }

  /**
   * Set conflict resolution strategy for a path
   * @param {string} path - Data path or prefix
   * @param {string} strategy - Strategy name
   */
  setConflictStrategy(path, strategy) {
    this.conflictResolver.setStrategy(path, strategy);
  }

  /**
   * Register a custom conflict resolver
   * @param {string} path - Data path or prefix
   * @param {Function} resolverFn - Resolver function
   */
  registerConflictResolver(path, resolverFn) {
    this.conflictResolver.registerCustomResolver(path, resolverFn);
  }

  /**
   * Run anti-entropy synchronization
   * @param {string} path - Data path or prefix
   * @param {boolean} [force=false] - Force run even if another process is running
   * @param {boolean} [isScheduled=false] - Whether this is a scheduled run
   * @returns {Promise<void>}
   */
  async runAntiEntropy(path = "", force = false, isScheduled = false) {
    if (this.isShuttingDown) {
      console.log("Skipping anti-entropy during shutdown");
      return;
    }

    return this.antiEntropy.run(path, force, isScheduled);
  }

  /**
   * Synchronize vector clocks with peers
   * @param {boolean} [force=false] - Force synchronization even if recent
   * @returns {Promise<void>}
   */
  async synchronizeVectorClocks(force = false) {
    if (this.isShuttingDown) return;

    return this.antiEntropy.synchronizeVectorClocks(force);
  }

  /**
   * Handle vector clock synchronization (delegated to antiEntropy)
   * @param {Object} data - Sync message data
   * @param {Object} socket - Socket.IO socket
   * @returns {Promise<void>}
   */
  async handleVectorClockSync(data, socket) {
    return this.antiEntropy.handleVectorClockSync(data, socket);
  }

  /**
   * Handle vector clock synchronization response (delegated to antiEntropy)
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async handleVectorClockSyncResponse(data) {
    return this.antiEntropy.handleVectorClockSyncResponse(data);
  }

  /**
   * Handle anti-entropy data request from peer
   * @param {Object} data - Request data
   * @param {Object} socket - Socket.IO socket
   * @returns {Promise<void>}
   */
  async handleAntiEntropyRequest(data, socket) {
    return this.antiEntropy.handleAntiEntropyRequest(data, socket);
  }

  /**
   * Handle anti-entropy data response from peer
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async handleAntiEntropyResponse(data) {
    return this.antiEntropy.handleAntiEntropyResponse(data);
  }
}

module.exports = SyncManager;
