/**
 * Get default WebRTC configuration values
 * @returns {Object} Default WebRTC configuration
 */
function getDefaults() {
  return {
    // WebRTC configuration
    webrtc: {
      enabled: false, // WebRTC is disabled by default for internal networks
      stunServers: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
      ],
      signalingServer: null,
      iceTransportPolicy: "all",
      reconnectDelay: 5000,
    },
  };
}

/**
 * Validate WebRTC configuration values
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validate(config) {
  // Validate WebRTC config if provided
  if (config.webrtc) {
    // Enabled flag
    if (
      config.webrtc.enabled !== undefined &&
      typeof config.webrtc.enabled !== "boolean"
    ) {
      throw new Error(
        `Invalid webrtc.enabled: ${config.webrtc.enabled}. Must be a boolean.`
      );
    }

    // STUN servers
    if (config.webrtc.stunServers !== undefined) {
      if (!Array.isArray(config.webrtc.stunServers)) {
        throw new Error(
          `Invalid webrtc.stunServers: ${config.webrtc.stunServers}. Must be an array.`
        );
      }

      for (const server of config.webrtc.stunServers) {
        if (typeof server !== "string") {
          throw new Error(`Invalid STUN server: ${server}. Must be a string.`);
        }

        if (!server.startsWith("stun:")) {
          throw new Error(
            `Invalid STUN server format: ${server}. Must start with 'stun:'`
          );
        }
      }
    }

    // Signaling server
    if (
      config.webrtc.signalingServer !== undefined &&
      config.webrtc.signalingServer !== null &&
      typeof config.webrtc.signalingServer !== "string"
    ) {
      throw new Error(
        `Invalid signalingServer: ${config.webrtc.signalingServer}. Must be a string URL or null.`
      );
    }

    // If signaling server is a string, validate it's a URL
    if (typeof config.webrtc.signalingServer === "string") {
      try {
        new URL(config.webrtc.signalingServer);
      } catch (error) {
        throw new Error(
          `Invalid signalingServer URL format: ${config.webrtc.signalingServer}. ${error.message}`
        );
      }
    }

    // ICE transport policy
    if (config.webrtc.iceTransportPolicy !== undefined) {
      if (
        config.webrtc.iceTransportPolicy !== "all" &&
        config.webrtc.iceTransportPolicy !== "relay"
      ) {
        throw new Error(
          `Invalid iceTransportPolicy: ${config.webrtc.iceTransportPolicy}. Must be 'all' or 'relay'.`
        );
      }
    }

    // Reconnect delay
    if (config.webrtc.reconnectDelay !== undefined) {
      if (
        !Number.isInteger(config.webrtc.reconnectDelay) ||
        config.webrtc.reconnectDelay < 0
      ) {
        throw new Error(
          `Invalid reconnectDelay: ${config.webrtc.reconnectDelay}. Must be a non-negative integer.`
        );
      }
    }
  }
}

module.exports = {
  getDefaults,
  validate,
};
