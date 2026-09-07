import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AiError } from '../services/ai/types.js';
import { isProd } from '../config/env.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof AiError) {
    const status = err.status === 429 ? 429 : 503;
    return res.status(status).json({
      error:
        err.status === 429
          ? 'Zahiri is handling a lot of checks right now. Please try again in a moment.'
          : 'The verification engine is temporarily unavailable. Please try again shortly.',
      provider: err.provider,
      detail: isProd ? undefined : err.message,
    });
  }

  const message = err instanceof Error ? err.message : 'Unknown error';

  // Mongo duplicate key
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    return res.status(409).json({ error: 'That record already exists' });
  }

  console.error('[error]', err);
  res.status(500).json({
    error: 'Something went wrong on our side',
    detail: isProd ? undefined : message,
  });
}

/** Wrap an async handler so rejected promises reach the error handler. */
export function asyncRoute<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req as T, res, next).catch(next);
  };
}
