const { randomBytes } = require("crypto");
const serverConfig = require("./server-config");
const securityConfig = require("./security-config");
const syncConfig = require("./sync-config");
const webrtcConfig = require("./webrtc-config");

/**
 * Get default configuration values
 * @returns {Object} Default configuration
 */
function getDefaultConfig() {
  return {
    ...serverConfig.getDefaults(),
    ...securityConfig.getDefaults(),
    ...syncConfig.getDefaults(),
    ...webrtcConfig.getDefaults(),
  };
}

/**
 * Validate configuration values
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateConfig(config) {
  // Validate each configuration section
  serverConfig.validate(config);
  securityConfig.validate(config);
  syncConfig.validate(config);
  webrtcConfig.validate(config);
}

module.exports = {
  getDefaultConfig,
  validateConfig,
};
