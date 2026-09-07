export type Provider = 'nvidia' | 'openrouter';

export type ChatRole = 'system' | 'user' | 'assistant';

export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image_url'; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[];
}

export interface CompletionOptions {
  messages: ChatMessage[];
  /** Ask for the vision-capable model instead of the text model. */
  vision?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Force the model to answer with a single JSON object. */
  json?: boolean;
  /** Override automatic provider selection. */
  provider?: Provider;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  provider: Provider;
  model: string;
  latencyMs: number;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly provider: Provider,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
