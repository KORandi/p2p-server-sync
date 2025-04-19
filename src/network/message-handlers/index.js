/**
 * Message Handlers for P2P Server
 * Main entry point for WebSocket message handlers
 */

const BasicHandlers = require("./basic-handlers");
const SyncHandlers = require("./sync-handlers");
const SecurityHandlers = require("./security-handlers");
const RateLimiter = require("./rate-limiter");

/**
 * Set up socket message handlers with rate limit exemption for anti-entropy
 * @param {Object} socket - Socket.IO socket instance
 * @param {Object} server - P2PServer instance
 * @param {boolean} [isIncoming=true] - Whether this is an incoming connection
 */
function setupMessageHandlers(socket, server, isIncoming = true) {
  const connectionType = isIncoming ? "incoming" : "outgoing";

  // Get the client IP for rate limiting
  const clientIp = socket.handshake ? socket.handshake.address : null;
  const socketId = socket.id;

  // Client identifier for rate limiting
  const clientId = clientIp || socketId;

  // Create rate limiter for this connection
  const rateLimiter = new RateLimiter(clientId, server);

  // Setup all handlers
  BasicHandlers.setupHandlers(socket, server, isIncoming, rateLimiter);
  SyncHandlers.setupHandlers(socket, server, isIncoming, rateLimiter);
  SecurityHandlers.setupHandlers(socket, server, isIncoming, rateLimiter);

  // Handle disconnect event
  socket.on("disconnect", () => {
    // This is handled by SocketManager's connection tracking
    console.log(
      `Socket ${socket.id} disconnected (${connectionType} connection)`
    );
  });
}

module.exports = {
  setupMessageHandlers,
  ...BasicHandlers,
  ...SyncHandlers,
  ...SecurityHandlers,
};
