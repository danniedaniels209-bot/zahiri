import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

mongoose.set('strictQuery', true);

/** The database this app expects when the connection string does not name one. */
const DEFAULT_DB_NAME = 'zahiri';

/**
 * Pull the database name out of a connection string.
 *
 * `mongodb+srv://user:pass@host/zahiri?opts` -> "zahiri"
 * `mongodb+srv://user:pass@host?opts`        -> null
 *
 * The second form is the trap: MongoDB silently connects to `test`, the app
 * reports itself healthy, and every query returns nothing because the seeded
 * data lives in a different database.
 */
export function databaseNameFromUri(uri: string): string | null {
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const afterHost = afterScheme.slice(afterScheme.indexOf('/') + 1);

  if (!afterScheme.includes('/')) return null;

  const name = afterHost.split('?')[0].trim();
  return name.length > 0 ? name : null;
}

const STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

export function mongoState(): string {
  return STATES[mongoose.connection.readyState] ?? 'unknown';
}

export async function connectMongo(): Promise<void> {
  const servers = env.DNS_SERVERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) {
    dns.setServers(servers);
    console.log(`[mongo] using DNS servers: ${servers.join(', ')}`);
  }

  mongoose.connection.on('connected', () =>
    console.log(`[mongo] connected to Atlas, database "${mongoose.connection.name}"`),
  );
  mongoose.connection.on('error', (err) =>
    console.error('[mongo] connection error:', err.message),
  );
  mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'));

  const named = databaseNameFromUri(env.MONGODB_URI);

  if (!named) {
    console.warn(
      `[mongo] MONGODB_URI does not name a database, so "${DEFAULT_DB_NAME}" is being used. ` +
        'Without this the driver would default to "test" and none of the seeded data would be visible. ' +
        `Add /${DEFAULT_DB_NAME} before the "?" in the connection string to make this explicit.`,
    );
  }

  await mongoose.connect(env.MONGODB_URI, {
    // Only applied when the URI itself does not name a database, so an explicit
    // choice in the connection string is still respected.
    ...(named ? {} : { dbName: DEFAULT_DB_NAME }),
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 10,
    retryWrites: true,
  });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.connection.close();
}

/** The database actually in use, for /health and diagnostics. */
export function mongoDatabaseName(): string | null {
  return mongoose.connection.name ?? null;
}
