/**
 * BroadcastManager - Handles broadcasting messages to peers
 */

class BroadcastManager {
  /**
   * Create a new BroadcastManager
   * @param {Object} socketManager - SocketManager reference
   */
  constructor(socketManager) {
    this.socketManager = socketManager;
  }

  /**
   * Broadcast a message to all connected peers
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {number} - Number of peers message was sent to
   */
  broadcast(event, data) {
    // Get all connected peers, filter out ourselves
    const idPeers = Object.keys(this.socketManager.sockets).filter(
      (id) => id !== this.socketManager.server.serverID
    );
    const urlPeers = Object.keys(this.socketManager.socketsByUrl);
    const webrtcPeers = Object.keys(this.socketManager.webrtcPeers);

    // Process data before sending
    const dataToSend = this._prepareDataForBroadcast(data);

    // Track which peers we've sent to
    const sentToPeers = new Set();
    let peerCount = 0;

    // First, try WebRTC connections if enabled
    if (
      this.socketManager.webrtcEnabled &&
      this.socketManager.server.webrtcManager
    ) {
      peerCount += this._broadcastViaWebRTC(
        event,
        dataToSend,
        webrtcPeers,
        sentToPeers
      );
    }

    // Then, send by peer ID (these are confirmed peers)
    peerCount += this._broadcastByPeerId(
      event,
      dataToSend,
      idPeers,
      sentToPeers
    );

    // Then send by URL for any remaining peers
    peerCount += this._broadcastByUrl(event, dataToSend, urlPeers, sentToPeers);

    console.log(
      `Broadcasting ${event} for ${
        data.path || "general message"
      } to ${peerCount} peers (${sentToPeers.size} unique)${
        this.socketManager.server.securityEnabled ? " [ENCRYPTED]" : ""
      }`
    );

    return peerCount;
  }

  /**
   * Prepare data for broadcasting
   * @private
   * @param {Object} data - Original data
   * @returns {Object} - Processed data
   */
  _prepareDataForBroadcast(data) {
    // Process data before sending
    let dataToSend = { ...data };

    // Initialize forwarded flag if it doesn't exist
    if (!("forwarded" in dataToSend)) {
      dataToSend.forwarded = false;
    }

    // Initialize or preserve hop count
    if (!("hopCount" in dataToSend)) {
      dataToSend.hopCount = 0;
    }

    // Always include our latest vector clock in outgoing messages
    if (this.socketManager.server.syncManager) {
      dataToSend.vectorClock =
        this.socketManager.server.syncManager.getVectorClock();
    }

    // Encrypt the data if security is enabled
    let encryptedData = dataToSend;
    if (
      this.socketManager.server.securityEnabled &&
      this.socketManager.server.securityManager
    ) {
      try {
        encryptedData = this.socketManager.server.encryptData(dataToSend);
      } catch (error) {
        console.error(`Error encrypting ${event} message:`, error);
        // Continue with unencrypted data if encryption fails
      }
    }

    return encryptedData;
  }

  /**
   * Broadcast via WebRTC connections
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   * @param {Array<string>} peers - WebRTC peer IDs
   * @param {Set<string>} sentToPeers - Set to track sent peers
   * @returns {number} - Number of successful sends
   */
  _broadcastViaWebRTC(event, data, peers, sentToPeers) {
    let count = 0;

    for (const peerId of peers) {
      // Skip ourselves
      if (peerId === this.socketManager.server.serverID) continue;

      // Skip if already sent
      if (sentToPeers.has(peerId)) continue;

      // Send via WebRTC
      if (
        this.socketManager.server.webrtcManager.sendToPeer(peerId, event, data)
      ) {
        sentToPeers.add(peerId);
        count++;
      }
    }

    return count;
  }

  /**
   * Broadcast by peer ID
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   * @param {Array<string>} peers - Peer IDs
   * @param {Set<string>} sentToPeers - Set to track sent peers
   * @returns {number} - Number of successful sends
   */
  _broadcastByPeerId(event, data, peers, sentToPeers) {
    let count = 0;

    for (const peerId of peers) {
      // Skip ourselves
      if (peerId === this.socketManager.server.serverID) continue;

      // Skip if already sent
      if (sentToPeers.has(peerId)) continue;

      // Get the socket
      const socket = this.socketManager.sockets[peerId];
      if (socket && socket.connected) {
        socket.emit(event, data);
        sentToPeers.add(peerId);
        count++;
      }
    }

    return count;
  }

  /**
   * Broadcast by URL
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   * @param {Array<string>} urls - Peer URLs
   * @param {Set<string>} sentToPeers - Set to track sent peers
   * @returns {number} - Number of successful sends
   */
  _broadcastByUrl(event, data, urls, sentToPeers) {
    let count = 0;

    for (const url of urls) {
      // Get the peer ID if known
      const peerId = this.socketManager.urlToPeerId[url];

      // Skip if we already sent to this peer by ID or WebRTC
      if (peerId && sentToPeers.has(peerId)) continue;

      // Get the socket
      const socket = this.socketManager.socketsByUrl[url];
      if (socket && socket.connected) {
        socket.emit(event, data);
        if (peerId) sentToPeers.add(peerId);
        count++;
      }
    }

    return count;
  }
}

module.exports = BroadcastManager;
