/**
 * ServerAPI - Handles data operations and API functionality
 */
const { randomBytes } = require("crypto");
const VectorClock = require("../../sync/vector-clock");

class ServerAPI {
  /**
   * Create a new ServerAPI instance
   * @param {Object} server - P2PServer instance
   */
  constructor(server) {
    this.server = server;
  }

  /**
   * Store data at the specified path and synchronize with peers
   * @param {string} path - Data path
   * @param {any} value - Data value
   * @returns {Promise<Object>} - Result with timestamp and vector clock
   */
  async put(path, value) {
    if (this.server.isShuttingDown) {
      throw new Error("Server is shutting down, cannot accept new data");
    }

    // Get our current vector clock and increment it for this update
    const currentClock = this.server.sync.syncManager.getVectorClock();
    const vectorClock = new VectorClock(currentClock);
    vectorClock.increment(this.server.serverID);

    // Generate a secure message ID if security is enabled
    const msgId = this.server.securityEnabled
      ? this.server.securityManager.generateSecureId()
      : randomBytes(16).toString("hex");

    // Create data object with metadata
    const data = {
      path,
      value,
      msgId,
      origin: this.server.serverID,
      vectorClock: vectorClock.toJSON(),
    };

    // Process through sync manager
    const result = await this.server.sync.syncManager.handlePut(data);

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
      const data = await this.server.db.get(path);

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
      if (this.server.isShuttingDown) {
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
    if (this.server.isShuttingDown) {
      throw new Error(
        "Server is shutting down, cannot accept new subscriptions"
      );
    }

    return this.server.sync.syncManager.subscribe(path, callback);
  }

  /**
   * Scan database entries by prefix
   * @param {string} prefix - Path prefix
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} - Matching entries
   */
  async scan(prefix, options = {}) {
    return this.server.db.scan(prefix, options);
  }
}

module.exports = ServerAPI;
