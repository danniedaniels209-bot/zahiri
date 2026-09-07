import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { corsOrigins, env, isProd } from './config/env.js';
import {
  connectMongo,
  disconnectMongo,
  mongoDatabaseName,
  mongoState,
} from './db/mongo.js';
import { errorHandler, notFound } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { configuredProviders } from './services/ai/client.js';
import {
  hardenResponses,
  preventParamPollution,
  requestId,
  sanitizeInput,
} from './middleware/security.js';

import authRoutes from './routes/auth.routes.js';
import verifyRoutes from './routes/verify.routes.js';
import chatRoutes from './routes/chat.routes.js';
import hubRoutes from './routes/hub.routes.js';
import gameRoutes from './routes/game.routes.js';
import alertRoutes from './routes/alerts.routes.js';
import rewardRoutes from './routes/rewards.routes.js';
import campaignRoutes from './routes/campaigns.routes.js';
import pluginRoutes from './routes/plugins.routes.js';
import b2bRoutes from './routes/b2b.routes.js';
import reviewRoutes from './routes/review.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { hasWebBuild, mountWeb } from './web.js';

const app = express();

app.set('trust proxy', 1); // Render terminates TLS at its proxy

// A JSON-only API can lock everything down. Once the web app is served from
// this origin it needs its own bundle, styles, fonts and API calls allowed.
const webBuildPresent = hasWebBuild();

// Both branches must declare the same keys: helmet types the directive map with
// an index signature, so a union of two differently-shaped objects is rejected.
const cspDirectives: Record<string, string[]> = webBuildPresent
  ? {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // React Native Web injects styles at runtime, so inline styles are required.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    }
  : {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    };

app.use(
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    crossOriginEmbedderPolicy: false,
    hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }),
);
app.use(hardenResponses);
app.use(requestId);
app.use(compression());

/**
 * In production only the configured origins may call the API. A native app sends
 * no Origin header at all, so requests without one are still allowed through.
 */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!isProd || corsOrigins.length === 0) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    maxAge: 86_400,
  }),
);

// The raw body is kept only so the WhatsApp webhook can verify Meta's HMAC.
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(sanitizeInput);
app.use(preventParamPollution);
app.use(morgan(isProd ? 'combined' : 'dev'));

/** Render pings this to decide whether the instance is healthy. */
app.get('/health', (_req, res) => {
  const db = mongoState();
  res.status(db === 'connected' ? 200 : 503).json({
    status: db === 'connected' ? 'ok' : 'degraded',
    database: db,
    databaseName: mongoDatabaseName(),
    aiProviders: configuredProviders(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: '1.0.0',
  });
});

// With a web build present the app itself owns "/", so this only answers when
// the API is running on its own.
if (!webBuildPresent) {
  app.get('/', (_req, res) => {
    res.json({
      name: 'Zahiri API',
      tagline: 'Verified Information, Empowered Minds',
      docs: '/api/docs',
      health: '/health',
    });
  });
}

/** A plain map of the surface, useful when wiring the app or a newsroom client. */
app.get('/api/docs', (_req, res) => {
  res.json({
    entryPoints: {
      'POST /api/chat': 'AI fact-checking chatbot',
      'POST /api/chat/stream': 'Chatbot, streamed over SSE',
      'POST /api/verify/claim': 'Verify a text claim or link',
      'POST /api/verify/media': 'Deepfake & synthetic media detection',
      'POST /api/verify/provenance': 'Content Credentials check only',
      'POST /api/plugins/share': 'Share-to-Zahiri from Facebook / LinkedIn',
      'POST /api/plugins/whatsapp/webhook': 'WhatsApp Cloud API inbound',
    },
    verificationEngine: {
      'GET /api/verify/source': 'Source reputation score for a domain',
      'GET /api/verify/watchlist': 'Confirmed AI content-farm watchlist',
      'GET /api/verify/history': 'Your own verification history',
      'GET /api/alerts/crisis': 'Election & Crisis rapid-response feed',
      'GET /api/review/queue': 'Human fact-checker queue',
      'POST /api/review/:id/decide': 'Submit a human verdict, notifies the user',
      'GET /api/review/stats': 'Queue depth and engine-vs-human agreement',
    },
    admin: {
      'GET /api/admin/overview': 'What content exists',
      'POST|PATCH|DELETE /api/admin/radio': 'Radio partners',
      'POST|PATCH|DELETE /api/admin/campaigns': 'School campaigns',
      'POST|PATCH|DELETE /api/admin/modules': 'Training modules',
      'POST|PATCH|DELETE /api/admin/sources': 'Source reputation & watchlist',
      'POST|PATCH|DELETE /api/admin/rounds': 'Truth Hunters rounds',
    },
    reinforcement: {
      'GET /api/game/rounds': 'Deal Truth Hunters rounds',
      'POST /api/game/sessions': 'Submit a run, get scored',
      'GET /api/game/leaderboard': 'Seasonal leaderboard',
      'GET /api/alerts': 'Daily updates, personalised',
      'GET /api/hub/posts': 'Community Verification Hub',
      'GET /api/rewards/catalogue': 'Reward system',
      'GET /api/campaigns': 'School sensitisation campaigns',
      'GET /api/campaigns/radio': 'Radio partner schedule',
    },
    b2b: {
      'POST /api/b2b/v1/verify': 'Newsroom & NGO verification API (x-api-key)',
      'GET /api/b2b/v1/source': 'Source reputation (x-api-key)',
      'GET /api/b2b/v1/crisis': 'Crisis feed (x-api-key)',
    },
  });
});

app.use('/api', globalLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/hub', hubRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/admin', adminRoutes);

// After all API routes: unmatched non-API paths fall through to the app shell.
mountWeb(app);

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectMongo();

  const providers = configuredProviders();
  if (providers.length === 0) {
    console.warn(
      '[ai] No provider configured. Verification endpoints will return 503 until ' +
        'NVIDIA_API_KEY or OPENROUTER_API_KEY is set.',
    );
  } else {
    console.log(`[ai] providers ready: ${providers.join(', ')}`);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[zahiri] listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[zahiri] ${signal} received, shutting down`);
    server.close(() => void 0);
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[zahiri] failed to start:', err);
  process.exit(1);
});

export default app;
