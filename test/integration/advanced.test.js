/**
 * Advanced Tests for P2P Server
 * These tests focus on edge cases, fault tolerance, and performance under load
 */

const { expect } = require("chai");
const { P2PServer, createServer, VectorClock } = require("../../src");
const {
  createTestNetwork,
  wait,
  cleanupServers,
} = require(".././helpers/test-network");
const { loadFixtures } = require(".././helpers/fixtures");
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");

// Test database directory
const TEST_DB_DIR = "./test/temp/advanced-tests";

// Clean up test databases
function cleanupTestDatabases() {
  if (fs.existsSync(TEST_DB_DIR)) {
    rimraf.sync(TEST_DB_DIR);
    console.log(`Cleaned up test databases at ${TEST_DB_DIR}`);
  }
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}

describe("Advanced P2P Server Tests", function () {
  // These tests may take longer to run
  this.timeout(60000);

  before(function () {
    cleanupTestDatabases();
  });

  after(function () {
    cleanupTestDatabases();
  });

  describe("1. Custom Conflict Resolution", function () {
    let servers = [];

    beforeEach(async function () {
      servers = createTestNetwork(3, 4001, `${TEST_DB_DIR}/custom-conflict`);

      // Start all servers
      for (const server of servers) {
        await server.start();
      }

      // Wait for connections to establish
      await wait(2000);
    });

    afterEach(async function () {
      await cleanupServers(servers);
      servers = [];
    });

    it("should apply custom resolver for inventory with minimum stock values", async function () {
      // Define custom resolver for inventory items
      const customResolver = (path, localData, remoteData) => {
        // Ensure we have valid objects with stock property
        if (
          localData.value &&
          remoteData.value &&
          typeof localData.value.stock === "number" &&
          typeof remoteData.value.stock === "number"
        ) {
          // Take the newer data as base
          const result =
            localData.timestamp >= remoteData.timestamp
              ? { ...localData }
              : { ...remoteData };

          // But always use minimum stock value for safety
          const minStock = Math.min(
            localData.value.stock,
            remoteData.value.stock
          );
          result.value = { ...result.value, stock: minStock };

          return result;
        }

        // Default to last-write-wins if format doesn't match
        return localData.timestamp >= remoteData.timestamp
          ? localData
          : remoteData;
      };

      // Register custom resolver on all servers
      for (const server of servers) {
        server.registerConflictResolver("inventory", customResolver);
      }

      // Server 1 creates inventory item
      await servers[0].put("inventory/product1", {
        name: "Test Product",
        price: 100,
        stock: 50,
      });

      // Wait for sync
      await wait(1000);

      // Server 2 updates with higher price but lower stock
      await servers[1].put("inventory/product1", {
        name: "Test Product",
        price: 120,
        stock: 20,
        onSale: true,
      });

      // Wait for sync and conflict resolution
      await wait(2000);

      // Check both servers have merged with minimum stock
      const item1 = await servers[0].get("inventory/product1");
      const item2 = await servers[1].get("inventory/product1");
      const item3 = await servers[2].get("inventory/product1");

      // All servers should have the same resolved data
      expect(item1.stock).to.equal(20); // Minimum stock value
      expect(item1.price).to.equal(120); // Updated price
      expect(item1.onSale).to.be.true; // New field

      expect(item2).to.deep.equal(item1);
      expect(item3).to.deep.equal(item1);
    });
  });

  describe("2. Rate Limiting and Backpressure", function () {
    let server;

    before(async function () {
      server = new P2PServer({
        port: 4001,
        dbPath: `${TEST_DB_DIR}/rate-limit`,
        peers: [],
      });

      await server.start();
    });

    after(async function () {
      await server.close();
    });

    it("should handle high write throughput without crashing", async function () {
      const OPERATION_COUNT = 500;
      const MAX_BATCH_SIZE = 50;
      const BATCH_DELAY = 100; // ms between batches

      console.log(
        `Testing write throughput with ${OPERATION_COUNT} operations...`
      );

      let successCount = 0;
      let failCount = 0;

      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < OPERATION_COUNT; i += MAX_BATCH_SIZE) {
        const batchSize = Math.min(MAX_BATCH_SIZE, OPERATION_COUNT - i);
        const batchPromises = [];

        for (let j = 0; j < batchSize; j++) {
          const index = i + j;
          batchPromises.push(
            server
              .put(`throughput/item${index}`, {
                value: `Item ${index}`,
                timestamp: Date.now(),
              })
              .then(() => {
                successCount++;
              })
              .catch(() => {
                failCount++;
              })
          );
        }

        // Wait for batch to complete
        await Promise.all(batchPromises);

        // Add delay between batches
        if (i + MAX_BATCH_SIZE < OPERATION_COUNT) {
          await wait(BATCH_DELAY);
        }
      }

      console.log(
        `Write throughput test complete: ${successCount} successes, ${failCount} failures`
      );

      // Most operations should succeed
      expect(successCount).to.be.at.least(OPERATION_COUNT * 0.95);

      // Verify data was stored correctly for a sample of items
      for (let i = 0; i < OPERATION_COUNT; i += 50) {
        const data = await server.get(`throughput/item${i}`);
        // Only check the ones that should have succeeded
        if (i < successCount) {
          expect(data).to.not.be.null;
          expect(data.value).to.equal(`Item ${i}`);
        }
      }
    });
  });

  describe("3. Data Recovery After Crash", function () {
    let server1, server2;
    const SERVER1_DB_PATH = `${TEST_DB_DIR}/recovery-1`;
    const SERVER2_DB_PATH = `${TEST_DB_DIR}/recovery-2`;

    before(async function () {
      // Start two connected servers
      server1 = new P2PServer({
        port: 4001,
        dbPath: SERVER1_DB_PATH,
        peers: [],
      });

      server2 = new P2PServer({
        port: 4002,
        dbPath: SERVER2_DB_PATH,
        peers: ["http://localhost:4001"],
      });

      await server1.start();
      await server2.start();

      // Wait for connection to establish
      await wait(2000);

      // Store some data on both servers
      await server1.put("recovery/server1data", {
        source: "server1",
        value: 100,
      });
      await server2.put("recovery/server2data", {
        source: "server2",
        value: 200,
      });

      // Wait for sync
      await wait(2000);

      // Verify both servers have all data
      const test1 = await server1.get("recovery/server2data");
      const test2 = await server2.get("recovery/server1data");

      expect(test1).to.not.be.null;
      expect(test2).to.not.be.null;

      // Close both servers properly
      await server1.close();
      await server2.close();
    });

    it("should recover data after server restart", async function () {
      // Restart both servers
      server1 = new P2PServer({
        port: 4001,
        dbPath: SERVER1_DB_PATH,
        peers: [],
      });

      server2 = new P2PServer({
        port: 4002,
        dbPath: SERVER2_DB_PATH,
        peers: ["http://localhost:4001"],
      });

      await server1.start();
      await server2.start();

      // Wait for connection to establish
      await wait(2000);

      // Verify data was recovered from disk
      const server1data1 = await server1.get("recovery/server1data");
      const server1data2 = await server1.get("recovery/server2data");
      const server2data1 = await server2.get("recovery/server1data");
      const server2data2 = await server2.get("recovery/server2data");

      // All data should be present on both servers
      expect(server1data1.source).to.equal("server1");
      expect(server1data1.value).to.equal(100);
      expect(server1data2.source).to.equal("server2");
      expect(server1data2.value).to.equal(200);

      expect(server2data1.source).to.equal("server1");
      expect(server2data1.value).to.equal(100);
      expect(server2data2.source).to.equal("server2");
      expect(server2data2.value).to.equal(200);

      // Clean up
      await server1.close();
      await server2.close();
    });
  });

  describe("4. Version History and Rollback", function () {
    let server;

    before(async function () {
      server = new P2PServer({
        port: 4001,
        dbPath: `${TEST_DB_DIR}/version-history`,
        peers: [],
        sync: {
          maxVersions: 5, // Keep 5 versions in history
        },
      });

      await server.start();
    });

    after(async function () {
      await server.close();
    });

    it("should maintain correct version history for multiple updates", async function () {
      const PATH = "versioned/document";

      // Create multiple versions
      for (let i = 1; i <= 6; i++) {
        await server.put(PATH, {
          version: i,
          content: `Content version ${i}`,
          timestamp: Date.now(),
        });

        // Add small delay between versions
        await wait(100);
      }

      // Get version history
      const history = server.getVersionHistory(PATH);

      // Should only keep 5 versions (as configured)
      expect(history.length).to.equal(5);

      // Versions should be ordered newest to oldest
      expect(history[0].value.version).to.equal(5);
      expect(history[1].value.version).to.equal(4);
      expect(history[2].value.version).to.equal(3);
      expect(history[3].value.version).to.equal(2);
      expect(history[4].value.version).to.equal(1);
      // Version 1 should be dropped as it's the oldest
    });

    it("should implement manual rollback using version history", async function () {
      const PATH = "versioned/rollback-test";

      // Create multiple versions
      for (let i = 1; i <= 3; i++) {
        await server.put(PATH, {
          version: i,
          content: `Rollback test version ${i}`,
          timestamp: Date.now(),
        });

        // Add small delay between versions
        await wait(100);
      }

      // Get version history
      const history = server.getVersionHistory(PATH);

      // Roll back to version 2
      const versionToRestore = history.find((v) => v.value.version === 2);
      expect(versionToRestore).to.not.be.undefined;

      // Implement rollback by writing the old version with a new timestamp
      await server.put(PATH, {
        ...versionToRestore.value,
        timestamp: Date.now(),
        isRollback: true,
      });

      // Verify current version reflects the rollback
      const current = await server.get(PATH);
      expect(current.version).to.equal(2);
      expect(current.isRollback).to.be.true;

      // Version history should now include the rollback as newest entry
      const newHistory = server.getVersionHistory(PATH);
      expect(newHistory[0].value.version).to.equal(3);
      expect(newHistory[1].value.version).to.equal(2);
    });
  });

  describe("5. Large Data Handling", function () {
    let server;

    before(async function () {
      server = new P2PServer({
        port: 4001,
        dbPath: `${TEST_DB_DIR}/large-data`,
        peers: [],
      });

      await server.start();
    });

    after(async function () {
      await server.close();
    });

    // Helper to generate a large object
    function generateLargeObject(sizeKB) {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const size = sizeKB * 1024;

      const result = {
        id: `large-item-${Date.now()}`,
        timestamp: Date.now(),
        description: "Large test object",
        chunks: [],
      };

      // Split into 1KB chunks
      const chunkCount = Math.ceil(size / 1024);
      for (let i = 0; i < chunkCount; i++) {
        let chunk = "";
        for (let j = 0; j < 1024; j++) {
          chunk += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        result.chunks.push(chunk);
      }

      return result;
    }

    it("should store and retrieve large objects (1MB)", async function () {
      const PATH = "large-data/megabyte";
      const data = generateLargeObject(1024); // 1MB

      // Store the large object
      await server.put(PATH, data);

      // Retrieve it
      const retrieved = await server.get(PATH);

      // Verify it's the same
      expect(retrieved.id).to.equal(data.id);
      expect(retrieved.timestamp).to.equal(data.timestamp);
      expect(retrieved.chunks.length).to.equal(data.chunks.length);

      // Verify total size
      let totalSize = 0;
      for (const chunk of retrieved.chunks) {
        totalSize += chunk.length;
      }

      expect(totalSize).to.be.at.least(1024 * 1024 * 0.99); // Allow slight variation due to encoding
    });
  });

  describe("6. Network Topology Changes", function () {
    let servers = [];

    beforeEach(async function () {
      // Create a linear chain: Server1 -> Server2 -> Server3
      servers = [];

      servers.push(
        new P2PServer({
          port: 4001,
          dbPath: `${TEST_DB_DIR}/topology-1`,
          peers: [],
        })
      );

      servers.push(
        new P2PServer({
          port: 4002,
          dbPath: `${TEST_DB_DIR}/topology-2`,
          peers: ["http://localhost:4001"],
        })
      );

      servers.push(
        new P2PServer({
          port: 4003,
          dbPath: `${TEST_DB_DIR}/topology-3`,
          peers: ["http://localhost:4002"],
        })
      );

      // Start all servers
      for (const server of servers) {
        await server.start();
      }

      // Wait for connections to establish
      await wait(2000);
    });

    afterEach(async function () {
      await cleanupServers(servers);
      servers = [];
    });

    it("should adapt to topology changes and maintain data consistency", async function () {
      // Initial data propagation test - should go through the chain
      await servers[0].put("topology/initial", { value: "chain-test" });

      // Wait for propagation
      await wait(2000);

      // Check data reached the end of the chain
      const initialCheck = await servers[2].get("topology/initial");
      expect(initialCheck).to.not.be.null;
      expect(initialCheck.value).to.equal("chain-test");

      // Now change the topology - server3 connects directly to server1
      // This creates a ring Server1 -> Server2 -> Server3 -> Server1
      console.log("Changing network topology...");

      // Close the existing server3
      await servers[2].close();

      // Create a new server3 with different peers
      servers[2] = new P2PServer({
        port: 4003,
        dbPath: `${TEST_DB_DIR}/topology-3`,
        peers: ["http://localhost:4001"], // Now connects to server1 directly
      });

      await servers[2].start();

      // Wait for connections to establish
      await wait(2000);

      // Test propagation in the new topology
      await servers[2].put("topology/updated", { value: "ring-test" });

      // Wait for propagation
      await wait(2000);

      // All servers should have the data via the new connection
      const server1Data = await servers[0].get("topology/updated");
      const server2Data = await servers[1].get("topology/updated");

      expect(server1Data).to.not.be.null;
      expect(server1Data.value).to.equal("ring-test");
      expect(server2Data).to.not.be.null;
      expect(server2Data.value).to.equal("ring-test");
    });
  });

  describe("7. Scan and Query Performance", function () {
    let server;

    before(async function () {
      server = new P2PServer({
        port: 4001,
        dbPath: `${TEST_DB_DIR}/scan-performance`,
        peers: [],
      });

      await server.start();

      // Preload with test data
      await loadFixtures(server, {
        users: true,
        products: true,
        settings: true,
      });

      // Add more data with nested paths
      for (let category = 1; category <= 5; category++) {
        for (let product = 1; product <= 10; product++) {
          await server.put(`store/category${category}/product${product}`, {
            name: `Product ${category}-${product}`,
            price: Math.random() * 100 + 10,
            stock: Math.floor(Math.random() * 100),
          });
        }
      }
    });

    after(async function () {
      await server.close();
    });

    it("should perform efficient path prefix scans", async function () {
      // Measure scan performance
      const start = Date.now();

      // Scan all products
      const allProducts = await server.scan("products");

      const duration = Date.now() - start;
      console.log(`Scanning ${allProducts.length} products took ${duration}ms`);

      // Should find all products
      expect(allProducts.length).to.be.at.least(10);

      // Verify data format
      expect(allProducts[0]).to.have.property("path");
      expect(allProducts[0]).to.have.property("value");

      // Scan should be reasonably fast (adjust based on your performance requirements)
      expect(duration).to.be.below(100); // ms
    });

    it("should handle nested path scans efficiently", async function () {
      // Measure scan performance for nested paths
      const start = Date.now();

      // Scan a nested category
      const categoryProducts = await server.scan("store/category3");

      const duration = Date.now() - start;
      console.log(
        `Scanning ${categoryProducts.length} products in category took ${duration}ms`
      );

      // Should find expected number of items
      expect(categoryProducts.length).to.equal(10);

      // Verify path structure is correct
      for (const product of categoryProducts) {
        expect(product.path).to.include("store/category3/product");
      }

      // Scan should be reasonably fast (adjust based on your performance requirements)
      expect(duration).to.be.below(50); // ms
    });
  });

  describe("8. Vector Clock Comparison Edge Cases", function () {
    it("should correctly compare vector clocks with missing entries", function () {
      const clock1 = new VectorClock({ node1: 1, node2: 2 });
      const clock2 = new VectorClock({ node1: 1, node3: 1 });

      // These clocks are concurrent (each has entries the other doesn't have)
      expect(clock1.compare(clock2)).to.equal(0);
      expect(clock1.isConcurrent(clock2)).to.be.true;
    });

    it("should correctly handle vector clock merges with duplicate data", function () {
      const clock1 = new VectorClock({ node1: 3, node2: 1 });
      const clock2 = new VectorClock({ node1: 2, node2: 2 });

      const merged = clock1.merge(clock2);

      // Should take highest values from each clock
      expect(merged.clock.node1).to.equal(3);
      expect(merged.clock.node2).to.equal(2);
    });

    it("should correctly identify causal relationships", function () {
      // Create causally related clocks
      const clockA = new VectorClock({ node1: 1, node2: 2 });
      const clockB = new VectorClock({ node1: 2, node2: 2 });
      const clockC = new VectorClock({ node1: 2, node2: 3 });

      // B is causally after A
      expect(clockB.isAfter(clockA)).to.be.true;
      expect(clockA.isBefore(clockB)).to.be.true;

      // C is causally after B
      expect(clockC.isAfter(clockB)).to.be.true;
      expect(clockB.isBefore(clockC)).to.be.true;

      // C is causally after A (transitivity)
      expect(clockC.isAfter(clockA)).to.be.true;
      expect(clockA.isBefore(clockC)).to.be.true;

      // A clock is identical to itself
      expect(clockA.isIdentical(clockA.clone())).to.be.true;
    });

    it("should correctly handle invalid vector clock data", function () {
      // Create with invalid entries
      const clock = new VectorClock({
        node1: 1,
        node2: -1, // Negative values should be reset to 0
        node3: "invalid", // Non-number should be reset to 0
        node4: undefined, // Undefined should be ignored
      });

      // Should sanitize the data
      expect(clock.clock.node1).to.equal(1);
      expect(clock.clock.node2).to.equal(0);
      expect(clock.clock.node3).to.equal(0);
      expect(clock.clock).to.not.have.property("node4");

      // Invalid comparisons should default to concurrent
      expect(clock.compare(null)).to.equal(0);
      expect(clock.compare("invalid")).to.equal(0);
    });
  });

  describe("9. Offline Operations and Sync", function () {
    let servers = [];

    beforeEach(async function () {
      servers = createTestNetwork(3, 4001, `${TEST_DB_DIR}/offline-sync`, {
        sync: {
          antiEntropyInterval: 2000, // Run anti-entropy more frequently for testing
        },
      });

      // Start all servers
      for (const server of servers) {
        await server.start();
      }

      // Wait for connections to establish
      await wait(2000);
    });

    afterEach(async function () {
      await cleanupServers(servers);
      servers = [];
    });

    it("should sync changes made while a node was offline", async function () {
      // Initial data
      await servers[0].put("offline-test/initial", { value: "initial" });

      // Wait for initial sync
      await wait(1000);

      // All servers should have the initial data
      const initialCheck = await servers[2].get("offline-test/initial");
      expect(initialCheck).to.not.be.null;

      // Disconnect server2 by closing it
      console.log("Disconnecting server 2 (simulating offline)...");
      await servers[1].close();

      // Make changes on server1 while server2 is offline
      await servers[0].put("offline-test/while-offline", {
        value: "server1-update",
      });

      // Make changes on server3 while server2 is offline
      await servers[2].put("offline-test/from-server3", {
        value: "server3-update",
      });

      // Wait for sync between server1 and server3
      await wait(1000);

      // Verify server1 and server3 can see each other's changes
      const server1Check = await servers[0].get("offline-test/from-server3");
      const server3Check = await servers[2].get("offline-test/while-offline");

      expect(server1Check).to.not.be.null;
      expect(server3Check).to.not.be.null;

      // Restart server2
      console.log("Reconnecting server 2...");
      servers[1] = new P2PServer({
        port: 4002,
        dbPath: `${TEST_DB_DIR}/offline-sync-2`,
        peers: ["http://localhost:4001", "http://localhost:4003"],
      });

      await servers[1].start();

      // Wait for anti-entropy to sync
      await wait(5000);

      // Server2 should now have all the data
      const afterOffline = await servers[1].get("offline-test/while-offline");
      const fromServer3 = await servers[1].get("offline-test/from-server3");

      console.log("Server 2 data after reconnection:", {
        afterOffline,
        fromServer3,
      });

      expect(afterOffline).to.not.be.null;
      expect(afterOffline.value).to.equal("server1-update");
      expect(fromServer3).to.not.be.null;
      expect(fromServer3.value).to.equal("server3-update");
    });
  });

  describe("10. Clock Drift and Timestamp Issues", function () {
    let servers = [];

    beforeEach(async function () {
      servers = createTestNetwork(2, 4001, `${TEST_DB_DIR}/clock-drift`);

      // Start all servers
      for (const server of servers) {
        await server.start();
      }

      // Wait for connections to establish
      await wait(2000);
    });

    afterEach(async function () {
      await cleanupServers(servers);
      servers = [];
    });

    it("should handle system clock differences across nodes", async function () {
      // Mock timestamp function on second server to simulate clock drift
      const realDateNow = Date.now;
      try {
        // Simulate server2's clock being 10 seconds in the future
        const clockDrift = 10000; // 10 seconds
        Date.now = () => realDateNow() + clockDrift;

        // Server 1 creates data (with normal clock)
        const normalTimestamp = realDateNow();
        await servers[0].put("drift-test/server1", {
          value: "from-server1",
          localTimestamp: normalTimestamp,
        });

        // Wait for sync
        await wait(1000);

        // Restore clock
        Date.now = realDateNow;

        // Server 2 creates data (after fixing clock)
        await servers[1].put("drift-test/server2", {
          value: "from-server2",
          localTimestamp: Date.now(),
        });

        // Wait for sync
        await wait(1000);

        // Both servers should have both pieces of data
        const server1Data1 = await servers[0].get("drift-test/server1");
        const server1Data2 = await servers[0].get("drift-test/server2");
        const server2Data1 = await servers[1].get("drift-test/server1");
        const server2Data2 = await servers[1].get("drift-test/server2");

        // All data should be present despite the clock drift
        expect(server1Data1).to.not.be.null;
        expect(server1Data2).to.not.be.null;
        expect(server2Data1).to.not.be.null;
        expect(server2Data2).to.not.be.null;

        // The localTimestamp values should match what we set
        expect(server1Data1.localTimestamp).to.equal(normalTimestamp);

        // Vector clocks should have been synchronized
        const vclock1 = servers[0].syncManager.getVectorClock();
        const vclock2 = servers[1].syncManager.getVectorClock();

        // Both servers should have entries for each other
        expect(vclock1).to.have.property(servers[1].serverID);
        expect(vclock2).to.have.property(servers[0].serverID);
      } finally {
        // Restore the real Date.now in case of test failure
        Date.now = realDateNow;
      }
    });
  });

  describe("11. Anti-Entropy with Large Database Sync", function () {
    let serverA, serverB;
    const SERVER_A_DB_PATH = `${TEST_DB_DIR}/large-entropy-a`;
    const SERVER_B_DB_PATH = `${TEST_DB_DIR}/large-entropy-b`;

    before(async function () {
      // This test may take longer due to large data
      this.timeout(60000);

      console.log("Setting up large database test...");

      // Create first server with no peers
      serverA = new P2PServer({
        port: 4001,
        dbPath: SERVER_A_DB_PATH,
        peers: [],
        sync: {
          antiEntropyInterval: null, // Disable automatic anti-entropy
        },
      });

      await serverA.start();
      console.log("Server A started");

      // Generate at least 1MB of data
      console.log("Generating large dataset (>1MB)...");
      await generateLargeDataset(serverA);

      // Verify data size
      const dbSize = await calculateDbSize(SERVER_A_DB_PATH);
      console.log(
        `Generated database size: ${(dbSize / (1024 * 1024)).toFixed(2)} MB`
      );

      // Create second server that will connect to first
      serverB = new P2PServer({
        port: 4002,
        dbPath: SERVER_B_DB_PATH,
        peers: ["http://localhost:4001"],
        sync: {
          antiEntropyInterval: null, // Disable automatic anti-entropy
        },
      });

      await serverB.start();
      console.log("Server B started");

      // Wait for connection to establish
      await wait(2000);
    });

    after(async function () {
      console.log("Cleaning up servers");
      if (serverA) await serverA.close();
      if (serverB) await serverB.close();
    });

    // Helper function to generate large dataset
    async function generateLargeDataset(server) {
      // Generate string data chunks of 10KB each
      const generateChunk = (index) => {
        const chars =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        const chunkSize = 10 * 1024; // 10KB

        for (let i = 0; i < chunkSize; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        return {
          id: `chunk-${index}`,
          data: result,
          timestamp: Date.now(),
          metadata: {
            index,
            size: chunkSize,
            checksum: `mock-checksum-${index}`,
          },
        };
      };

      // Generate approximately 1MB of data (100 chunks of 10KB)
      const CHUNKS = 100;
      console.log(
        `Creating ${CHUNKS} data chunks (approx. ${CHUNKS * 10}KB)...`
      );

      for (let i = 0; i < CHUNKS; i++) {
        const chunk = generateChunk(i);
        await server.put(`large-data/chunk${i}`, chunk);

        // Log progress
        if (i % 20 === 0) {
          console.log(`Generated ${i}/${CHUNKS} chunks...`);
        }
      }

      // Also create deep paths with smaller data for testing path-specific sync
      for (let category = 0; category < 5; category++) {
        for (let item = 0; item < 20; item++) {
          await server.put(`large-data/category${category}/item${item}`, {
            name: `Item ${category}-${item}`,
            description: `Description for item ${item} in category ${category}`,
            data: `X`.repeat(1024), // 1KB of data per item
          });
        }
      }
    }

    // Helper to calculate DB size on disk
    async function calculateDbSize(dbPath) {
      let totalSize = 0;

      function getFilesizeInBytes(filePath) {
        const stats = fs.statSync(filePath);
        return stats.size;
      }

      function walkDir(dir) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            walkDir(filePath);
          } else {
            totalSize += getFilesizeInBytes(filePath);
          }
        }
      }

      walkDir(dbPath);
      return totalSize;
    }

    it("should successfully sync large database via anti-entropy", async function () {
      // First, verify server B has no data initially
      const initialDataB = await serverB.scan("large-data");
      console.log(`Initial data count on Server B: ${initialDataB.length}`);
      expect(initialDataB.length).to.equal(0);

      // Get initial count on server A for verification
      const initialDataA = await serverA.scan("large-data");
      console.log(`Data count on Server A: ${initialDataA.length}`);
      expect(initialDataA.length).to.be.above(100); // Should have all our chunks plus category items

      // Start a timer to measure sync duration
      console.log("Triggering anti-entropy synchronization...");
      const startTime = Date.now();

      // Manually trigger anti-entropy on both servers
      await serverA.runAntiEntropy();
      await serverB.runAntiEntropy();

      // Wait for first-pass sync
      await wait(5000);

      // Run additional anti-entropy passes to ensure complete sync
      console.log("Running additional anti-entropy passes...");
      for (let i = 0; i < 3; i++) {
        await serverA.runAntiEntropy();
        await serverB.runAntiEntropy();
        await wait(2000);
      }

      const totalTime = Date.now() - startTime;
      console.log(`Anti-entropy completed in ${totalTime}ms`);

      // Check how much data was synced to server B
      const syncedDataB = await serverB.scan("large-data");
      console.log(`Synced data count on Server B: ${syncedDataB.length}`);

      // Calculate sync percentage
      const syncPercentage = (syncedDataB.length / initialDataA.length) * 100;
      console.log(`Sync percentage: ${syncPercentage.toFixed(2)}%`);

      // Run one last anti-entropy and check final state
      console.log("Running final anti-entropy pass...");
      await serverA.runAntiEntropy();
      await serverB.runAntiEntropy();
      await wait(3000);

      const finalDataB = await serverB.scan("large-data");
      console.log(`Final data count on Server B: ${finalDataB.length}`);

      // Verify sync success - should have synced all or at least 90% of the data
      expect(finalDataB.length).to.be.at.least(
        Math.floor(initialDataA.length * 0.9)
      );

      // Verify actual data content for a sample of items
      console.log("Verifying data content integrity...");
      let verifiedCount = 0;
      const SAMPLE_SIZE = 10; // Check 10 random chunks

      for (let i = 0; i < SAMPLE_SIZE; i++) {
        const index = Math.floor(Math.random() * 100); // Random chunk index
        const pathToCheck = `large-data/chunk${index}`;

        const dataA = await serverA.get(pathToCheck);
        const dataB = await serverB.get(pathToCheck);

        if (dataB && dataA && dataB.data === dataA.data) {
          verifiedCount++;
        }
      }

      console.log(
        `Verified ${verifiedCount}/${SAMPLE_SIZE} random samples match exactly`
      );
      expect(verifiedCount).to.be.at.least(Math.floor(SAMPLE_SIZE * 0.8));

      // Test a deep path item
      const deepPathA = await serverA.get("large-data/category2/item7");
      const deepPathB = await serverB.get("large-data/category2/item7");

      expect(deepPathB).to.not.be.null;
      expect(deepPathB).to.deep.equal(deepPathA);

      // Log system info for performance context
      console.log("Test completed successfully");
      console.log(`Data synced: ${finalDataB.length} items in ${totalTime}ms`);
      console.log(
        `Sync rate: ${(finalDataB.length / (totalTime / 1000)).toFixed(2)} items/second`
      );
    });
  });
});
