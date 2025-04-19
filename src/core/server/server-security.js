/**
 * ServerSecurity - Manages encryption and security functions
 */
const SecurityManager = require("../../utils/security");

class ServerSecurity {
  /**
   * Create a new ServerSecurity instance
   * @param {Object} server - P2PServer instance
   * @param {Object} config - Server configuration
   */
  constructor(server, config) {
    this.server = server;

    // Security configuration
    this.securityEnabled = config.security?.enabled !== false; // Default to true if not explicitly disabled
    this.securityConfig = config.security || {};
    this.securityManager = null;

    // Initialize security manager if enabled
    if (this.securityEnabled) {
      this._initSecurityManager();
    } else {
      this._warnSecurityDisabled();
    }
  }

  /**
   * Initialize the security manager
   * @private
   */
  _initSecurityManager() {
    if (!this.securityConfig.masterKey) {
      throw new Error(
        "Security is enabled by default. Please provide a master key (PSK) " +
          "using the security.masterKey option, or explicitly disable security " +
          "by setting security.enabled to false."
      );
    }

    try {
      this.securityManager = new SecurityManager(this.securityConfig);
      console.log(
        `Security enabled with ${this.securityConfig.algorithm} encryption`
      );
    } catch (error) {
      console.error("Failed to initialize security manager:", error);
      throw new Error(`Security initialization failed: ${error.message}`);
    }
  }

  /**
   * Log a warning when security is disabled
   * @private
   */
  _warnSecurityDisabled() {
    console.warn(
      "WARNING: Security is disabled - data will be transmitted in cleartext. " +
        "This is NOT recommended for production environments."
    );
  }

  /**
   * Check if a peer has the necessary security configuration
   * @param {string} peerId - Peer ID to check
   * @returns {boolean} - Whether communication with this peer is secure
   */
  isPeerSecure(peerId) {
    // Security must be enabled locally first
    if (!this.securityEnabled) {
      return false;
    }

    // For now, we assume all peers with the same securityConfig are secure
    // In a more advanced implementation, this would check for key exchange confirmation
    return true;
  }

  /**
   * Encrypt data for network transmission
   * @param {Object} data - Data to encrypt
   * @returns {Object} - Encrypted data package
   */
  encryptData(data) {
    if (!this.securityEnabled || !this.securityManager) {
      return { encrypted: false, data };
    }

    try {
      return this.securityManager.encrypt(data);
    } catch (error) {
      console.error("Encryption error:", error);
      // Fallback to unencrypted if encryption fails
      return { encrypted: false, data };
    }
  }

  /**
   * Decrypt received data
   * @param {Object} encryptedData - Encrypted data package
   * @returns {Object} - Decrypted data
   */
  decryptData(encryptedData) {
    if (!encryptedData.encrypted) {
      return encryptedData.data || encryptedData;
    }

    if (!this.securityEnabled || !this.securityManager) {
      console.warn("Received encrypted data but security is disabled");
      throw new Error("Cannot decrypt: security is disabled");
    }

    try {
      return this.securityManager.decrypt(encryptedData);
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }
}

module.exports = ServerSecurity;
