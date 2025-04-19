/**
 * StrategyManager - Manages selection of conflict resolution strategies
 */

class StrategyManager {
  /**
   * Create a new StrategyManager
   * @param {Object} conflictResolver - Parent ConflictResolver instance
   */
  constructor(conflictResolver) {
    this.conflictResolver = conflictResolver;
  }

  /**
   * Get the appropriate strategy for a path
   * @param {string} path - Data path
   * @returns {string} Resolution strategy
   */
  getStrategyForPath(path) {
    // Check for exact match
    if (this.conflictResolver.pathStrategies[path]) {
      return this.conflictResolver.pathStrategies[path];
    }

    // Check for prefix match by checking each segment
    const pathParts = path.split("/");
    let longestMatch = null;
    let longestMatchLength = 0;

    // Try increasingly specific paths and find the longest match
    for (let i = pathParts.length; i > 0; i--) {
      const partialPath = pathParts.slice(0, i).join("/");
      if (this.conflictResolver.pathStrategies[partialPath]) {
        // Found a match, check if it's longer than our current longest match
        if (partialPath.length > longestMatchLength) {
          longestMatch = partialPath;
          longestMatchLength = partialPath.length;
        }
      }
    }

    // If we found a match, return its strategy
    if (longestMatch) {
      return this.conflictResolver.pathStrategies[longestMatch];
    }

    // Try prefix matches (legacy method)
    let bestMatch = null;
    let bestMatchLength = 0;

    for (const prefix in this.conflictResolver.pathStrategies) {
      if (path.startsWith(prefix + "/") || path === prefix) {
        // Found a match, check if it's longer than our current best match
        if (prefix.length > bestMatchLength) {
          bestMatch = prefix;
          bestMatchLength = prefix.length;
        }
      }
    }

    // If we found a match, return its strategy
    if (bestMatch) {
      return this.conflictResolver.pathStrategies[bestMatch];
    }

    // Return default strategy
    return this.conflictResolver.defaultStrategy;
  }

  /**
   * Get a custom resolver for a path
   * @param {string} path - Data path
   * @returns {Function|null} Resolver function
   */
  getCustomResolverForPath(path) {
    // Check for exact match
    if (this.conflictResolver.customResolvers[path]) {
      return this.conflictResolver.customResolvers[path];
    }

    // Check for prefix match by checking each segment
    const pathParts = path.split("/");
    let longestMatch = null;
    let longestMatchLength = 0;

    // Try increasingly specific paths and find the longest match
    for (let i = pathParts.length; i > 0; i--) {
      const partialPath = pathParts.slice(0, i).join("/");
      if (this.conflictResolver.customResolvers[partialPath]) {
        // Found a match, check if it's longer than our current longest match
        if (partialPath.length > longestMatchLength) {
          longestMatch = partialPath;
          longestMatchLength = partialPath.length;
        }
      }
    }

    // If we found a match, return its resolver
    if (longestMatch) {
      return this.conflictResolver.customResolvers[longestMatch];
    }

    // Try prefix matches (legacy method)
    let bestMatch = null;
    let bestMatchLength = 0;

    for (const prefix in this.conflictResolver.customResolvers) {
      if (path.startsWith(prefix + "/") || path === prefix) {
        // Found a match, check if it's longer than our current best match
        if (prefix.length > bestMatchLength) {
          bestMatch = prefix;
          bestMatchLength = prefix.length;
        }
      }
    }

    // If we found a match, return its resolver
    if (bestMatch) {
      return this.conflictResolver.customResolvers[bestMatch];
    }

    // No custom resolver found
    return null;
  }
}

module.exports = StrategyManager;
