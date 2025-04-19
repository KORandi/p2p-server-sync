/**
 * SyncProcessor - Processes anti-entropy requests and responses
 */

class SyncProcessor {
  /**
   * Create a new SyncProcessor
   * @param {Object} antiEntropy - Parent AntiEntropy instance
   */
  constructor(antiEntropy) {
    this.antiEntropy = antiEntropy;
  }

  /**
   * Handle incoming anti-entropy data request
   * @param {Object} data - Request data
   * @param {Object} socket - Socket.IO socket
   * @returns {Promise<void>}
   */
  async handleAntiEntropyRequest(data, socket) {
    const syncManager = this.antiEntropy.syncManager;
    const server = syncManager.server;

    // Skip if shutting down
    if (syncManager.isShuttingDown) return;

    try {
      // Validate the request
      if (!data || !data.requestId || !data.nodeId || !data.vectorClock) {
        console.warn("Invalid anti-entropy request data:", data);
        return;
      }

      const path = data.path || "";

      console.log(
        `Received anti-entropy request from ${data.nodeId} for path: ${path || "all"}`
      );

      // Add the requesting node to known nodes
      syncManager.knownNodeIds.add(data.nodeId);

      // Get the requester's vector clock
      const requesterClock = syncManager.constructor.VectorClock.fromJSON(
        data.vectorClock
      );

      // Merge the requester's clock with our clock
      syncManager.vectorClock = syncManager.vectorClock.merge(requesterClock);

      // Get all our data to send back
      const allChanges = await this.antiEntropy.syncRunner.getAllChanges(path);
      console.log(
        `Sending ${allChanges.length} changes in response to anti-entropy request`
      );

      // Organize data into batches to avoid overwhelming the network
      await this._sendResponseInBatches(socket, data, allChanges);

      console.log(`Sent anti-entropy response to ${data.nodeId}`);
    } catch (error) {
      console.error("Error handling anti-entropy request:", error);
    }
  }

  /**
   * Send response data in batches
   * @private
   * @param {Object} socket - Socket.IO socket
   * @param {Object} requestData - Original request data
   * @param {Array} changes - Data changes to send
   * @returns {Promise<void>}
   */
  async _sendResponseInBatches(socket, requestData, changes) {
    const syncManager = this.antiEntropy.syncManager;
    const server = syncManager.server;

    // Organize data into batches to avoid overwhelming the network
    const BATCH_SIZE = 50;
    const batchCount = Math.ceil(changes.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
      // Skip if shutting down mid-process
      if (syncManager.isShuttingDown) break;

      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, changes.length);
      const batchChanges = changes.slice(startIndex, endIndex);

      // Prepare response batch
      const responseData = {
        responseId: requestData.requestId,
        nodeId: server.serverID,
        vectorClock: syncManager.vectorClock.toJSON(),
        timestamp: Date.now(),
        batchIndex: batchIndex,
        totalBatches: batchCount,
        changes: batchChanges,
        isAntiEntropy: true, // Mark as anti-entropy message for rate limit exemption
      };

      // Send the response batch
      socket.emit("anti-entropy-response", responseData);

      // Add a small delay between batches
      if (batchIndex < batchCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Handle incoming anti-entropy response
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async handleAntiEntropyResponse(data) {
    const syncManager = this.antiEntropy.syncManager;

    // Skip if shutting down
    if (syncManager.isShuttingDown) return;

    try {
      // Validate the response
      if (!data || !data.responseId || !data.nodeId || !data.changes) {
        console.warn("Invalid anti-entropy response data:", data);
        return;
      }

      console.log(
        `Received anti-entropy response batch ${data.batchIndex + 1}/${data.totalBatches} from ${data.nodeId} with ${data.changes.length} changes`
      );

      // Add the responding node to known nodes
      syncManager.knownNodeIds.add(data.nodeId);

      // Merge vector clocks
      if (data.vectorClock) {
        const remoteClock = syncManager.constructor.VectorClock.fromJSON(
          data.vectorClock
        );
        syncManager.vectorClock = syncManager.vectorClock.merge(remoteClock);
      }

      // Process each change
      await this._processResponseChanges(data);

      if (data.batchIndex === data.totalBatches - 1) {
        console.log(
          `Completed processing anti-entropy response from ${data.nodeId}`
        );
      }
    } catch (error) {
      console.error("Error handling anti-entropy response:", error);
    }
  }

  /**
   * Process changes from an anti-entropy response
   * @private
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async _processResponseChanges(data) {
    const syncManager = this.antiEntropy.syncManager;

    // Process each change
    for (const change of data.changes) {
      // Skip if shutting down mid-process
      if (syncManager.isShuttingDown) break;

      // Prepare the data for processing
      const syncData = {
        path: change.path,
        value: change.value,
        timestamp: change.timestamp,
        origin: change.origin || data.nodeId,
        vectorClock: data.vectorClock,
        msgId: `anti-entropy-${data.responseId}-${change.path}`,
        forwarded: true,
        antiEntropy: true,
      };

      // Process the update through the sync manager
      await syncManager.handlePut(syncData);
    }
  }
}

module.exports = SyncProcessor;
