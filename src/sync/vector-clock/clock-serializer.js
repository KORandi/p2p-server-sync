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

  /**
   * Compute a hash-based value that is consistent across the network
   * (Alternative tiebreaker method for concurrent updates)
   * @returns {number} Hash code
   */
  hashCode() {
    // Sort entries for deterministic ordering
    const entries = Object.entries(this.vectorClock.clock).sort(
      ([keyA], [keyB]) => keyA.localeCompare(keyB)
    );

    // Create a string representation
    const str = entries.map(([key, value]) => `${key}:${value}`).join(",");

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

module.exports = ClockSerializer;
