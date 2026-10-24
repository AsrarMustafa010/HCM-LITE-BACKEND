const { Server } = require('socket.io');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    // Client joins user-specific and role-specific rooms
    socket.on('register', (data) => {
      if (data?.userId) {
        socket.join(`user:${data.userId}`);
      }
      if (data?.role) {
        socket.join(`role:${data.role}`);
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });

  console.log('[Socket.io] Real-time server initialized');
  return io;
};

const getIO = () => io;

const emitToUser = (userId, event, payload) => {
  if (io && userId) {
    io.to(`user:${String(userId)}`).emit(event, payload);
  }
};

const emitToRole = (role, event, payload) => {
  if (io && role) {
    io.to(`role:${role}`).emit(event, payload);
  }
};

const emitBroadcast = (event, payload) => {
  if (io) {
    io.emit(event, payload);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRole,
  emitBroadcast
};
