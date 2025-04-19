/**
 * ClockComparison - Handles comparison operations between vector clocks
 */

class ClockComparison {
  /**
   * Create a new ClockComparison
   * @param {Object} vectorClock - Parent VectorClock instance
   */
  constructor(vectorClock) {
    this.vectorClock = vectorClock;
  }

  /**
   * Compare two vector clocks to determine their relationship
   * @param {Object} otherClock - Clock to compare with
   * @returns {number} Comparison result:
   *  -1: this clock is causally BEFORE other clock
   *   0: this clock is CONCURRENT with other clock
   *   1: this clock is causally AFTER other clock
   *   2: this clock is IDENTICAL to other clock
   */
  compare(otherClock) {
    // Handle different input types
    let otherClockObj;

    if (otherClock instanceof this.vectorClock.constructor) {
      otherClockObj = otherClock.clock;
    } else if (otherClock && typeof otherClock === "object") {
      otherClockObj = otherClock;
    } else {
      console.warn("Invalid vector clock passed to compare:", otherClock);
      return 0; // Default to concurrent for invalid input
    }

    // Get all unique node IDs from both clocks
    const allNodeIds = new Set([
      ...Object.keys(this.vectorClock.clock),
      ...Object.keys(otherClockObj),
    ]);

    let lessThan = false;
    let greaterThan = false;
    let identical = true;

    // Compare each node ID's counter
    for (const nodeId of allNodeIds) {
      const selfValue = this.vectorClock.clock[nodeId] || 0;
      const otherValue =
        typeof otherClockObj[nodeId] === "number" &&
        !isNaN(otherClockObj[nodeId])
          ? otherClockObj[nodeId]
          : 0;

      if (selfValue < otherValue) {
        lessThan = true;
        identical = false;
      } else if (selfValue > otherValue) {
        greaterThan = true;
        identical = false;
      }

      // Early exit if we've determined it's concurrent
      if (lessThan && greaterThan) {
        return 0; // CONCURRENT
      }
    }

    if (identical) {
      return 2; // IDENTICAL
    } else if (lessThan && !greaterThan) {
      return -1; // BEFORE
    } else if (greaterThan && !lessThan) {
      return 1; // AFTER
    } else {
      return 0; // CONCURRENT
    }
  }

  /**
   * Compare vector clocks to see if one dominates the other
   * @param {Object} otherClock - Clock to compare with
   * @returns {string} Relationship: 'dominates', 'dominated', 'concurrent', or 'identical'
   */
  dominanceRelation(otherClock) {
    const comparison = this.compare(otherClock);

    switch (comparison) {
      case 1:
        return "dominates"; // this > other
      case -1:
        return "dominated"; // this < other
      case 0:
        return "concurrent"; // this || other (concurrent)
      case 2:
        return "identical"; // this == other
      default:
        return "unknown";
    }
  }

  /**
   * Get a deterministic winner between concurrent vector clocks
   * @param {Object} otherClock - Clock to compare with
   * @param {string} thisId - This node's identifier
   * @param {string} otherId - Other node's identifier
   * @returns {string} Winner: 'this', 'other', or 'identical'
   */
  deterministicWinner(otherClock, thisId, otherId) {
    const relation = this.dominanceRelation(otherClock);

    if (relation === "dominates") return "this";
    if (relation === "dominated") return "other";
    if (relation === "identical") return "identical";

    // If concurrent, use a deterministic tiebreaker (e.g., comparing node IDs)
    return thisId.localeCompare(otherId) > 0 ? "this" : "other";
  }
}

module.exports = ClockComparison;
