/**
 * ClockOperations - Handles operations like increment, clone, and merge
 */

class ClockOperations {
  /**
   * Create a new ClockOperations
   * @param {Object} vectorClock - Parent VectorClock instance
   */
  constructor(vectorClock) {
    this.vectorClock = vectorClock;
  }

  /**
   * Increment the counter for a specific node
   * @param {string} nodeId - ID of the node
   * @returns {Object} - Parent vector clock (for chaining)
   */
  increment(nodeId) {
    if (!nodeId || typeof nodeId !== "string") {
      console.warn("Invalid nodeId passed to increment:", nodeId);
      return this.vectorClock;
    }

    this.vectorClock.clock[nodeId] = (this.vectorClock.clock[nodeId] || 0) + 1;
    return this.vectorClock;
  }

  /**
   * Create a copy of this vector clock
   * @returns {Object} - New vector clock with same values
   */
  clone() {
    return new this.vectorClock.constructor({ ...this.vectorClock.clock });
  }

  /**
   * Merge this vector clock with another
   * Takes the maximum value for each node ID
   * @param {Object|Object} otherClock - Clock to merge with
   * @returns {Object} - New merged vector clock
   */
  merge(otherClock) {
    // Handle different input types
    let otherClockObj;

    if (otherClock instanceof this.vectorClock.constructor) {
      otherClockObj = otherClock.clock;
    } else if (otherClock && typeof otherClock === "object") {
      otherClockObj = otherClock;
    } else {
      console.warn("Invalid vector clock passed to merge:", otherClock);
      return this.clone();
    }

    // Create a new VectorClock for the result
    const result = new this.vectorClock.constructor();

    // Get all unique node IDs from both clocks
    const allNodeIds = new Set([
      ...Object.keys(this.vectorClock.clock),
      ...Object.keys(otherClockObj),
    ]);

    // For each node ID, take the maximum value
    for (const nodeId of allNodeIds) {
      const selfValue = this.vectorClock.clock[nodeId] || 0;
      const otherValue =
        typeof otherClockObj[nodeId] === "number" &&
        !isNaN(otherClockObj[nodeId])
          ? otherClockObj[nodeId]
          : 0;

      result.clock[nodeId] = Math.max(selfValue, otherValue);
    }

    return result;
  }
}

module.exports = ClockOperations;
