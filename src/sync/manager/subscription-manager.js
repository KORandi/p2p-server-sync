/**
 * SubscriptionManager - Manages data change subscriptions
 */

class SubscriptionManager {
  /**
   * Create a new SubscriptionManager
   * @param {Object} syncManager - Parent SyncManager instance
   */
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.subscriptions = new Map();
  }

  /**
   * Subscribe to changes at a path
   * @param {string} path - Path to subscribe to
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(path, callback) {
    if (this.syncManager.isShuttingDown) {
      throw new Error("Cannot subscribe during shutdown");
    }

    if (!this.subscriptions.has(path)) {
      this.subscriptions.set(path, new Set());
    }

    this.subscriptions.get(path).add(callback);
    console.log(`New subscription added for ${path}`);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(path);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(path);
        }
        console.log(`Subscription removed for ${path}`);
      }
    };
  }

  /**
   * Notify subscribers of changes
   * @param {string} path - Path that changed
   * @param {any} value - New value
   */
  notifySubscribers(path, value) {
    if (this.syncManager.isShuttingDown) {
      console.log(
        `Skipping subscriber notifications during shutdown for ${path}`
      );
      return;
    }

    const pathParts = path.split("/");

    // Check all subscription paths
    this.subscriptions.forEach((subscribers, subscribedPath) => {
      if (this._isPathMatch(path, subscribedPath, pathParts)) {
        console.log(
          `Found ${subscribers.size} subscribers for ${subscribedPath} matching ${path}`
        );

        subscribers.forEach((callback) => {
          try {
            callback(value, path);
          } catch (error) {
            console.error(
              `Error in subscriber callback for ${subscribedPath}:`,
              error
            );
          }
        });
      }
    });
  }

  /**
   * Check if a path matches a subscription
   * @private
   * @param {string} path - Path to check
   * @param {string} subscribedPath - Subscription path
   * @param {Array<string>} pathParts - Split path parts (optimization)
   * @returns {boolean} - Whether paths match
   */
  _isPathMatch(path, subscribedPath, pathParts) {
    // Case 1: Exact match
    if (path === subscribedPath) {
      return true;
    }

    const subscribedParts = subscribedPath.split("/");

    // Case 2: Path is a child of subscription
    if (pathParts.length > subscribedParts.length) {
      let isMatch = true;
      for (let i = 0; i < subscribedParts.length; i++) {
        if (subscribedParts[i] !== pathParts[i]) {
          isMatch = false;
          break;
        }
      }
      return isMatch;
    }

    // Case 3: Subscription is a child of path
    if (subscribedParts.length > pathParts.length) {
      let isMatch = true;
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i] !== subscribedParts[i]) {
          isMatch = false;
          break;
        }
      }
      return isMatch;
    }

    return false;
  }
}

module.exports = SubscriptionManager;
