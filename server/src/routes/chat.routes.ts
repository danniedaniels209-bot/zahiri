import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthedRequest } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/error.js';
import { verifyLimiter } from '../middleware/rateLimit.js';
import { complete, providerStatus, streamComplete } from '../services/ai/client.js';
import type { ChatMessage } from '../services/ai/types.js';
import { chatSystemPrompt } from '../services/verify/prompts.js';
import { verifyClaim } from '../services/verify/engine.js';
import { User } from '../models/User.js';

const router = Router();

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  language: z.string().default('en'),
  /** When true, the last user message is also run through the verification engine. */
  verify: z.boolean().default(false),
});

async function buildMessages(req: AuthedRequest, body: z.infer<typeof chatSchema>) {
  let name: string | undefined;
  if (req.userId) {
    const user = await User.findById(req.userId).select('name language').lean();
    name = user?.name;
    if (user?.language && body.language === 'en') body.language = user.language;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: chatSystemPrompt(body.language, name) },
    ...body.messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];
  return messages;
}

/** Non-streaming chat. */
router.post(
  '/',
  verifyLimiter,
  optionalAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = chatSchema.parse(req.body);
    const messages = await buildMessages(req, body);

    const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');

    const [reply, verification] = await Promise.all([
      complete({ messages, temperature: 0.15, maxTokens: 700 }),
      body.verify && lastUser
        ? verifyClaim(lastUser.content, {
            userId: req.userId ?? null,
            language: body.language,
            entryPoint: 'app_chat',
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    res.json({
      reply: reply.text,
      provider: reply.provider,
      model: reply.model,
      latencyMs: reply.latencyMs,
      verification,
    });
  }),
);

/** Streaming chat over Server-Sent Events. */
router.post(
  '/stream',
  verifyLimiter,
  optionalAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = chatSchema.parse(req.body);
    const messages = await buildMessages(req, body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const chunk of streamComplete({
        messages,
        temperature: 0.15,
        maxTokens: 700,
        signal: controller.signal,
      })) {
        if ('delta' in chunk) send('delta', { text: chunk.delta });
        else send('done', { provider: chunk.provider, model: chunk.model });
      }
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      res.end();
    }
  }),
);

/** Which providers are wired up and how much headroom is left on each. */
router.get('/providers', (_req, res) => {
  res.json({ providers: providerStatus() });
});

export default router;
