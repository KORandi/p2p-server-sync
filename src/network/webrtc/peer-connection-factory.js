/**
 * PeerConnectionFactory - Creates and configures WebRTC peer connections
 */

const SimplePeer = require("simple-peer");
const wrtc = require("@roamhq/wrtc");

class PeerConnectionFactory {
  /**
   * Create a new PeerConnectionFactory
   * @param {Object} webrtcManager - Parent WebRTCNATManager reference
   */
  constructor(webrtcManager) {
    this.webrtcManager = webrtcManager;
  }

  /**
   * Check if WebRTC implementation is available
   * @returns {boolean} - Whether WebRTC is available
   */
  isWebRTCAvailable() {
    return !!wrtc;
  }

  /**
   * Create a WebRTC peer connection
   * @param {string} peerId - Remote peer ID
   * @param {boolean} initiator - Whether this peer is the initiator
   * @returns {Object} Peer connection information
   */
  createPeerConnection(peerId, initiator = false) {
    // Check if we already have this connection
    if (this.webrtcManager.connectionManager.connections.has(peerId)) {
      const existing =
        this.webrtcManager.connectionManager.connections.get(peerId);
      if (existing.connected) {
        return existing;
      }

      // Clean up old connection if it exists but isn't connected
      if (existing.peer) {
        try {
          existing.peer.destroy();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    }

    console.log(
      `Creating new WebRTC peer connection with ${peerId} (initiator: ${initiator})`
    );

    // Create the peer with our WebRTC configuration
    const peer = new SimplePeer({
      initiator,
      wrtc,
      trickle: true,
      config: this.webrtcManager.config,
    });

    // Store connection info
    const peerInfo = {
      peer,
      connected: false,
      initiator,
      peerId,
      createdAt: Date.now(),
    };

    this.webrtcManager.connectionManager.connections.set(peerId, peerInfo);

    // Set up event handlers
    this._setupPeerEvents(peer, peerId, peerInfo);

    return peerInfo;
  }

  /**
   * Set up event handlers for a peer connection
   * @private
   * @param {Object} peer - SimplePeer instance
   * @param {string} peerId - Peer ID
   * @param {Object} peerInfo - Peer connection info
   */
  _setupPeerEvents(peer, peerId, peerInfo) {
    peer.on("error", (err) => {
      console.error(`WebRTC error with peer ${peerId}:`, err.message);
      this.webrtcManager.connectionManager.handlePeerFailure(peerId);
    });

    peer.on("signal", (data) => {
      // Send signal through signaling server if available
      if (this.webrtcManager.signalingManager) {
        this.webrtcManager.signalingManager.sendSignal(
          peerId,
          data,
          peerInfo.initiator ? "offer" : "answer"
        );
      } else {
        console.warn(
          `No signaling mechanism available to send signal to ${peerId}`
        );
      }
    });

    peer.on("connect", () => {
      console.log(`WebRTC connection established with peer ${peerId}`);
      peerInfo.connected = true;

      // Remove from pending connections
      this.webrtcManager.connectionManager.pendingConnections.delete(peerId);

      // Notify the socket manager about the new connection
      if (this.webrtcManager.server.socketManager) {
        this.webrtcManager.server.socketManager.registerWebRTCPeer(
          peerId,
          peer
        );
      }

      // Start synchronization process
      this.webrtcManager.connectionManager.initiateSync(peerId);
    });

    peer.on("close", () => {
      console.log(`WebRTC connection closed with peer ${peerId}`);
      this.webrtcManager.connectionManager.handlePeerDisconnect(peerId);
    });

    peer.on("data", (data) => {
      this.webrtcManager.messageHandler.processMessage(peerId, data);
    });
  }
}

module.exports = PeerConnectionFactory;
