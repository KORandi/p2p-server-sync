/**
 * ResolutionStrategies - Implements conflict resolution strategies
 */

class ResolutionStrategies {
  /**
   * Create a new ResolutionStrategies
   * @param {Object} conflictResolver - Parent ConflictResolver instance
   */
  constructor(conflictResolver) {
    this.conflictResolver = conflictResolver;
  }

  /**
   * Vector dominance strategy - uses vector clocks to determine the winner
   * @param {Object} localData - Local data with value, vectorClock
   * @param {Object} remoteData - Remote data with value, vectorClock
   * @returns {Object} Resolved data
   */
  vectorDominance(localData, remoteData) {
    // Convert to VectorClock instances
    const localClock = this.conflictResolver.toVectorClock(
      localData.vectorClock
    );
    const remoteClock = this.conflictResolver.toVectorClock(
      remoteData.vectorClock
    );

    // Get the relationship between the clocks
    const relation = localClock.dominanceRelation(remoteClock);

    if (relation === "dominates" || relation === "identical") {
      return localData;
    } else if (relation === "dominated") {
      return remoteData;
    } else {
      // Concurrent changes, use deterministic tiebreaker
      const winner = localClock.deterministicWinner(
        remoteClock,
        localData.origin || "",
        remoteData.origin || ""
      );

      return winner === "this" ? localData : remoteData;
    }
  }

  /**
   * First-write-wins strategy - uses the same logic but prefers "dominated" vector clocks
   * @param {Object} localData - Local data with value, vectorClock
   * @param {Object} remoteData - Remote data with value, vectorClock
   * @returns {Object} Resolved data
   */
  firstWriteWins(localData, remoteData) {
    // Convert to VectorClock instances
    const localClock = this.conflictResolver.toVectorClock(
      localData.vectorClock
    );
    const remoteClock = this.conflictResolver.toVectorClock(
      remoteData.vectorClock
    );

    // Get the relationship between the clocks
    const relation = localClock.dominanceRelation(remoteClock);

    // For first-write-wins, we prefer the "dominated" vector clock
    // which represents the earlier write in causal history
    if (relation === "dominated" || relation === "identical") {
      return localData;
    } else if (relation === "dominates") {
      return remoteData;
    } else {
      // Concurrent changes, use deterministic tiebreaker
      // For first-write, we'll reverse the winner to prefer "smaller" clocks
      const winner = localClock.deterministicWinner(
        remoteClock,
        localData.origin || "",
        remoteData.origin || ""
      );

      return winner === "this" ? remoteData : localData;
    }
  }

  /**
   * Merge fields from both objects - improved implementation
   * For fields present in both, use vector clock dominance
   * @param {string} path - The data path
   * @param {Object} localData - Local data with value, vectorClock
   * @param {Object} remoteData - Remote data with value, vectorClock
   * @returns {Object} Resolved data
   */
  mergeFields(path, localData, remoteData) {
    console.log(`Merging fields for ${path}`);

    // Ensure we're dealing with objects
    if (
      typeof localData.value !== "object" ||
      typeof remoteData.value !== "object" ||
      localData.value === null ||
      remoteData.value === null ||
      Array.isArray(localData.value) ||
      Array.isArray(remoteData.value)
    ) {
      // If not objects, fall back to vector dominance
      console.log(
        `Cannot merge non-object values, falling back to vector-dominance`
      );
      return this.vectorDominance(localData, remoteData);
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
    console.log(`Vector clock relation for ${path}: ${relation}`);

    // Merge the vector clocks
    const mergedClock = localClock.merge(remoteClock);

    // Create a new result object with merged vector clock
    const result = {
      value: {},
      vectorClock: mergedClock.toJSON(),
      origin: localData.origin, // Keep local origin for consistency
    };

    // Get all fields from both objects
    const allFields = new Set([
      ...Object.keys(localData.value),
      ...Object.keys(remoteData.value),
    ]);

    // For each field, decide which value to use
    for (const field of allFields) {
      const inLocal = field in localData.value;
      const inRemote = field in remoteData.value;

      if (inLocal && !inRemote) {
        // Field only in local, use it
        result.value[field] = localData.value[field];
      } else if (!inLocal && inRemote) {
        // Field only in remote, use it
        result.value[field] = remoteData.value[field];
      } else {
        // Field is in both, use the vector clock relationship to decide
        if (relation === "dominates" || relation === "identical") {
          // Local dominates or identical
          result.value[field] = localData.value[field];
        } else if (relation === "dominated") {
          // Remote dominates
          result.value[field] = remoteData.value[field];
        } else {
          // Concurrent updates
          // Use a deterministic approach based on the node IDs
          if (
            (localData.origin || "").localeCompare(remoteData.origin || "") > 0
          ) {
            result.value[field] = localData.value[field];
          } else {
            result.value[field] = remoteData.value[field];
          }
        }
      }
    }

    return result;
  }

  /**
   * Apply a custom resolver for a specific path
   * @param {string} path - The data path
   * @param {Object} localData - Local data with value, vectorClock
   * @param {Object} remoteData - Remote data with value, vectorClock
   * @returns {Object} Resolved data
   */
  applyCustomResolver(path, localData, remoteData) {
    const resolver =
      this.conflictResolver.strategyManager.getCustomResolverForPath(path);

    if (!resolver) {
      console.warn(
        `No custom resolver found for ${path}, falling back to vector-dominance`
      );
      return this.vectorDominance(localData, remoteData);
    }

    try {
      return resolver(path, localData, remoteData);
    } catch (error) {
      console.error(`Error in custom resolver for ${path}:`, error);
      return this.vectorDominance(localData, remoteData);
    }
  }
}

module.exports = ResolutionStrategies;
