require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./utils/socket.util');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Connect Database (Starts 100% Empty — Admin is created via Web UI / Signup in DB)
    await connectDB();

    // 2. Create HTTP Server & Initialize Real-Time Socket.io
    const server = http.createServer(app);
    initSocket(server);

    // 3. Start Listening
    server.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 HCM Lite Backend running on http://localhost:${PORT}`);
      console.log(`📖 API Documentation available at http://localhost:${PORT}/api/docs`);
      console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`======================================================\n`);
    });
  } catch (error) {
    console.error(`[Server Start Error] ${error.message}`);
    process.exit(1);
  }
};

startServer();
