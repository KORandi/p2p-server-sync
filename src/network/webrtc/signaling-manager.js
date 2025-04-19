/**
 * SignalingManager - Manages connection to signaling server for WebRTC NAT traversal
 */

const SignalingClient = require("../signaling-client");

class SignalingManager {
  /**
   * Create a new SignalingManager
   * @param {Object} webrtcManager - Parent WebRTCNATManager reference
   * @param {string} signalingServer - Signaling server URL
   */
  constructor(webrtcManager, signalingServer) {
    this.webrtcManager = webrtcManager;
    this.signalingServer = signalingServer;
    this.signalingClient = null;
  }

  /**
   * Connect to the signaling server
   */
  connect() {
    if (!this.signalingServer) {
      console.warn(
        "No signaling server specified, WebRTC NAT traversal will be limited"
      );
      return;
    }

    // Create signaling client
    this.signalingClient = new SignalingClient(
      { server: this.signalingServer },
      this.webrtcManager.server.serverID,
      () => this.webrtcManager.onSignalingConnected(),
      (peerId) => this.webrtcManager.onPeerDiscovered(peerId),
      (peerId, signal, type) =>
        this.webrtcManager.onSignalReceived(peerId, signal, type)
    );

    // Connect to signaling server
    this.signalingClient.connect();
  }

  /**
   * Send a WebRTC signal through the signaling server
   * @param {string} targetPeerId - Peer to send signal to
   * @param {Object} signal - WebRTC signal data
   * @param {string} type - Signal type (offer, answer, candidate)
   */
  sendSignal(targetPeerId, signal, type = "signal") {
    if (
      !this.signalingClient ||
      !this.signalingClient.socket ||
      !this.signalingClient.socket.connected
    ) {
      console.warn("Not connected to signaling server, cannot send signal");
      return;
    }

    this.signalingClient.sendSignal(targetPeerId, signal, type);
  }

  /**
   * Request a connection to a peer through the signaling server
   * @param {string} targetPeerId - Peer to connect to
   */
  requestConnection(targetPeerId) {
    if (
      !this.signalingClient ||
      !this.signalingClient.socket ||
      !this.signalingClient.socket.connected
    ) {
      console.warn(
        "Not connected to signaling server, cannot request connection"
      );
      return;
    }

    console.log(`Requesting connection to peer ${targetPeerId}`);
    this.signalingClient.requestConnection(targetPeerId);
  }

  /**
   * Check if connected to signaling server
   * @returns {boolean} Whether connected to signaling server
   */
  isConnected() {
    return !!(
      this.signalingClient &&
      this.signalingClient.socket &&
      this.signalingClient.socket.connected
    );
  }

  /**
   * Close the connection to the signaling server
   */
  close() {
    if (this.signalingClient) {
      this.signalingClient.close();
      this.signalingClient = null;
    }

    console.log("Closed connection to signaling server");
  }
}

module.exports = SignalingManager;
