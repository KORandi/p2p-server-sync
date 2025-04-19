/**
 * DeletionHandler - Handles resolution of deletion conflicts
 */

class DeletionHandler {
  /**
   * Create a new DeletionHandler
   * @param {Object} conflictResolver - Parent ConflictResolver instance
   */
  constructor(conflictResolver) {
    this.conflictResolver = conflictResolver;
  }

  /**
   * Handle conflict resolution when at least one side has a deletion
   * @param {string} path - The data path
   * @param {Object} localData - Local data with value, vectorClock
   * @param {Object} remoteData - Remote data with value, vectorClock
   * @returns {Object} Resolved data
   */
  resolveWithDeletion(path, localData, remoteData) {
    // If both are deletions, use vector clock to decide
    if (localData.value === null && remoteData.value === null) {
      return this.conflictResolver.resolutionStrategies.vectorDominance(
        localData,
        remoteData
      );
    }

    // Convert to VectorClock instances
    const localClock = this.conflictResolver.toVectorClock(
      localData.vectorClock
    );
    const remoteClock = this.conflictResolver.toVectorClock(
      remoteData.vectorClock
    );

    // Get the relationship between the clocks
    const relation = localClock.dominanceRelation(remoteClock);

    // For deletion conflicts, we'll use vector clock dominance
    if (localData.value === null) {
      // Local is a deletion
      if (relation === "dominates" || relation === "concurrent") {
        console.log(
          `Deletion wins for ${path} (local deletion dominates or concurrent)`
        );
        return localData;
      } else {
        console.log(
          `Remote update wins over deletion for ${path} (remote dominates)`
        );
        return remoteData;
      }
    } else {
      // Remote is a deletion
      if (relation === "dominated" || relation === "concurrent") {
        console.log(
          `Deletion wins for ${path} (remote deletion dominates or concurrent)`
        );
        return remoteData;
      } else {
        console.log(
          `Local update wins over deletion for ${path} (local dominates)`
        );
        return localData;
      }
    }
  }
}

module.exports = DeletionHandler;
