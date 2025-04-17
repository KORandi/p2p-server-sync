/**
 * Generate Secure Key Utility
 *
 * A simple utility to generate a secure master key for P2P server encryption.
 *
 * Usage: node utils/generate-key.js [keyLength]
 * Default keyLength is 32 (256 bits)
 */

const crypto = require("crypto");

// Allow specifying key length via command line argument
const keyLength = parseInt(process.argv[2], 10) || 32;

// Generate a random key
function generateSecureKey(length) {
  return crypto.randomBytes(length).toString("base64");
}

// Generate and display the key
const masterKey = generateSecureKey(keyLength);
console.log("\nGenerated Secure Master Key (PSK):");
console.log("----------------------------------");
console.log(masterKey);
console.log("----------------------------------");
console.log(
  `\nThis key is ${keyLength * 8} bits (${keyLength} bytes) of entropy.`
);
console.log("\nUsage in your application:");
console.log(`
const server = P2PServer.createServer({
  // other config...
  security: {
    // Security is enabled by default - no need to set 'enabled: true'
    masterKey: "${masterKey}",
    algorithm: "aes-256-gcm",
    kdfIterations: 10000
  }
});
`);

console.log("\nIMPORTANT: Store this key securely!");
console.log(
  "In production, use environment variables or a secure key management system:"
);
console.log(`
// Store in environment variable
export P2P_SERVER_MASTER_KEY="${masterKey}"

// Use in your application
const server = P2PServer.createServer({
  // other config...
  security: {
    masterKey: process.env.P2P_SERVER_MASTER_KEY
  }
});
`);

console.log("\nWARNING: Do not commit this key to version control.");
console.log("All nodes in your P2P network must use the SAME master key.\n");
