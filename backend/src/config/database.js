import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { env } from './env.js';

dotenv.config();

const databaseConfig = {
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT ?? 0),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

const RETRYABLE_ERROR_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE'
]);

let reconnectPromise = null;

export let pool = createPool();

function createPool() {
  const newPool = mysql.createPool(databaseConfig);

  newPool.on?.('error', (error) => {
    console.error('MySQL pool error:', error);

    if (isRetryableDatabaseError(error)) {
      reconnectDatabase().catch((reconnectError) => {
        console.error('MySQL reconnection failed:', reconnectError);
      });
    }
  });

  return newPool;
}

function isRetryableDatabaseError(error) {
  return RETRYABLE_ERROR_CODES.has(error?.code) || error?.fatal === true;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function destroyCurrentPool() {
  try {
    await pool.end();
  } catch (error) {
    console.error('Error closing MySQL pool:', error);
  }
}

export async function reconnectDatabase(maxAttempts = 3) {
  if (reconnectPromise) {
    return reconnectPromise;
  }

  reconnectPromise = (async () => {
    await destroyCurrentPool();

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        pool = createPool();
        await checkDatabaseConnection();
        console.info('MySQL connection restored');
        return pool;
      } catch (error) {
        lastError = error;
        const delay = Math.min(1000 * attempt, 5000);

        console.error(`MySQL reconnect attempt ${attempt} failed:`, error);

        if (attempt < maxAttempts) {
          await wait(delay);
        }
      }
    }

    throw lastError;
  })();

  try {
    return await reconnectPromise;
  } finally {
    reconnectPromise = null;
  }
}

export async function getConnection() {
  try {
    return await pool.getConnection();
  } catch (error) {
    if (!isRetryableDatabaseError(error)) {
      throw error;
    }

    await reconnectDatabase();
    return pool.getConnection();
  }
}

export async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (!isRetryableDatabaseError(error)) {
      throw error;
    }

    await reconnectDatabase();
    return pool.query(sql, params);
  }
}

export async function checkDatabaseConnection() {
  let connection;

  try {
    connection = await getConnection();
    await connection.ping();
    return true;
  } catch (error) {
    console.error('MySQL connection error:', error);
    throw error;
  } finally {
    connection?.release();
  }
}

export async function closeDatabase() {
  await destroyCurrentPool();
}
