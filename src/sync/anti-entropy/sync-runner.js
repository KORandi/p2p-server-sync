/**
 * SyncRunner - Executes anti-entropy synchronization tasks
 */

class SyncRunner {
  /**
   * Create a new SyncRunner
   * @param {Object} antiEntropy - Parent AntiEntropy instance
   */
  constructor(antiEntropy) {
    this.antiEntropy = antiEntropy;
  }

  /**
   * Select peers for synchronization
   * @param {Array<string>} peers - Available peers
   * @returns {Array<string>} Selected peers
   */
  selectPeersForSync(peers) {
    const syncManager = this.antiEntropy.syncManager;
    const server = syncManager.server;
    const selectedPeers = [];

    for (const peer of peers) {
      const socket = server.socketManager.sockets[peer];
      if (socket && socket.connected) {
        selectedPeers.push(peer);
        syncManager.knownNodeIds.add(peer);
      }
    }

    return selectedPeers;
  }

  /**
   * Synchronize vector clocks with selected peers
   * @param {Array<string>} peers - Selected peer IDs
   * @param {string} batchId - Unique batch ID
   * @returns {Promise<void>}
   */
  async syncVectorClocksWithPeers(peers, batchId) {
    const syncManager = this.antiEntropy.syncManager;
    const server = syncManager.server;

    for (const peer of peers) {
      const socket = server.socketManager.sockets[peer];

      if (!socket || !socket.connected) continue;

      // Send vector clock synchronization message
      const syncMessage = {
        type: "vector-clock-sync",
        vectorClock: syncManager.vectorClock.toJSON(),
        nodeId: server.serverID,
        timestamp: Date.now(),
        syncId: `${batchId}-clock-${Math.random().toString(36).substring(2, 9)}`,
        isAntiEntropy: true, // Mark as anti-entropy message to exempt from rate limiting
      };

      socket.emit("vector-clock-sync", syncMessage);
    }

    // Wait for vector clock exchanges to process
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Request data from peers (pull-based approach)
   * @param {Array<string>} peers - Selected peer IDs
   * @param {string} batchId - Unique batch ID
   * @param {string} path - Data path or prefix
   * @returns {Promise<void>}
   */
  async requestDataFromPeers(peers, batchId, path) {
    const syncManager = this.antiEntropy.syncManager;
    const server = syncManager.server;

    for (const peer of peers) {
      const socket = server.socketManager.sockets[peer];

      if (!socket || !socket.connected) {
        console.log(`Selected peer ${peer} is not connected, skipping`);
        continue;
      }

      // Create a unique request ID
      const requestId = `${batchId}-request-${Math.random().toString(36).substring(2, 9)}`;

      // Prepare the data request with our current vector clock
      const requestData = {
        requestId: requestId,
        nodeId: server.serverID,
        vectorClock: syncManager.vectorClock.toJSON(),
        timestamp: Date.now(),
        path: path,
        isAntiEntropy: true, // Mark as anti-entropy message for rate limit exemption
      };

      // Send the data request to the peer
      console.log(
        `Requesting data from peer ${peer} for path: ${path || "all"}`
      );
      socket.emit("anti-entropy-request", requestData);
    }
  }

  /**
   * Get all data changes for responding to anti-entropy requests
   * @param {string} path - Data path or prefix
   * @returns {Promise<Array>} - List of changes
   */
  async getAllChanges(path = "") {
    try {
      // Get all data from the database
      return await this.antiEntropy.syncManager.server.db.scan(path);
    } catch (error) {
      console.error("Error getting changes for anti-entropy:", error);
      return [];
    }
  }
}

module.exports = SyncRunner;
