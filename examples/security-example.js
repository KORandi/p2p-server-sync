/**
 * Security Example for P2P Server
 *
 * This example demonstrates how to set up two secure P2P servers that
 * communicate using encrypted data with AES-GCM and PBKDF2 key derivation.
 *
 * Usage: node examples/security-example.js
 */

const P2PServer = require("../src");
const path = require("path");
const rimraf = require("rimraf");

// Pre-shared master key - in a real application, this should be securely distributed
// and stored in environment variables or a secure configuration store
const MASTER_KEY = "this-is-a-secure-master-key-12345";

// Clean up any previous database files
rimraf.sync(path.join(__dirname, "db1"));
rimraf.sync(path.join(__dirname, "db2"));

// Create the first server with security enabled
const server1 = P2PServer.createServer({
  port: 3001,
  dbPath: path.join(__dirname, "db1"),
  serverID: "server1",
  security: {
    enabled: true,
    masterKey: MASTER_KEY,
    algorithm: "aes-256-gcm",
    kdfIterations: 10000,
  },
});

// Create the second server that connects to the first
const server2 = P2PServer.createServer({
  port: 3002,
  dbPath: path.join(__dirname, "db2"),
  serverID: "server2",
  peers: ["http://localhost:3001"],
  security: {
    enabled: true,
    masterKey: MASTER_KEY,
    algorithm: "aes-256-gcm",
    kdfIterations: 10000,
  },
});

// Start both servers
async function startServers() {
  try {
    console.log("Starting server 1...");
    await server1.start();

    console.log("Starting server 2...");
    await server2.start();

    console.log("Both servers started successfully.");

    // Subscribe to changes on server 2
    server2.subscribe("test", (value, path) => {
      console.log(`Server 2 received update for ${path}:`, value);
    });

    // Wait for connections to establish
    setTimeout(async () => {
      // Server 1 puts data which should be securely transmitted to server 2
      console.log("Server 1 putting data...");
      await server1.put("test/secure-data", {
        message: "This is a secure message",
        timestamp: Date.now(),
      });

      // Wait a moment and check if server 2 received it
      setTimeout(async () => {
        const data = await server2.get("test/secure-data");
        console.log("Server 2 retrieved data:", data);

        // Verify both servers have the same data
        const server1Data = await server1.get("test/secure-data");
        console.log(
          "Data equality check:",
          JSON.stringify(data) === JSON.stringify(server1Data)
            ? "PASSED"
            : "FAILED"
        );

        // Show connection stats with security info
        console.log(
          "\nServer 1 connection stats:",
          server1.getConnectionStats()
        );
        console.log("Server 2 connection stats:", server2.getConnectionStats());

        // Demonstrate a scenario with data modification
        setTimeout(async () => {
          console.log("\nServer 2 modifying data...");
          await server2.put("test/secure-data", {
            message: "This is an updated secure message",
            timestamp: Date.now(),
            updatedBy: "server2",
          });

          // Wait a moment and check if server 1 received the update
          setTimeout(async () => {
            const updatedData = await server1.get("test/secure-data");
            console.log("Server 1 retrieved updated data:", updatedData);

            // Run anti-entropy to ensure full synchronization
            console.log("\nRunning anti-entropy sync...");
            await server1.runAntiEntropy();

            // Wait a moment and then clean up
            setTimeout(() => {
              console.log("\nCleanup: Shutting down servers...");
              Promise.all([server1.close(), server2.close()])
                .then(() => console.log("Servers shut down successfully."))
                .catch((err) =>
                  console.error("Error shutting down servers:", err)
                );
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);
    }, 2000);
  } catch (error) {
    console.error("Error starting servers:", error);
  }
}

startServers();
