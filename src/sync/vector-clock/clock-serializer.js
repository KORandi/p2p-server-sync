/**
 * ClockSerializer - Handles serialization and string representation
 */

class ClockSerializer {
  /**
   * Create a new ClockSerializer
   * @param {Object} vectorClock - Parent VectorClock instance
   */
  constructor(vectorClock) {
    this.vectorClock = vectorClock;
  }

  /**
   * Convert to JSON-serializable object
   * @returns {Object} Clock as plain object
   */
  toJSON() {
    return { ...this.vectorClock.clock };
  }

  /**
   * Get a string representation of the vector clock
   * Useful for debugging
   * @returns {string} String representation
   */
  toString() {
    const entries = Object.entries(this.vectorClock.clock)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key.substring(0, 8)}:${value}`)
      .join(", ");

    return `[${entries}]`;
  }
}

module.exports = ClockSerializer;
