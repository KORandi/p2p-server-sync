/**
 * ServerInit - Manages server initialization and shutdown
 */

class ServerInit {
  /**
   * Create a new ServerInit instance
   * @param {Object} server - P2PServer instance
   */
  constructor(server) {
    this.server = server;
  }

  /**
   * Start the server and connect to peers
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve) => {
      // Initialize socket connections
      this.server.network.socketManager.init(this.server.server);

      // Initialize WebRTC if enabled
      if (this.server.webrtcEnabled && this.server.webrtcManager) {
        this.server.webrtcManager.init();
      }

      // Connect to peers via websocket
      this.server.network.socketManager.connectToPeers(this.server.peers);

      // Start HTTP server
      this.server.server.listen(this.server.port, () => {
        console.log(
          `P2P Server started on port ${this.server.port} with ID: ${this.server.serverID}`
        );
        console.log(`Database path: ${this.server.dbPath}`);
        console.log(`Known peers: ${this.server.peers.join(", ") || "none"}`);
        console.log(`WebRTC enabled: ${this.server.webrtcEnabled}`);
        console.log(`Security enabled: ${this.server.securityEnabled}`);
        resolve();
      });
    });
  }

  /**
   * Close server and database connections
   * @returns {Promise<void>}
   */
  close() {
    return new Promise(async (resolve, reject) => {
      try {
        // Stop sync manager first
        if (this.server.syncManager) {
          this.server.syncManager.prepareForShutdown();
          console.log(`Server ${this.server.serverID} stopped sync manager`);
        }

        // Close socket and WebRTC connections
        if (this.server.socketManager) {
          this.server.socketManager.closeAllConnections();
          console.log(
            `Server ${this.server.serverID} closed socket connections`
          );
        }

        // Close WebRTC separately if necessary
        if (this.server.webrtcEnabled && this.server.webrtcManager) {
          this.server.webrtcManager.closeAllConnections();
          console.log(
            `Server ${this.server.serverID} closed WebRTC connections`
          );
        }

        // Small delay for sockets to disconnect
        await new Promise((r) => setTimeout(r, 500));

        // Close HTTP server
        this.server.server.close(async () => {
          try {
            // Finally close the database
            await this.server.db.close();
            console.log(`Server ${this.server.serverID} database closed`);
            resolve();
          } catch (dbErr) {
            reject(dbErr);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = ServerInit;
