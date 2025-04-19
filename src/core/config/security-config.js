/**
 * Get default security configuration values
 * @returns {Object} Default security configuration
 */
function getDefaults() {
  return {
    // Security configuration
    security: {
      enabled: false,
      masterKey: null, // Must be provided if enabled
      algorithm: "aes-256-gcm",
      kdfAlgorithm: "pbkdf2",
      kdfIterations: 10000,
      keyLength: 32, // 256 bits
    },
  };
}

/**
 * Validate security configuration values
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validate(config) {
  // Validate security config if provided
  if (config.security) {
    // Check if security is enabled
    if (
      config.security.enabled !== undefined &&
      typeof config.security.enabled !== "boolean"
    ) {
      throw new Error(
        `Invalid security.enabled: ${config.security.enabled}. Must be a boolean.`
      );
    }

    // If security is enabled, masterKey is required
    if (config.security.enabled && !config.security.masterKey) {
      throw new Error(
        "Security is enabled but no masterKey provided. A master key (PSK) is required."
      );
    }

    // Validate masterKey if provided
    if (
      config.security.masterKey !== undefined &&
      config.security.masterKey !== null
    ) {
      if (typeof config.security.masterKey !== "string") {
        throw new Error("masterKey must be a string.");
      }

      if (config.security.masterKey.length < 16) {
        throw new Error(
          "masterKey should be at least 16 characters long for adequate security."
        );
      }
    }

    // Validate algorithm if provided
    if (config.security.algorithm !== undefined) {
      if (typeof config.security.algorithm !== "string") {
        throw new Error(
          `Invalid algorithm: ${config.security.algorithm}. Must be a string.`
        );
      }

      // We don't check if the algorithm is supported here because that requires the crypto module
      // This will be done in the SecurityManager constructor
    }

    // Validate KDF iterations if provided
    if (config.security.kdfIterations !== undefined) {
      if (
        !Number.isInteger(config.security.kdfIterations) ||
        config.security.kdfIterations < 1000
      ) {
        throw new Error(
          `Invalid kdfIterations: ${config.security.kdfIterations}. Must be an integer >= 1000.`
        );
      }
    }

    // Validate key length if provided
    if (config.security.keyLength !== undefined) {
      if (
        !Number.isInteger(config.security.keyLength) ||
        config.security.keyLength < 16
      ) {
        throw new Error(
          `Invalid keyLength: ${config.security.keyLength}. Must be an integer >= 16.`
        );
      }
    }
  }
}

module.exports = {
  getDefaults,
  validate,
};
