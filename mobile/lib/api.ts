import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {
  backoffDelay,
  COLD_START_HINT_MS,
  isColdStartStatus,
  MAX_COLD_START_RETRIES,
  setServerState,
  sleep,
} from './serverStatus';

/**
 * API client for the Zahiri backend.
 *
 * The session token is held in the device keystore (expo-secure-store), not in
 * AsyncStorage, so another app or a rooted-device file read cannot lift it.
 */

const TOKEN_KEY = 'zahiri.session.token';

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  // Fall back to the dev machine hosting Metro, so a debug build works on a
  // physical device without any configuration.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:8080`;

  return 'http://localhost:8080';
}

export const API_BASE_URL = resolveBaseUrl();

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    return cachedToken;
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // A keystore failure must not crash sign-in; the in-memory token still works
    // for this session.
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function api<T = unknown>(
  path: string,
  { method = 'GET', body, auth = true, timeoutMs = 90_000, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res!: Response;
  let attempt = 0;

  // Render spins idle free instances down, so the first call may hit a cold
  // start. Retry the boot-time failures rather than surfacing them as errors.
  for (;;) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

    // If nothing has come back quickly, tell the UI the server is waking.
    const hint = setTimeout(() => setServerState('waking'), COLD_START_HINT_MS);

    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: composed,
      });
      clearTimeout(hint);
    } catch (err) {
      clearTimeout(hint);

      const aborted = signal?.aborted;
      const name = (err as Error).name;

      if (!aborted && attempt < MAX_COLD_START_RETRIES) {
        setServerState('waking');
        await sleep(backoffDelay(attempt));
        attempt += 1;
        continue;
      }

      setServerState('unreachable');
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ApiError(0, 'That took too long. Check your connection and try again.');
      }
      throw new ApiError(0, 'Cannot reach Zahiri. Check your internet connection.');
    }

    if (isColdStartStatus(res.status) && attempt < MAX_COLD_START_RETRIES) {
      setServerState('waking');
      await sleep(backoffDelay(attempt));
      attempt += 1;
      continue;
    }

    break;
  }

  setServerState('awake');

  // A revoked or expired session should drop the stored token, not loop forever.
  if (res.status === 401 && auth) {
    await setToken(null);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const payload = data as { error?: string; details?: { field: string; message: string }[] };
    throw new ApiError(
      res.status,
      payload?.error ?? `Request failed (${res.status})`,
      payload?.details,
    );
  }

  return data as T;
}

/**
 * Fire-and-forget health ping at launch, so a cold start overlaps with the user
 * reading the first screen rather than blocking their first real action.
 */
export async function warmUp(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      signal: AbortSignal.timeout(90_000),
    });
    setServerState(res.ok ? 'awake' : 'waking');
  } catch {
    setServerState('unreachable');
  }
}

/** Multipart upload for media checks. */
export async function apiUpload<T = unknown>(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  // React Native's FormData takes this shape for file parts.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ApiError(0, 'Upload failed. Check your connection and try again.');
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string })?.error ?? 'Upload failed');
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Shared types, mirroring the server's shapes
// ---------------------------------------------------------------------------

export type Verdict = 'verified' | 'false' | 'misleading' | 'unverified' | 'pending';

export interface Evidence {
  title: string;
  url: string;
  publisher: string;
  note: string;
}

export interface VerificationResult {
  id: string | null;
  entryPoint: string;
  inputType: 'text' | 'link' | 'image' | 'video' | 'audio';
  claim: string;
  sourceUrl: string | null;
  verdict: Verdict;
  confidence: number;
  explanation: string;
  evidence: Evidence[];
  signals: {
    deepfake: { checked: boolean; score: number | null; indicators: string[] };
    provenance: { checked: boolean; hasCredentials: boolean; issuer: string | null };
    sourceReputation: { checked: boolean; domain: string | null; score: number | null };
  };
  humanReview: { required: boolean; status: string };
  aiProvider: string | null;
  aiModel: string | null;
  reputation?: {
    domain: string;
    known: boolean;
    score: number;
    band: string;
    isWatchlisted: boolean;
    aiContentFarm: boolean;
    note: string;
  } | null;
  createdAt?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  tier: string;
  points: number;
  language: string;
  country: string;
  topics: string[];
  whatsappNumber: string | null;
  accessibility: {
    signLanguage: boolean;
    largeText: boolean;
    highContrast: boolean;
    audioReadout: boolean;
  };
}

export interface Alert {
  _id: string;
  title: string;
  summary: string;
  body: string;
  topic: string;
  verdict: Verdict;
  isCrisis: boolean;
  circulationScore: number;
  correction: string;
  region: string;
  sources: { title: string; url: string }[];
  publishedAt: string;
}

export interface GameRoundCard {
  _id: string;
  claim: string;
  context: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
}

export interface HubPostItem {
  _id: string;
  title: string;
  body: string;
  topic: string;
  likes: number;
  downloads: number;
  isResource: boolean;
  createdAt: string;
  author: { _id: string; name: string; role: string; tier: string } | null;
  verification: {
    verdict: Verdict;
    confidence: number;
    explanation: string;
  } | null;
}
