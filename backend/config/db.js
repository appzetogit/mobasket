import mongoose from 'mongoose';

const DEFAULT_RETRY_MS = 5000;
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000;
const DEFAULT_SOCKET_TIMEOUT_MS = 45000;

let reconnectTimer = null;
let listenersBound = false;
let connectInFlight = null;

// Fail fast when DB is unavailable instead of buffering unbounded operations in memory.
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', Number.parseInt(process.env.MONGODB_BUFFER_TIMEOUT_MS || '10000', 10));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMongoUri = () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI (or MONGO_URI) in environment variables');
  }
  return uri;
};

export const isDbConnected = () => mongoose.connection.readyState === 1;

const scheduleReconnect = (reason = 'unknown') => {
  if (reconnectTimer || isDbConnected()) return;
  const retryMs = Number.parseInt(process.env.MONGODB_RETRY_INTERVAL_MS || `${DEFAULT_RETRY_MS}`, 10);
  console.warn(`[DB] Scheduling reconnect in ${retryMs}ms (reason: ${reason})`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectDB();
    } catch {
      // connectDB handles scheduling next retry on failure.
    }
  }, retryMs);
};

const bindMongooseListeners = () => {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('connected', () => {
    console.log(`[DB] Connected to MongoDB (${mongoose.connection.host})`);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[DB] Reconnected to MongoDB');
  });

  mongoose.connection.on('disconnected', () => {
    console.error('[DB] MongoDB disconnected');
    scheduleReconnect('disconnected_event');
  });

  mongoose.connection.on('error', (error) => {
    console.error('[DB] MongoDB error:', error?.message || error);
    if (!isDbConnected()) {
      scheduleReconnect('error_event');
    }
  });
};

export const connectDB = async () => {
  bindMongooseListeners();
  if (isDbConnected()) return mongoose.connection;
  if (connectInFlight) return connectInFlight;

  const uri = getMongoUri();
  const serverSelectionTimeoutMS = Number.parseInt(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || `${DEFAULT_SERVER_SELECTION_TIMEOUT_MS}`,
    10
  );
  const socketTimeoutMS = Number.parseInt(
    process.env.MONGODB_SOCKET_TIMEOUT_MS || `${DEFAULT_SOCKET_TIMEOUT_MS}`,
    10
  );

  connectInFlight = mongoose.connect(uri, {
    serverSelectionTimeoutMS,
    socketTimeoutMS
  })
    .then(() => mongoose.connection)
    .catch((error) => {
      console.error('[DB] Initial MongoDB connect failed:', error?.message || error);
      scheduleReconnect('initial_connect_failure');
      throw error;
    })
    .finally(() => {
      connectInFlight = null;
    });

  return connectInFlight;
};

export const waitForDBConnection = async () => {
  while (!isDbConnected()) {
    try {
      await connectDB();
    } catch {
      const retryMs = Number.parseInt(process.env.MONGODB_RETRY_INTERVAL_MS || `${DEFAULT_RETRY_MS}`, 10);
      await delay(retryMs);
    }
  }
  return mongoose.connection;
};

export const requireDbConnection = async (req, res, next) => {
  if (isDbConnected()) return next();

  try {
    await connectDB();
    if (isDbConnected()) return next();
  } catch (_) {
    // Fall through to 503 response below.
  }

  return res.status(503).json({
    success: false,
    message: 'Service temporarily unavailable: database not connected'
  });
};

export default connectDB;
