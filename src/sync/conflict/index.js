/**
 * ConflictResolver - Handles resolution of concurrent updates
 * Implements various strategies for resolving conflicts between updates
 */

const VectorClock = require("../vector-clock");
const StrategyManager = require("./strategy-manager");
const ResolutionStrategies = require("./resolution-strategies");
const DeletionHandler = require("./deletion-handler");

class ConflictResolver {
  /**
   * Create a new ConflictResolver
   * @param {Object} options - Conflict resolution options
   * @param {string} [options.defaultStrategy="vector-dominance"] - Default resolution strategy
   * @param {Object} [options.pathStrategies={}] - Map of paths to strategies
   * @param {Object} [options.customResolvers={}] - Map of paths to custom resolver functions
   */
  constructor(options = {}) {
    // Default resolution strategy
    this.defaultStrategy = options.defaultStrategy || "vector-dominance";

    // Map of path prefixes to resolution strategies
    this.pathStrategies = options.pathStrategies || {};

    // Map of custom resolver functions
    this.customResolvers = options.customResolvers || {};

    // Initialize component managers
    this.strategyManager = new StrategyManager(this);
    this.resolutionStrategies = new ResolutionStrategies(this);
    this.deletionHandler = new DeletionHandler(this);
  }

  /**
   * Resolve a conflict between two versions
   * @param {string} path - The data path
   * @param {Object} localData - Local data with value, vectorClock
   * @param {Object} remoteData - Remote data with value, vectorClock
   * @returns {Object} Resolved data
   */
  resolve(path, localData, remoteData) {
    // If either value is null (deleted), handle specially
    if (localData.value === null || remoteData.value === null) {
      return this.deletionHandler.resolveWithDeletion(
        path,
        localData,
        remoteData
      );
    }

    // Find the appropriate strategy for this path
    const strategy = this.strategyManager.getStrategyForPath(path);

    // Apply the selected strategy
    switch (strategy) {
      case "vector-dominance":
      case "last-write-wins": // Map legacy strategy to vector-dominance
        return this.resolutionStrategies.vectorDominance(localData, remoteData);

      case "first-write-wins":
        return this.resolutionStrategies.firstWriteWins(localData, remoteData);

      case "merge-fields":
        return this.resolutionStrategies.mergeFields(
          path,
          localData,
          remoteData
        );

      case "custom":
        return this.resolutionStrategies.applyCustomResolver(
          path,
          localData,
          remoteData
        );

      default:
        // Fallback to vector dominance
        console.log(
          `Unknown strategy "${strategy}", falling back to vector-dominance`
        );
        return this.resolutionStrategies.vectorDominance(localData, remoteData);
    }
  }

  /**
   * Helper to convert any vector clock representation to a VectorClock instance
   * @param {Object|VectorClock} clockData - Vector clock data
   * @returns {VectorClock} Vector clock instance
   */
  toVectorClock(clockData) {
    if (clockData instanceof VectorClock) {
      return clockData;
    }
    return new VectorClock(clockData || {});
  }

  /**
   * Get the appropriate strategy for a path
   * @param {string} path - Data path
   * @returns {string} Resolution strategy
   */
  getStrategyForPath(path) {
    return this.strategyManager.getStrategyForPath(path);
  }

  /**
   * Register a custom resolver for a path or prefix
   * @param {string} pathPrefix - Path prefix
   * @param {Function} resolverFn - Resolver function
   */
  registerCustomResolver(pathPrefix, resolverFn) {
    this.customResolvers[pathPrefix] = resolverFn;
    this.pathStrategies[pathPrefix] = "custom";
  }

  /**
   * Set a resolution strategy for a path or prefix
   * @param {string} pathPrefix - Path prefix
   * @param {string} strategy - Strategy name
   */
  setStrategy(pathPrefix, strategy) {
    this.pathStrategies[pathPrefix] = strategy;
  }
}

module.exports = ConflictResolver;
