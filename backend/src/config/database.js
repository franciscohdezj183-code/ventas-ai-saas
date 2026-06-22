import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

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
    logger.error('mysql_pool_error', { error });

    if (isRetryableDatabaseError(error)) {
      reconnectDatabase().catch((reconnectError) => {
        logger.error('mysql_reconnection_failed', { error: reconnectError });
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
    logger.error('mysql_pool_close_error', { error });
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
        logger.info('mysql_connection_restored');
        return pool;
      } catch (error) {
        lastError = error;
        const delay = Math.min(1000 * attempt, 5000);

        logger.error('mysql_reconnect_attempt_failed', { error, attempt });

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
    logger.error('mysql_connection_error', { error });
    throw error;
  } finally {
    connection?.release();
  }
}

export async function closeDatabase() {
  await destroyCurrentPool();
}
