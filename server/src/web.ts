import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response } from 'express';

/**
 * Serves the Expo web export from the same origin as the API.
 *
 * The app is a single-page app with client-side routing, so any path that is
 * not a file and not an API route has to return index.html and let the router
 * decide. The order matters: API routes are registered before this, and the
 * catch-all here deliberately refuses anything under /api so a mistyped
 * endpoint still returns a JSON 404 rather than a page of HTML.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** dist/web.js -> dist/../public, i.e. server/public */
const WEB_ROOT = path.resolve(here, '..', 'public');

export function hasWebBuild(): boolean {
  return fs.existsSync(path.join(WEB_ROOT, 'index.html'));
}

export function mountWeb(app: Express): boolean {
  if (!hasWebBuild()) {
    console.warn(
      '[web] no build found at server/public — the root URL will serve API JSON only. ' +
        'Run `npm run build:web` from the repository root to generate it.',
    );
    return false;
  }

  // Hashed asset filenames can be cached hard; index.html must never be, or a
  // deploy leaves browsers holding a stale shell that points at deleted bundles.
  app.use(
    express.static(WEB_ROOT, {
      index: false,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
      },
    }),
  );

  app.get('*', (req: Request, res: Response, next) => {
    // Let unmatched API paths fall through to the JSON 404 handler.
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    // Only HTML navigations get the shell; a missing asset should 404 as itself.
    if (!req.accepts('html')) return next();

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(path.join(WEB_ROOT, 'index.html'));
  });

  console.log(`[web] serving the Zahiri app from ${WEB_ROOT}`);
  return true;
}
