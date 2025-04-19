/**
 * ServerSync - Manages synchronization related functionality
 */
const SyncManager = require("../../sync/manager");

class ServerSync {
  /**
   * Create a new ServerSync instance
   * @param {Object} server - P2PServer instance
   * @param {Object} config - Server configuration
   */
  constructor(server, config) {
    this.server = server;
    this.syncManager = new SyncManager(
      server,
      config.sync || {},
      config.conflict || {}
    );
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
    if (this.server.isShuttingDown) {
      console.log("Skipping anti-entropy during shutdown");
      return;
    }

    return this.syncManager.runAntiEntropy(path);
  }
}

module.exports = ServerSync;
