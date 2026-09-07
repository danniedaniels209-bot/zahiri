import { env } from '../../config/env.js';
import { RpmGuard } from './rateLimiter.js';
import { AiError, type CompletionOptions, type CompletionResult, type Provider } from './types.js';

interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  headers: Record<string, string>;
  guard?: RpmGuard;
}

const providers: Record<Provider, ProviderConfig> = {
  nvidia: {
    apiKey: env.NVIDIA_API_KEY,
    baseUrl: env.NVIDIA_BASE_URL,
    textModel: env.NVIDIA_TEXT_MODEL,
    visionModel: env.NVIDIA_VISION_MODEL,
    headers: {},
    guard: new RpmGuard(env.NVIDIA_RPM_LIMIT),
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL,
    textModel: env.OPENROUTER_TEXT_MODEL,
    visionModel: env.OPENROUTER_VISION_MODEL,
    headers: {
      'HTTP-Referer': 'https://zahiri.app',
      'X-Title': 'Zahiri',
    },
  },
};

export function isConfigured(p: Provider): boolean {
  return Boolean(providers[p].apiKey);
}

export function configuredProviders(): Provider[] {
  return (Object.keys(providers) as Provider[]).filter(isConfigured);
}

export function providerStatus() {
  return (Object.keys(providers) as Provider[]).map((p) => ({
    provider: p,
    configured: isConfigured(p),
    textModel: providers[p].textModel,
    visionModel: providers[p].visionModel,
    rpmRemaining: providers[p].guard?.remaining() ?? null,
  }));
}

/**
 * Some models still leak a reasoning block into the message body. Remove it so
 * callers see only the answer.
 */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
}

/** One call to a single provider. Both NVIDIA NIM and OpenRouter are OpenAI-compatible. */
export async function callProvider(
  provider: Provider,
  opts: CompletionOptions,
): Promise<CompletionResult> {
  const cfg = providers[provider];

  if (!cfg.apiKey) {
    throw new AiError(`${provider} is not configured (missing API key)`, provider, 401, false);
  }

  if (cfg.guard?.isSaturated()) {
    const wait = cfg.guard.msUntilFree();
    throw new AiError(
      `${provider} local rate limit reached, ${Math.ceil(wait / 1000)}s until free`,
      provider,
      429,
      true,
    );
  }

  const model = opts.vision ? cfg.visionModel : cfg.textModel;
  const started = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1024,
    stream: false,
  };
  if (opts.json) body.response_format = { type: 'json_object' };

  // Nemotron reasoning models emit their chain of thought into `content` unless
  // it is switched off. Structured verdicts cannot survive that, so disable it.
  if (provider === 'nvidia') body.chat_template_kwargs = { thinking: false };

  cfg.guard?.record();

  const timeout = AbortSignal.timeout(60_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new AiError(
      `${provider} request failed: ${(err as Error).message}`,
      provider,
      undefined,
      true,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AiError(
      `${provider} returned ${res.status}: ${detail.slice(0, 400)}`,
      provider,
      res.status,
      res.status === 429 || res.status >= 500,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = stripReasoning(data.choices?.[0]?.message?.content ?? '');
  if (!text) {
    throw new AiError(`${provider} returned an empty completion`, provider, 502, true);
  }

  return {
    text,
    provider,
    model,
    latencyMs: Date.now() - started,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
  };
}

/**
 * Try the primary provider, fall back to the other one when the failure is
 * retryable (rate limit, timeout, 5xx) and fallback is enabled.
 */
export async function complete(opts: CompletionOptions): Promise<CompletionResult> {
  const order: Provider[] = opts.provider
    ? [opts.provider]
    : env.AI_PRIMARY_PROVIDER === 'nvidia'
      ? ['nvidia', 'openrouter']
      : ['openrouter', 'nvidia'];

  const candidates = env.AI_FALLBACK_ENABLED && !opts.provider ? order : order.slice(0, 1);
  const usable = candidates.filter(isConfigured);

  if (usable.length === 0) {
    throw new AiError(
      'No AI provider is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY.',
      candidates[0] ?? 'nvidia',
      503,
      false,
    );
  }

  let lastError: unknown;
  for (const provider of usable) {
    try {
      return await callProvider(provider, opts);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AiError && err.retryable;
      console.warn(`[ai] ${provider} failed: ${(err as Error).message}`);
      if (!retryable) break;
    }
  }
  throw lastError;
}

/** Parse a JSON object out of a model response, tolerating code fences and prose. */
export function parseJsonResponse<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Streaming variant. Yields text deltas as they arrive so the chat UI can render
 * a reply progressively. Falls back across providers exactly like `complete`.
 */
export async function* streamComplete(
  opts: CompletionOptions,
): AsyncGenerator<{ delta: string } | { done: true; provider: Provider; model: string }> {
  const order: Provider[] = opts.provider
    ? [opts.provider]
    : env.AI_PRIMARY_PROVIDER === 'nvidia'
      ? ['nvidia', 'openrouter']
      : ['openrouter', 'nvidia'];

  const usable = (env.AI_FALLBACK_ENABLED && !opts.provider ? order : order.slice(0, 1)).filter(
    isConfigured,
  );

  if (usable.length === 0) {
    throw new AiError(
      'No AI provider is configured. Set NVIDIA_API_KEY or OPENROUTER_API_KEY.',
      'nvidia',
      503,
      false,
    );
  }

  let lastError: unknown;

  for (const provider of usable) {
    const cfg = providers[provider];

    if (cfg.guard?.isSaturated()) {
      lastError = new AiError(`${provider} local rate limit reached`, provider, 429, true);
      continue;
    }

    const model = opts.vision ? cfg.visionModel : cfg.textModel;
    cfg.guard?.record();

    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
          ...cfg.headers,
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.3,
          max_tokens: opts.maxTokens ?? 1024,
          stream: true,
          ...(provider === 'nvidia' ? { chat_template_kwargs: { thinking: false } } : {}),
        }),
        signal: opts.signal ?? AbortSignal.timeout(90_000),
      });
    } catch (err) {
      lastError = new AiError(`${provider}: ${(err as Error).message}`, provider, undefined, true);
      continue;
    }

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      lastError = new AiError(
        `${provider} returned ${res.status}: ${detail.slice(0, 300)}`,
        provider,
        res.status,
        res.status === 429 || res.status >= 500,
      );
      if (!(res.status === 429 || res.status >= 500)) break;
      continue;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { done: true, provider, model };
          return;
        }

        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
        } catch {
          // Keep-alive comments and partial frames are expected; skip them.
        }
      }
    }

    yield { done: true, provider, model };
    return;
  }

  throw lastError ?? new AiError('All providers failed', 'nvidia', 503, false);
}
