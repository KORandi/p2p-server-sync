/**
 * Anti-Entropy - Handles periodic synchronization to ensure data consistency
 * Pull-based implementation where peers request data rather than pushing it
 */

const SyncRunner = require("./sync-runner");
const SyncProcessor = require("./sync-processor");
const VectorClockSync = require("./vector-clock-sync");
const ExecutionManager = require("./execution-manager");

class AntiEntropy {
  /**
   * Create a new AntiEntropy instance
   * @param {Object} syncManager - SyncManager instance
   */
  constructor(syncManager) {
    this.syncManager = syncManager;

    // Initialize components
    this.executionManager = new ExecutionManager(this);
    this.syncRunner = new SyncRunner(this);
    this.syncProcessor = new SyncProcessor(this);
    this.vectorClockSync = new VectorClockSync(this);

    // Initialize state
    this.lastFullSync = 0;
  }

  /**
   * Run anti-entropy synchronization with peers
   * @param {string} path - Data path or prefix
   * @param {boolean} [force=false] - Force synchronization even if recent
   * @param {boolean} [isScheduled=false] - Whether this is a scheduled run
   * @returns {Promise<void>}
   */
  async run(path = "", force = false, isScheduled = false) {
    const syncManager = this.syncManager;
    const server = syncManager.server;

    // Skip if shutting down
    if (syncManager.isShuttingDown) {
      console.log("Skipping anti-entropy synchronization during shutdown");
      return;
    }

    // Check if we can run now (handles busy, backoff, etc.)
    if (!this.executionManager.canRun(force, isScheduled)) {
      return;
    }

    // Mark as running
    this.executionManager.markRunning();

    console.log(
      `Starting anti-entropy synchronization for path: ${path || "all"}`
    );

    try {
      // Get list of peers
      const peers = Object.keys(server.socketManager.sockets);
      if (peers.length === 0) {
        console.log("No peers connected, skipping anti-entropy");
        this.executionManager.markCompleted(true);
        return;
      }

      // Choose peers to synchronize with
      const selectedPeers = this.syncRunner.selectPeersForSync(peers);
      console.log(
        `Running anti-entropy with ${selectedPeers.length} peers for path: ${path || "all"}`
      );

      // Create a batch ID for this anti-entropy run
      const batchId = `anti-entropy-${server.serverID}-${Date.now()}`;

      // First, synchronize vector clocks
      await this.syncRunner.syncVectorClocksWithPeers(selectedPeers, batchId);

      // Request data from peers instead of pushing
      await this.syncRunner.requestDataFromPeers(selectedPeers, batchId, path);

      // Run final vector clock sync
      await this.vectorClockSync.synchronizeVectorClocks();

      console.log("Anti-entropy synchronization completed successfully");

      // Mark execution as complete with success
      this.executionManager.markCompleted(true);
    } catch (error) {
      console.error("Error during anti-entropy synchronization:", error);

      // Mark execution as complete with failure
      this.executionManager.markCompleted(false);
    }
  }

  /**
   * Synchronize vector clocks across nodes with enhanced controls
   * @param {boolean} [force=false] - Force synchronization even if recent
   * @returns {Promise<void>}
   */
  async synchronizeVectorClocks(force = false) {
    return this.vectorClockSync.synchronizeVectorClocks(force);
  }

  /**
   * Handle incoming anti-entropy data request
   * @param {Object} data - Request data
   * @param {Object} socket - Socket.IO socket
   * @returns {Promise<void>}
   */
  async handleAntiEntropyRequest(data, socket) {
    return this.syncProcessor.handleAntiEntropyRequest(data, socket);
  }

  /**
   * Handle incoming anti-entropy response
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async handleAntiEntropyResponse(data) {
    return this.syncProcessor.handleAntiEntropyResponse(data);
  }

  /**
   * Handle vector clock synchronization message
   * @param {Object} data - Sync message data
   * @param {Object} socket - Socket.IO socket
   * @returns {Promise<void>}
   */
  async handleVectorClockSync(data, socket) {
    return this.vectorClockSync.handleVectorClockSync(data, socket);
  }

  /**
   * Handle response to vector clock synchronization
   * @param {Object} data - Response data
   * @returns {Promise<void>}
   */
  async handleVectorClockSyncResponse(data) {
    return this.vectorClockSync.handleVectorClockSyncResponse(data);
  }
}

module.exports = AntiEntropy;
