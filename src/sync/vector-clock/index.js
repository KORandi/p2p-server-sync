/**
 * VectorClock - Tracks causality between events in distributed systems
 * Enables tracking of "happened-before" relationships and conflict detection
 */

const ClockOperations = require("./clock-operations");
const ClockComparison = require("./clock-comparison");
const ClockSerializer = require("./clock-serializer");

class VectorClock {
  /**
   * Create a new VectorClock
   * @param {Object} clockData - Initial clock values
   */
  constructor(clockData = {}) {
    this.clock = {};

    // Initialize with clean data
    if (clockData && typeof clockData === "object") {
      Object.entries(clockData).forEach(([key, value]) => {
        if (typeof value === "number" && !isNaN(value) && value >= 0) {
          this.clock[key] = value;
        } else if (value !== undefined) {
          // If value is defined but invalid, log a warning
          console.warn(
            `Invalid vector clock value for ${key}: ${value}, using 0 instead`
          );
          this.clock[key] = 0;
        }
      });
    }

    // Initialize component handlers
    this.operations = new ClockOperations(this);
    this.comparison = new ClockComparison(this);
    this.serializer = new ClockSerializer(this);
  }

  /**
   * Increment the counter for a specific node
   * @param {string} nodeId - ID of the node
   * @returns {VectorClock} - This vector clock (for chaining)
   */
  increment(nodeId) {
    return this.operations.increment(nodeId);
  }

  /**
   * Create a copy of this vector clock
   * @returns {VectorClock} - New vector clock with same values
   */
  clone() {
    return this.operations.clone();
  }

  /**
   * Merge this vector clock with another
   * Takes the maximum value for each node ID
   * @param {VectorClock|Object} otherClock - Clock to merge with
   * @returns {VectorClock} - New merged vector clock
   */
  merge(otherClock) {
    return this.operations.merge(otherClock);
  }

  /**
   * Compare two vector clocks to determine their relationship
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @returns {number} Comparison result:
   *  -1: this clock is causally BEFORE other clock
   *   0: this clock is CONCURRENT with other clock
   *   1: this clock is causally AFTER other clock
   *   2: this clock is IDENTICAL to other clock
   */
  compare(otherClock) {
    return this.comparison.compare(otherClock);
  }

  /**
   * Check if this clock is causally before another
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @returns {boolean} True if this clock is before the other
   */
  isBefore(otherClock) {
    return this.comparison.isBefore(otherClock);
  }

  /**
   * Check if this clock is causally after another
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @returns {boolean} True if this clock is after the other
   */
  isAfter(otherClock) {
    return this.comparison.isAfter(otherClock);
  }

  /**
   * Check if this clock is concurrent with another (conflict)
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @returns {boolean} True if this clock is concurrent with the other
   */
  isConcurrent(otherClock) {
    return this.comparison.isConcurrent(otherClock);
  }

  /**
   * Check if this clock is identical to another
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @returns {boolean} True if this clock is identical to the other
   */
  isIdentical(otherClock) {
    return this.comparison.isIdentical(otherClock);
  }

  /**
   * Convert to JSON-serializable object
   * @returns {Object} Clock as plain object
   */
  toJSON() {
    return this.serializer.toJSON();
  }

  /**
   * Create from JSON object
   * @param {Object} json - Clock data as plain object
   * @returns {VectorClock} New vector clock instance
   */
  static fromJSON(json) {
    return new VectorClock(json);
  }

  /**
   * Get a string representation of the vector clock
   * Useful for debugging
   * @returns {string} String representation
   */
  toString() {
    return this.serializer.toString();
  }

  /**
   * Compare vector clocks to see if one dominates the other
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @returns {string} Relationship: 'dominates', 'dominated', 'concurrent', or 'identical'
   */
  dominanceRelation(otherClock) {
    return this.comparison.dominanceRelation(otherClock);
  }

  /**
   * Get a deterministic winner between concurrent vector clocks
   * @param {VectorClock|Object} otherClock - Clock to compare with
   * @param {string} thisId - This node's identifier
   * @param {string} otherId - Other node's identifier
   * @returns {string} Winner: 'this', 'other', or 'identical'
   */
  deterministicWinner(otherClock, thisId, otherId) {
    return this.comparison.deterministicWinner(otherClock, thisId, otherId);
  }

  /**
   * Compute a hash-based value that is consistent across the network
   * (Alternative tiebreaker method for concurrent updates)
   * @returns {number} Hash code
   */
  hashCode() {
    return this.serializer.hashCode();
  }
}

module.exports = VectorClock;
