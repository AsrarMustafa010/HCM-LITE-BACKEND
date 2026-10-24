const mongoose = require('mongoose');

const connectDB = async () => {
  const directUri = process.env.MONGO_URI_DIRECT;
  const mongoUri = process.env.MONGO_URI;

  if (!directUri && !mongoUri) {
    throw new Error('MONGO_URI is not defined in environment variables (.env)');
  }

  try {
    // Prefer direct replica-set URI first to avoid local ISP DNS SRV lookup delays
    const primaryUri = directUri || mongoUri;
    const conn = await mongoose.connect(primaryUri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    if (directUri && mongoUri) {
      console.warn(`[Database] Direct connection failed (${error.message}), retrying with MONGO_URI...`);
      const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
      console.log(`[Database] MongoDB Connected (SRV): ${conn.connection.host}`);
      return conn;
    }
    console.error(`[Database Error] ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
