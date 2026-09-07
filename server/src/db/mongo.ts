import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

mongoose.set('strictQuery', true);

export async function connectMongo(): Promise<void> {
  const servers = env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length) {
    dns.setServers(servers);
    console.log(`[mongo] using DNS servers: ${servers.join(', ')}`);
  }

  mongoose.connection.on('connected', () =>
    console.log('[mongo] connected to Atlas'),
  );
  mongoose.connection.on('error', (err) =>
    console.error('[mongo] connection error:', err.message),
  );
  mongoose.connection.on('disconnected', () =>
    console.warn('[mongo] disconnected'),
  );

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 10,
    retryWrites: true,
  });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.connection.close();
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
