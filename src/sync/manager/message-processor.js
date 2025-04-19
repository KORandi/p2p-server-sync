/**
 * MessageProcessor - Handles processing and tracking of messages
 */

const VectorClock = require("../vector-clock");

class MessageProcessor {
  /**
   * Create a new MessageProcessor
   * @param {Object} syncManager - Parent SyncManager instance
   */
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.processedMessages = new Set();
    this.messageTimestamps = new Map();
  }

  /**
   * Handle PUT operations with conflict resolution
   * @param {Object} data - Data object with path, value, vectorClock, etc.
   * @returns {Promise<Object>} - Processed data
   */
  async handlePut(data) {
    // Skip if shutting down
    if (this.syncManager.isShuttingDown) {
      console.log(`Skipping data processing during shutdown for ${data.path}`);
      return null;
    }

    // Skip already processed messages
    if (data.msgId && this.processedMessages.has(data.msgId)) {
      if (this.syncManager.server.debugMode) {
        console.log(`Already processed message ${data.msgId}, skipping`);
      }
      return null;
    }

    // Skip if we've already seen this message
    if (
      Array.isArray(data.visitedServers) &&
      data.visitedServers.includes(this.syncManager.server.serverID)
    ) {
      if (this.syncManager.server.debugMode) {
        console.log(
          `Already visited server ${this.syncManager.server.serverID}, skipping to prevent loops`
        );
      }
      return null;
    }

    // Mark message as processed
    if (data.msgId) {
      this.processedMessages.add(data.msgId);
      this.messageTimestamps.set(data.msgId, Date.now());
    }

    try {
      // Get existing data
      const existingData = await this.syncManager.server.db.get(data.path);

      // Add origin to known nodes
      if (data.origin) this.syncManager.knownNodeIds.add(data.origin);

      // Parse incoming vector clock
      const incomingVectorClock = data.vectorClock
        ? VectorClock.fromJSON(data.vectorClock)
        : new VectorClock({
            [data.origin || this.syncManager.server.serverID]: 1,
          });

      // Create new data object
      const newData = {
        value: data.value,
        origin: data.origin || this.syncManager.server.serverID,
        vectorClock: incomingVectorClock.toJSON(),
      };

      // Process and resolve conflicts
      const finalData = await this._resolveConflicts(
        data.path,
        existingData,
        newData,
        incomingVectorClock
      );

      // Store data in database
      await this.syncManager.server.db.put(data.path, finalData);

      // Notify subscribers
      this.syncManager.subscriptionManager.notifySubscribers(
        data.path,
        finalData.value
      );

      // Propagate changes to peers if not shutting down and not part of anti-entropy
      if (!this.syncManager.isShuttingDown && !data.antiEntropy) {
        this._propagateChanges(data, finalData);
      }

      return finalData;
    } catch (error) {
      console.error(`Error handling PUT for ${data.path}:`, error);
      return null;
    }
  }

  /**
   * Resolve conflicts between existing and new data using vector clocks
   * @private
   * @param {string} path - Data path
   * @param {Object} existingData - Existing data
   * @param {Object} newData - New data
   * @param {Object} incomingVectorClock - Incoming vector clock
   * @returns {Promise<Object>} - Resolved data
   */
  async _resolveConflicts(path, existingData, newData, incomingVectorClock) {
    let finalData = newData;

    // Handle conflicts if we have existing data
    if (existingData) {
      // Add to version history
      this.syncManager.versionManager.addToVersionHistory(path, existingData);

      // Ensure existing data has a valid vector clock
      const existingVectorClock = existingData.vectorClock
        ? VectorClock.fromJSON(existingData.vectorClock)
        : new VectorClock();

      // Create full objects for conflict resolution
      const localData = {
        ...existingData,
        vectorClock: existingVectorClock,
      };

      const remoteData = {
        ...newData,
        vectorClock: incomingVectorClock,
      };

      // Compare vector clocks
      const relation =
        existingVectorClock.dominanceRelation(incomingVectorClock);
      const strategy =
        this.syncManager.conflictResolver.getStrategyForPath(path);

      console.log(
        `Vector clock relation for ${path}: ${relation}, using strategy: ${strategy}`
      );

      // Apply conflict resolution
      finalData = this.syncManager.conflictResolver.resolve(
        path,
        localData,
        remoteData
      );
    }

    // Always merge with our vector clock
    this.syncManager.vectorClock =
      this.syncManager.vectorClock.merge(incomingVectorClock);

    // Increment our clock if we're the origin
    if (newData.origin === this.syncManager.server.serverID) {
      this.syncManager.vectorClock.increment(this.syncManager.server.serverID);
    }

    // Ensure all known node IDs are in our vector clock
    for (const nodeId of this.syncManager.knownNodeIds) {
      if (!(nodeId in this.syncManager.vectorClock.clock)) {
        this.syncManager.vectorClock.clock[nodeId] = 0;
      }
    }

    // Update final data with merged vector clock
    finalData.vectorClock = this.syncManager.vectorClock.toJSON();

    return finalData;
  }

  /**
   * Propagate changes to peers
   * @private
   * @param {Object} originalData - Original data
   * @param {Object} finalData - Final resolved data
   */
  _propagateChanges(originalData, finalData) {
    // Skip if shutting down
    if (this.syncManager.isShuttingDown) {
      console.log(
        `Skipping message propagation during shutdown for ${originalData.path}`
      );
      return;
    }

    // Prepare data to broadcast with our merged vector clock
    const broadcastData = {
      ...originalData,
      vectorClock: this.syncManager.vectorClock.toJSON(),
    };

    // Initialize visited servers array if it doesn't exist
    const visitedServers = Array.isArray(broadcastData.visitedServers)
      ? broadcastData.visitedServers
      : [];

    // Add current server ID to the list of visited servers
    if (!visitedServers.includes(this.syncManager.server.serverID)) {
      visitedServers.push(this.syncManager.server.serverID);
    }

    // Forward messages to help them propagate
    if (originalData.origin === this.syncManager.server.serverID) {
      console.log(
        `Broadcasting update for ${originalData.path} to peers as originator`
      );

      this.syncManager.server.socketManager.broadcast("put", {
        ...broadcastData,
        visitedServers,
      });
    } else {
      console.log(
        `Forwarding update for ${originalData.path} from ${originalData.origin || "unknown"} to peers`
      );
      console.log(
        `Message has visited ${visitedServers.length} servers: [${visitedServers.join(", ")}]`
      );

      this.syncManager.server.socketManager.broadcast("put", {
        ...broadcastData,
        visitedServers,
      });
    }
  }

  /**
   * Clean up old processed messages
   */
  cleanupProcessedMessages() {
    if (this.syncManager.isShuttingDown) return;

    const now = Date.now();
    let removedCount = 0;

    // Remove messages older than maxMessageAge
    for (const [msgId, timestamp] of this.messageTimestamps.entries()) {
      if (now - timestamp > this.syncManager.maxMessageAge) {
        this.processedMessages.delete(msgId);
        this.messageTimestamps.delete(msgId);
        removedCount++;
      }
    }
  }
}

module.exports = MessageProcessor;
