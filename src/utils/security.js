/**
 * Security utility for P2P Server
 * Provides encryption, decryption, and key derivation functions
 */

const crypto = require("crypto");

class SecurityManager {
  /**
   * Create a new SecurityManager
   * @param {Object} options - Security configuration
   * @param {string} options.masterKey - Master pre-shared key (PSK)
   * @param {string} [options.algorithm='aes-256-gcm'] - Encryption algorithm
   * @param {string} [options.kdfAlgorithm='pbkdf2'] - Key derivation function
   * @param {number} [options.kdfIterations=10000] - KDF iterations
   * @param {number} [options.keyLength=32] - Derived key length in bytes
   * @param {boolean} [options.enabled=true] - Whether encryption is enabled
   */
  constructor(options = {}) {
    if (!options.masterKey) {
      throw new Error("Master key (PSK) is required for the security manager");
    }

    this.masterKey = options.masterKey;
    this.algorithm = options.algorithm || "aes-256-gcm";
    this.kdfAlgorithm = options.kdfAlgorithm || "pbkdf2";
    this.kdfIterations = options.kdfIterations || 10000;
    this.keyLength = options.keyLength || 32; // 256 bits
    this.enabled = options.enabled !== false;
    this.saltLength = 16; // 128 bits
    this.ivLength = 12; // 96 bits for GCM (recommended)
    this.authTagLength = 16; // 128 bits

    // Verify that crypto supports the algorithm
    this._validateAlgorithm();
  }

  /**
   * Validate the selected algorithm is supported
   * @private
   */
  _validateAlgorithm() {
    const supportedAlgorithms = crypto.getCiphers();
    if (!supportedAlgorithms.includes(this.algorithm)) {
      throw new Error(
        `Encryption algorithm '${this.algorithm}' is not supported`
      );
    }
  }

  /**
   * Derive a key from the master key using a salt
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Buffer} - Derived key
   * @private
   */
  _deriveKey(salt) {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      this.kdfIterations,
      this.keyLength,
      "sha256"
    );
  }

  /**
   * Encrypt data using the derived key
   * @param {Object|string|Buffer} data - Data to encrypt
   * @returns {Object} - Encrypted data with salt, iv, authTag and ciphertext
   */
  encrypt(data) {
    // Skip if encryption is disabled
    if (!this.enabled) {
      return { encrypted: false, data };
    }

    try {
      // Generate a random salt for key derivation
      const salt = crypto.randomBytes(this.saltLength);

      // Derive encryption key from master key using the salt
      const key = this._deriveKey(salt);

      // Generate a random initialization vector
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
        authTagLength: this.authTagLength,
      });

      // Track if input is a buffer for proper decryption later
      const isBuffer = data instanceof Buffer;

      // Serialize data if it's an object
      let serializedData;
      if (typeof data === "object" && data !== null && !isBuffer) {
        serializedData = JSON.stringify(data);
      } else if (isBuffer) {
        serializedData = data;
      } else {
        serializedData = String(data);
      }

      // Convert to buffer if not already
      const dataBuffer = Buffer.isBuffer(serializedData)
        ? serializedData
        : Buffer.from(serializedData, "utf8");

      // Encrypt the data
      const ciphertext = Buffer.concat([
        cipher.update(dataBuffer),
        cipher.final(),
      ]);

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return encrypted data with metadata
      return {
        encrypted: true,
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        algorithm: this.algorithm,
        isBuffer: isBuffer, // Add flag to indicate if original was a buffer
      };
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error(`Failed to encrypt data: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted data using the derived key
   * @param {Object} encryptedData - Object with encrypted data and metadata
   * @returns {Object|string|Buffer} - Decrypted data
   */
  decrypt(encryptedData) {
    // If not encrypted, return data as is
    if (!encryptedData.encrypted) {
      return encryptedData.data;
    }

    // Skip if encryption is disabled
    if (!this.enabled) {
      throw new Error("Encryption is disabled but encrypted data was received");
    }

    try {
      // Verify all required fields are present
      if (
        !encryptedData.salt ||
        !encryptedData.iv ||
        !encryptedData.authTag ||
        !encryptedData.ciphertext
      ) {
        throw new Error("Encrypted data is missing required fields");
      }

      // Convert base64 strings back to buffers
      const salt = Buffer.from(encryptedData.salt, "base64");
      const iv = Buffer.from(encryptedData.iv, "base64");
      const authTag = Buffer.from(encryptedData.authTag, "base64");
      const ciphertext = Buffer.from(encryptedData.ciphertext, "base64");

      // Derive the key using the same salt
      const key = this._deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        encryptedData.algorithm || this.algorithm,
        key,
        iv,
        {
          authTagLength: this.authTagLength,
        }
      );

      // Set authentication tag
      decipher.setAuthTag(authTag);

      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      // Check if the original data was a buffer (we store this hint in a special property)
      if (encryptedData.isBuffer) {
        return decrypted;
      }

      // Try to parse as JSON if it looks like JSON
      try {
        const decryptedString = decrypted.toString("utf8");
        if (
          decryptedString.startsWith("{") ||
          decryptedString.startsWith("[")
        ) {
          return JSON.parse(decryptedString);
        }
        return decryptedString;
      } catch (e) {
        // Not JSON, return as buffer
        return decrypted;
      }
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * Generate a secure message ID
   * @returns {string} - Secure random message ID
   */
  generateSecureId() {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Create a message authentication code (MAC) for data integrity verification
   * @param {Object|string} data - Data to authenticate
   * @returns {string} - HMAC signature
   */
  createMAC(data) {
    const hmac = crypto.createHmac("sha256", this.masterKey);

    // Convert data to string if it's an object
    const dataString =
      typeof data === "object" ? JSON.stringify(data) : String(data);

    hmac.update(dataString);
    return hmac.digest("base64");
  }

  /**
   * Verify a message authentication code (MAC)
   * @param {Object|string} data - Data to verify
   * @param {string} mac - HMAC signature to check against
   * @returns {boolean} - Whether the MAC is valid
   */
  verifyMAC(data, mac) {
    const calculatedMAC = this.createMAC(data);
    return crypto.timingSafeEqual(
      Buffer.from(calculatedMAC, "base64"),
      Buffer.from(mac, "base64")
    );
  }
}

module.exports = SecurityManager;
