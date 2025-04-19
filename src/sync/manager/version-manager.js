/**
 * VersionManager - Manages version history for data paths
 */

const VectorClock = require("../vector-clock");

class VersionManager {
  /**
   * Create a new VersionManager
   * @param {Object} syncManager - Parent SyncManager instance
   */
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.versionHistory = new Map();
  }

  /**
   * Add data to version history without timestamp dependencies
   * @param {string} path - Data path
   * @param {Object} data - Data to add to history
   */
  addToVersionHistory(path, data) {
    if (this.syncManager.isShuttingDown) return;

    if (!this.versionHistory.has(path)) {
      this.versionHistory.set(path, []);
    }

    const history = this.versionHistory.get(path);

    // Add to history
    history.push({
      vectorClock: data.vectorClock,
      value: data.value,
      origin: data.origin,
    });

    // Sort by vector clock dominance (rather than timestamp)
    // This is a more complex sort - we compare each pair of vector clocks
    history.sort((a, b) => {
      const clockA =
        a.vectorClock instanceof VectorClock
          ? a.vectorClock
          : VectorClock.fromJSON(a.vectorClock);
      const clockB =
        b.vectorClock instanceof VectorClock
          ? b.vectorClock
          : VectorClock.fromJSON(b.vectorClock);

      const relation = clockA.dominanceRelation(clockB);

      if (relation === "dominates") return -1; // a should come first
      if (relation === "dominated") return 1; // b should come first

      // For concurrent or identical, use origin as tiebreaker
      return (a.origin || "").localeCompare(b.origin || "");
    });

    // Limit history size
    if (history.length > this.syncManager.maxVersions) {
      this.versionHistory.set(
        path,
        history.slice(0, this.syncManager.maxVersions)
      );
    }
  }

  /**
   * Get version history for a path
   * @param {string} path - Data path
   * @returns {Array} - Version history
   */
  getVersionHistory(path) {
    return this.versionHistory.get(path) || [];
  }

  /**
   * Clear version history for a path
   * @param {string} path - Data path
   */
  clearVersionHistory(path) {
    this.versionHistory.delete(path);
  }

  /**
   * Get all paths with version history
   * @returns {Array<string>} - Paths with version history
   */
  getPathsWithHistory() {
    return Array.from(this.versionHistory.keys());
  }
}

module.exports = VersionManager;
