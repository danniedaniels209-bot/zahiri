import 'dotenv/config';
import { z } from 'zod';

const bool = (d: string) =>
  z.string().default(d).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  CORS_ORIGINS: z.string().default(''),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /**
   * Optional comma-separated DNS servers. Only needed where the system resolver
   * refuses SRV lookups (some corporate and Windows setups), which breaks the
   * mongodb+srv:// scheme. Leave empty on Render.
   */
  DNS_SERVERS: z.string().default(''),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('30d'),

  NVIDIA_API_KEY: z.string().default(''),
  NVIDIA_BASE_URL: z.string().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_TEXT_MODEL: z.string().default('meta/llama-3.3-70b-instruct'),
  NVIDIA_VISION_MODEL: z.string().default('meta/llama-3.2-90b-vision-instruct'),
  NVIDIA_RPM_LIMIT: z.coerce.number().default(40),

  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_TEXT_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  OPENROUTER_VISION_MODEL: z.string().default('google/gemini-2.0-flash-001'),

  AI_PRIMARY_PROVIDER: z.enum(['nvidia', 'openrouter']).default('nvidia'),
  AI_FALLBACK_ENABLED: bool('true'),

  WHATSAPP_VERIFY_TOKEN: z.string().default('zahiri-verify-token'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  /** Meta app secret, used to verify the X-Hub-Signature-256 on inbound webhooks. */
  WHATSAPP_APP_SECRET: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
