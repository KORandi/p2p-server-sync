/**
 * ServerUtils - Utility methods for the P2P Server
 */

class ServerUtils {
  /**
   * Create a new ServerUtils instance
   * @param {Object} server - P2PServer instance
   */
  constructor(server) {
    this.server = server;
  }

  /**
   * Generate a unique ID for use in messages or sessions
   * @returns {string} Unique ID
   */
  generateId() {
    return require("crypto").randomBytes(16).toString("hex");
  }

  /**
   * Create a health check endpoint
   * @param {string} path - Path for the health check endpoint
   * @returns {void}
   */
  setupHealthCheck(path = "/health") {
    this.server.app.get(path, (req, res) => {
      const status = {
        status: "ok",
        serverID: this.server.serverID,
        uptime: process.uptime(),
        connections: this.server.getConnectionStats(),
        securityEnabled: this.server.securityEnabled,
      };

      res.json(status);
    });

    console.log(`Health check endpoint available at ${path}`);
  }
}

module.exports = ServerUtils;
