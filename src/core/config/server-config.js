const { randomBytes } = require("crypto");
const { isValidPort, isValidPeerUrl } = require("../../utils/validation");

/**
 * Get default server configuration values
 * @returns {Object} Default server configuration
 */
function getDefaults() {
  return {
    // Server config
    port: 3000,
    host: "localhost", // Default to localhost
    dbPath: "./db",
    peers: [],
    serverID: randomBytes(8).toString("hex"),

    // Rate limiting configuration
    rateLimit: {
      enabled: true,
      maxRequests: 100, // Maximum requests per window
      windowMs: 60000, // Window size in milliseconds (1 minute)
      ipWhitelist: ["127.0.0.1", "::1"], // IPs exempt from rate limiting
    },

    // Internal security configuration
    internalSecurity: {
      enabled: true,
      allowedPeers: [], // Empty array = all peers allowed (specify for whitelist)
      allowedIPs: ["127.0.0.1", "::1", "localhost"], // Allowed IP addresses
      challengeResponse: true, // Use challenge-response authentication
    },
  };
}

/**
 * Validate server configuration values
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validate(config) {
  // Validate port
  if (config.port !== undefined) {
    if (!isValidPort(config.port)) {
      throw new Error(
        `Invalid port: ${config.port}. Must be an integer between 1 and 65535.`
      );
    }
  }

  // Validate dbPath
  if (config.dbPath !== undefined && typeof config.dbPath !== "string") {
    throw new Error(`Invalid dbPath: ${config.dbPath}. Must be a string.`);
  }

  // Validate peers
  if (config.peers !== undefined) {
    if (!Array.isArray(config.peers)) {
      throw new Error(`Invalid peers: ${config.peers}. Must be an array.`);
    }

    for (const peer of config.peers) {
      if (typeof peer !== "string") {
        throw new Error(`Invalid peer URL: ${peer}. Must be a string.`);
      }

      try {
        new URL(peer);
      } catch (error) {
        throw new Error(`Invalid peer URL format: ${peer}. ${error.message}`);
      }
    }
  }

  // Validate rate limiting config if provided
  if (config.rateLimit) {
    if (
      config.rateLimit.enabled !== undefined &&
      typeof config.rateLimit.enabled !== "boolean"
    ) {
      throw new Error(
        `Invalid rateLimit.enabled: ${config.rateLimit.enabled}. Must be a boolean.`
      );
    }

    if (
      config.rateLimit.maxRequests !== undefined &&
      (!Number.isInteger(config.rateLimit.maxRequests) ||
        config.rateLimit.maxRequests < 1)
    ) {
      throw new Error(
        `Invalid rateLimit.maxRequests: ${config.rateLimit.maxRequests}. Must be a positive integer.`
      );
    }

    if (
      config.rateLimit.windowMs !== undefined &&
      (!Number.isInteger(config.rateLimit.windowMs) ||
        config.rateLimit.windowMs < 1000)
    ) {
      throw new Error(
        `Invalid rateLimit.windowMs: ${config.rateLimit.windowMs}. Must be at least 1000ms.`
      );
    }

    if (config.rateLimit.ipWhitelist !== undefined) {
      if (!Array.isArray(config.rateLimit.ipWhitelist)) {
        throw new Error(
          `Invalid rateLimit.ipWhitelist: Must be an array of IP addresses.`
        );
      }
    }
  }

  // Validate internal security config if provided
  if (config.internalSecurity) {
    if (
      config.internalSecurity.enabled !== undefined &&
      typeof config.internalSecurity.enabled !== "boolean"
    ) {
      throw new Error(
        `Invalid internalSecurity.enabled: ${config.internalSecurity.enabled}. Must be a boolean.`
      );
    }

    if (config.internalSecurity.allowedPeers !== undefined) {
      if (!Array.isArray(config.internalSecurity.allowedPeers)) {
        throw new Error(
          `Invalid internalSecurity.allowedPeers: Must be an array of peer IDs.`
        );
      }
    }

    if (config.internalSecurity.allowedIPs !== undefined) {
      if (!Array.isArray(config.internalSecurity.allowedIPs)) {
        throw new Error(
          `Invalid internalSecurity.allowedIPs: Must be an array of IP addresses.`
        );
      }
    }

    if (
      config.internalSecurity.challengeResponse !== undefined &&
      typeof config.internalSecurity.challengeResponse !== "boolean"
    ) {
      throw new Error(
        `Invalid internalSecurity.challengeResponse: ${config.internalSecurity.challengeResponse}. Must be a boolean.`
      );
    }
  }
}

module.exports = {
  getDefaults,
  validate,
};
