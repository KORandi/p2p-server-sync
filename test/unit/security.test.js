/**
 * Security Manager Tests
 */

const { expect } = require("chai");
const SecurityManager = require("../../src/utils/security");

describe("SecurityManager", () => {
  const testMasterKey = "this-is-a-test-master-key-12345";
  let securityManager;

  beforeEach(() => {
    securityManager = new SecurityManager({
      masterKey: testMasterKey,
      algorithm: "aes-256-gcm",
      kdfIterations: 1000, // Use fewer iterations for testing speed
      keyLength: 32,
    });
  });

  describe("Constructor", () => {
    it("should require a master key", () => {
      expect(() => new SecurityManager({})).to.throw(
        "Master key (PSK) is required"
      );
    });

    it("should initialize with default values when not provided", () => {
      const manager = new SecurityManager({ masterKey: testMasterKey });
      expect(manager.algorithm).to.equal("aes-256-gcm");
      expect(manager.kdfAlgorithm).to.equal("pbkdf2");
      expect(manager.kdfIterations).to.equal(10000);
      expect(manager.keyLength).to.equal(32);
      expect(manager.enabled).to.be.true;
    });

    it("should initialize with provided values", () => {
      const manager = new SecurityManager({
        masterKey: testMasterKey,
        algorithm: "aes-128-gcm",
        kdfIterations: 5000,
        keyLength: 16,
        enabled: false,
      });
      expect(manager.algorithm).to.equal("aes-128-gcm");
      expect(manager.kdfIterations).to.equal(5000);
      expect(manager.keyLength).to.equal(16);
      expect(manager.enabled).to.be.false;
    });

    it("should throw on invalid algorithm", () => {
      expect(
        () =>
          new SecurityManager({
            masterKey: testMasterKey,
            algorithm: "invalid-algorithm",
          })
      ).to.throw("Encryption algorithm");
    });
  });

  describe("Encryption and Decryption", () => {
    it("should encrypt and decrypt string data", () => {
      const originalData = "This is a test message";
      const encrypted = securityManager.encrypt(originalData);

      // Verify encryption result format
      expect(encrypted).to.have.property("encrypted", true);
      expect(encrypted).to.have.property("salt").that.is.a("string");
      expect(encrypted).to.have.property("iv").that.is.a("string");
      expect(encrypted).to.have.property("authTag").that.is.a("string");
      expect(encrypted).to.have.property("ciphertext").that.is.a("string");

      // Decrypt and verify
      const decrypted = securityManager.decrypt(encrypted);
      expect(decrypted).to.equal(originalData);
    });

    it("should encrypt and decrypt object data", () => {
      const originalData = {
        message: "Test object",
        number: 42,
        nested: { value: true },
      };

      const encrypted = securityManager.encrypt(originalData);
      const decrypted = securityManager.decrypt(encrypted);

      expect(decrypted).to.deep.equal(originalData);
    });

    it("should encrypt and decrypt binary data", () => {
      const originalData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);

      const encrypted = securityManager.encrypt(originalData);

      // Check that our buffer flag is set
      expect(encrypted.isBuffer).to.be.true;

      const decrypted = securityManager.decrypt(encrypted);

      expect(Buffer.isBuffer(decrypted)).to.be.true;
      expect(decrypted.toString("hex")).to.equal(originalData.toString("hex"));
    });

    it("should pass through unencrypted data if encryption is disabled", () => {
      const disabledManager = new SecurityManager({
        masterKey: testMasterKey,
        enabled: false,
      });

      const originalData = "Test message";
      const result = disabledManager.encrypt(originalData);

      expect(result).to.deep.equal({ encrypted: false, data: originalData });
    });

    it("should throw when decrypting with the wrong key", () => {
      const data = "Secret message";
      const encrypted = securityManager.encrypt(data);

      // Create a different security manager with a different key
      const otherManager = new SecurityManager({
        masterKey: "different-master-key-67890",
      });

      expect(() => otherManager.decrypt(encrypted)).to.throw(
        "Failed to decrypt"
      );
    });

    it("should throw when data is tampered with", () => {
      const data = "Secret message";
      const encrypted = securityManager.encrypt(data);

      // Tamper with the ciphertext
      const tampered = {
        ...encrypted,
        ciphertext:
          encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 5) +
          "XXXXX",
      };

      expect(() => securityManager.decrypt(tampered)).to.throw(
        "Failed to decrypt"
      );
    });
  });

  describe("Message Authentication Code (MAC)", () => {
    it("should create and verify MAC for data", () => {
      const data = { message: "Test data", id: 123 };

      const mac = securityManager.createMAC(data);
      expect(mac).to.be.a("string");

      const isValid = securityManager.verifyMAC(data, mac);
      expect(isValid).to.be.true;
    });

    it("should detect tampered data with MAC", () => {
      const data = { message: "Original data", id: 123 };
      const mac = securityManager.createMAC(data);

      // Tamper with the data
      const tamperedData = { message: "Modified data", id: 123 };

      const isValid = securityManager.verifyMAC(tamperedData, mac);
      expect(isValid).to.be.false;
    });
  });

  describe("Secure ID Generation", () => {
    it("should generate secure random IDs", () => {
      const id1 = securityManager.generateSecureId();
      const id2 = securityManager.generateSecureId();

      expect(id1).to.be.a("string");
      expect(id1.length).to.equal(32); // 16 bytes as hex = 32 chars
      expect(id1).to.not.equal(id2); // Should be random
    });
  });
});
