/**
 * VectorClockSync - Manages vector clock synchronization between peers
 */

class VectorClockSync {
  /**
   * Create a new VectorClockSync
   * @param {Object} antiEntropy - Parent AntiEntropy instance
   */
  constructor(antiEntropy) {
    this.antiEntropy = antiEntropy;
    this.lastFullSync = 0;
  }

  /**
   * Synchronize vector clocks across nodes with enhanced controls
   * @param {boolean} [force=false] - Force synchronization even if recent
   * @returns {Promise<void>}
   */
  async synchronizeVectorClocks(force = false) {
    const syncManager = this.antiEntropy.syncManager;
    const server = syncManager.server;

    // Skip if shutting down
    if (syncManager.isShuttingDown) return;

    // Don't run too frequently unless forced
    const now = Date.now();
    if (!force && now - this.lastFullSync < 1000) return;
    this.lastFullSync = now;

    try {
      // Get connections
      const sockets = server.socketManager.sockets;
      if (Object.keys(sockets).length === 0) return;

      // Prepare synchronization message
      const syncMessage = {
        type: "vector-clock-sync",
        vectorClock: syncManager.vectorClock.toJSON(),
        nodeId: server.serverID,
        timestamp: now,
        syncId: `${server.serverID}-${now}-${Math.random().toString(36).substring(2, 9)}`,
        isAntiEntropy: true, // Mark as anti-entropy message to exempt from rate limiting
      };

      // Send to all connected peers
      let syncCount = 0;
      for (const [peerId, socket] of Object.entries(sockets)) {
        if (socket && socket.connected) {
          // Track this node ID
          syncManager.knownNodeIds.add(peerId);

          // Send synchronization message
          socket.emit("vector-clock-sync", syncMessage);
          syncCount++;
        }
      }

      // Ensure all known node IDs are in our vector clock
      this._ensureKnownNodesInClock();

      if (syncCount > 0 && server.debugMode) {
        console.log(`Synchronized vector clocks with ${syncCount} peers`);
      }
    } catch (error) {
      console.error("Error synchronizing vector clocks:", error);
    }
  }

  /**
   * Handle incoming vector clock synchronization with rate limit exemption
   * @param {Object} data - Sync message data
   * @param {Object} socket - Socket.IO socket
   * @returns {Promise<void>}
   */
  async handleVectorClockSync(data, socket) {
    const syncManager = this.antiEntropy.syncManager;

    // Skip if shutting down
    if (syncManager.isShuttingDown) return;

    try {
      // Validate the data
      if (!data || !data.vectorClock || !data.nodeId) {
        console.warn("Invalid vector clock sync data:", data);
        return;
      }

      // Track this node ID
      syncManager.knownNodeIds.add(data.nodeId);

      // Convert to VectorClock instance
      const remoteClock = syncManager.constructor.VectorClock.fromJSON(
        data.vectorClock
      );

      // Merge the remote clock with our clock
      syncManager.vectorClock = syncManager.vectorClock.merge(remoteClock);

      // Ensure all known node IDs are in our vector clock
      this._ensureKnownNodesInClock();

      // Send our merged clock back to help convergence
      const responseMessage = {
        type: "vector-clock-sync-response",
        vectorClock: syncManager.vectorClock.toJSON(),
        nodeId: syncManager.server.serverID,
        timestamp: Date.now(),
        inResponseTo: data.syncId,
        isAntiEntropy: true, // Mark as anti-entropy message to exempt from rate limiting
      };

      if (socket && socket.connected) {
        socket.emit("vector-clock-sync-response", responseMessage);
      }
    } catch (error) {
      console.error("Error handling vector clock sync:", error);
    }
  }

  /**
   * Handle response to vector clock synchronization
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async handleVectorClockSyncResponse(data) {
    const syncManager = this.antiEntropy.syncManager;

    // Skip if shutting down
    if (syncManager.isShuttingDown) return;

    try {
      // Validate the data
      if (!data || !data.vectorClock || !data.nodeId) {
        console.warn("Invalid vector clock sync response data:", data);
        return;
      }

      // Track this node ID
      syncManager.knownNodeIds.add(data.nodeId);

      // Convert to VectorClock instance
      const remoteClock = syncManager.constructor.VectorClock.fromJSON(
        data.vectorClock
      );

      // Merge the remote clock with our clock
      syncManager.vectorClock = syncManager.vectorClock.merge(remoteClock);

      // Ensure all known node IDs are in our vector clock
      this._ensureKnownNodesInClock();
    } catch (error) {
      console.error("Error handling vector clock sync response:", error);
    }
  }

  /**
   * Ensure all known node IDs are in our vector clock
   * @private
   */
  _ensureKnownNodesInClock() {
    const syncManager = this.antiEntropy.syncManager;

    for (const nodeId of syncManager.knownNodeIds) {
      if (!(nodeId in syncManager.vectorClock.clock)) {
        syncManager.vectorClock.clock[nodeId] = 0;
      }
    }
  }
}

module.exports = VectorClockSync;
