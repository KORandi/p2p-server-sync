/**
 * Secure Synchronization Integration Test
 * Tests that two servers can securely synchronize data with encryption
 */

const { expect } = require("chai");
const path = require("path");
const rimraf = require("rimraf");
const P2PServer = require("../../src");

describe("Secure Data Synchronization", function () {
  // Set a longer timeout for integration tests
  this.timeout(10000);

  const MASTER_KEY = "secure-test-master-key-integration-12345";
  let server1;
  let server2;

  // Clean up test databases before each test
  beforeEach(async () => {
    const dbPath1 = path.join(__dirname, "../temp/db_secure_test_1");
    const dbPath2 = path.join(__dirname, "../temp/db_secure_test_2");

    rimraf.sync(dbPath1);
    rimraf.sync(dbPath2);

    // Create first server
    server1 = P2PServer.createServer({
      port: 13001,
      dbPath: dbPath1,
      serverID: "secure-server-1",
      security: {
        enabled: true,
        masterKey: MASTER_KEY,
      },
    });

    // Create second server that connects to the first
    server2 = P2PServer.createServer({
      port: 13002,
      dbPath: dbPath2,
      serverID: "secure-server-2",
      peers: ["http://localhost:13001"],
      security: {
        enabled: true,
        masterKey: MASTER_KEY,
      },
    });

    // Start both servers
    await server1.start();
    await server2.start();

    // Wait for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  // Clean up after each test
  afterEach(async () => {
    // Close servers
    if (server1) await server1.close();
    if (server2) await server2.close();

    // Small delay to ensure clean shutdown
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("should securely sync data between servers", async () => {
    // Create test data
    const testData = {
      message: "This is a secure message",
      timestamp: Date.now(),
      nested: { value: 42 },
    };

    // Put data on server1
    await server1.put("secure/test", testData);

    // Wait for sync
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if server2 received the data
    const receivedData = await server2.get("secure/test");

    // Verify data
    expect(receivedData).to.deep.equal(testData);
  });

  it("should handle concurrent updates with vector clocks", async () => {
    // Put initial data on server1
    await server1.put("secure/concurrent", { value: "initial" });

    // Wait for sync
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Make concurrent updates
    const server1Promise = server1.put("secure/concurrent", {
      value: "server1-update",
    });
    const server2Promise = server2.put("secure/concurrent", {
      value: "server2-update",
    });

    // Wait for both updates to complete
    await Promise.all([server1Promise, server2Promise]);

    // Wait for sync
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Force anti-entropy sync from both sides
    await server1.runAntiEntropy();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await server2.runAntiEntropy();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get final values from both servers
    const server1Value = await server1.get("secure/concurrent");
    const server2Value = await server2.get("secure/concurrent");

    // Both servers should converge to the same value based on vector clock
    expect(server1Value).to.deep.equal(server2Value);

    // Value should be one of the updates (which one depends on vector clock ordering)
    expect(["server1-update", "server2-update"]).to.include(server1Value.value);
  });

  it("should reject data from servers with different master keys", async () => {
    // Create a server with a different master key
    const dbPath3 = path.join(__dirname, "../temp/db_secure_test_3");
    rimraf.sync(dbPath3);

    const serverWithDifferentKey = P2PServer.createServer({
      port: 13003,
      dbPath: dbPath3,
      serverID: "secure-server-3",
      peers: ["http://localhost:13001"],
      security: {
        enabled: true,
        masterKey: "different-master-key-67890",
      },
    });

    try {
      // Start the server
      await serverWithDifferentKey.start();

      // Wait for connection attempts
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Put data on the server with different key
      await serverWithDifferentKey.put("secure/test-isolation", {
        value: "from-different-key",
      });

      // Wait for potential sync (should not happen)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify server1 did not receive the data
      const receivedData = await server1.get("secure/test-isolation");
      expect(receivedData).to.be.null;
    } finally {
      // Clean up
      if (serverWithDifferentKey) await serverWithDifferentKey.close();
    }
  });

  it("should successfully sync after explicit anti-entropy", async () => {
    // Put data on server1
    await server1.put("secure/anti-entropy", { value: "test-value" });

    // Force anti-entropy sync
    await server1.runAntiEntropy();

    // Wait for sync
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify server2 received the data
    const receivedData = await server2.get("secure/anti-entropy");
    expect(receivedData).to.deep.equal({ value: "test-value" });
  });
});
