/**
 * Render's free tier spins an idle instance down. The first request after that
 * has to wait for a cold start, which can take 30-60 seconds and, while the
 * instance is booting, comes back as a 502/503 or a dropped connection.
 *
 * This module tracks that state so the UI can say "waking Zahiri up" instead of
 * showing a network error, and so requests retry instead of failing outright.
 */

export type ServerState = 'unknown' | 'waking' | 'awake' | 'unreachable';

type Listener = (state: ServerState) => void;

let state: ServerState = 'unknown';
const listeners = new Set<Listener>();

export function getServerState(): ServerState {
  return state;
}

export function setServerState(next: ServerState) {
  if (state === next) return;
  state = next;
  for (const fn of listeners) fn(next);
}

export function subscribeServerState(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** How long a request may run before we assume the instance is cold-starting. */
export const COLD_START_HINT_MS = 3_500;

/** Status codes Render's router returns while an instance is still booting. */
export function isColdStartStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export function backoffDelay(attempt: number): number {
  // 2s, 5s, 9s — inside a 90s budget, and gentle on a booting instance.
  return [2000, 5000, 9000][attempt] ?? 9000;
}

export const MAX_COLD_START_RETRIES = 3;

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
