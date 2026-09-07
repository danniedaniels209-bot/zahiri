import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { asyncRoute, HttpError } from '../middleware/error.js';
import { optionalAuth, type AuthedRequest } from '../middleware/auth.js';
import { verifyLimiter } from '../middleware/rateLimit.js';
import { verifyClaim, verifyMedia } from '../services/verify/engine.js';
import { User } from '../models/User.js';
import {
  assertSafeOutboundUrl,
  logSecurityEvent,
  timingSafeEqual,
  validateUpload,
  verifyMetaSignature,
} from '../middleware/security.js';
import { noteInbound, sendText as sendWhatsAppText } from '../services/whatsapp.js';

const router = Router();

/** Cap on media pulled from WhatsApp, matching the in-app upload limit. */
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

const VERDICT_LABEL: Record<string, string> = {
  verified: '✅ VERIFIED',
  false: '❌ FALSE',
  misleading: '⚠️ MISLEADING',
  unverified: '❓ COULD NOT VERIFY',
  pending: '⏳ PENDING',
};

/** The reply the user sees back in their own chat thread. */
function formatVerdict(result: {
  verdict: string;
  confidence: number;
  explanation: string;
  humanReview: { required: boolean };
}) {
  const lines = [
    `${VERDICT_LABEL[result.verdict] ?? result.verdict} — ${result.confidence}% confidence`,
    '',
    result.explanation,
  ];
  if (result.humanReview.required) {
    lines.push('', '👤 A human fact-checker is reviewing this. You will get an update.');
  }
  lines.push('', '— Zahiri · Verified Information, Empowered Minds');
  return lines.join('\n');
}

/** Download a media file the user forwarded, via the Cloud API two-step. */
async function fetchWhatsAppMedia(mediaId: string) {
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!metaRes.ok) return null;

  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  // The download URL comes back from Meta's API, so it is not ours. Confirm it
  // still points at a public Facebook host before fetching it.
  let safeUrl: URL;
  try {
    safeUrl = assertSafeOutboundUrl(meta.url, ['fbcdn.net', 'facebook.com', 'whatsapp.net']);
  } catch (err) {
    console.error('[whatsapp] refused media URL:', (err as Error).message);
    return null;
  }

  const fileRes = await fetch(safeUrl, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!fileRes.ok) return null;

  const declared = Number(fileRes.headers.get('content-length') ?? 0);
  if (declared > MAX_MEDIA_BYTES) {
    console.warn('[whatsapp] media too large, skipping');
    return null;
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) return null;

  return { buffer, mimeType: meta.mime_type ?? 'application/octet-stream' };
}

/** Meta's webhook handshake. */
router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && typeof token === 'string' && timingSafeEqual(token, env.WHATSAPP_VERIFY_TOKEN)) {
    return res.status(200).send(String(challenge ?? ''));
  }
  res.sendStatus(403);
});

/**
 * Inbound WhatsApp messages. Meta retries anything that is not acknowledged
 * quickly, so this returns 200 immediately and does the verification after.
 */
router.post('/whatsapp/webhook', verifyMetaSignature(env.WHATSAPP_APP_SECRET), (req, res) => {
  res.sendStatus(200);

  void (async () => {
    try {
      const entries = req.body?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          for (const message of change.value?.messages ?? []) {
            const from: string = message.from;

            // An inbound message opens a 24-hour window in which Zahiri may
            // reply freely. Record it so a later fact-checker verdict knows
            // whether it can send text or must use an approved template.
            await noteInbound(from);

            const user = await User.findOne({ whatsappNumber: from })
              .select('_id language')
              .lean();

            const ctx = {
              userId: user?._id?.toString() ?? null,
              entryPoint: 'whatsapp' as const,
              language: user?.language ?? 'en',
            };

            let reply: string;

            if (message.type === 'text') {
              const result = await verifyClaim(message.text.body, ctx);
              reply = formatVerdict(result);
            } else if (['image', 'video', 'audio'].includes(message.type)) {
              const mediaId = message[message.type]?.id;
              const media = mediaId ? await fetchWhatsAppMedia(mediaId) : null;

              if (!media) {
                reply = 'Zahiri could not download that file. Please try sending it again.';
              } else {
                const check = validateUpload(media.buffer, media.mimeType);
                if (!check.ok) {
                  logSecurityEvent('upload.rejected', {
                    surface: 'whatsapp',
                    reason: check.reason,
                  });
                  await sendWhatsAppText(from, `Zahiri could not read that file. ${check.reason}`);
                  continue;
                }

                const result = await verifyMedia(media.buffer, media.mimeType, {
                  ...ctx,
                  description: message[message.type]?.caption,
                });
                const score = result.signals.deepfake.score;
                reply = `${formatVerdict(result)}\n\nAI-generation likelihood: ${score}%`;
              }
            } else {
              reply =
                'Send Zahiri a message, link, image, video, or voice note and it will check it for you.';
            }

            await sendWhatsAppText(from, reply);
          }
        }
      }
    } catch (err) {
      console.error('[whatsapp] processing error:', err);
    }
  })();
});

/**
 * Share-to-Zahiri from Facebook, LinkedIn, or the OS share sheet. Same engine,
 * same verdict shape, just a different way in.
 */
router.post(
  '/share',
  verifyLimiter,
  optionalAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        content: z.string().min(3).max(4000),
        platform: z.enum(['facebook', 'linkedin', 'whatsapp', 'other']).default('other'),
        language: z.string().default('en'),
      })
      .parse(req.body);

    const entryPoint =
      body.platform === 'facebook'
        ? ('facebook' as const)
        : body.platform === 'linkedin'
          ? ('linkedin' as const)
          : body.platform === 'whatsapp'
            ? ('whatsapp' as const)
            : ('app_chat' as const);

    const result = await verifyClaim(body.content, {
      userId: req.userId ?? null,
      language: body.language,
      entryPoint,
    });

    res.json({ ...result, shareText: formatVerdict(result) });
  }),
);

/** Link a WhatsApp number to an account so forwarded checks land in the user's history. */
router.post(
  '/whatsapp/link',
  optionalAuth,
  asyncRoute(async (req: AuthedRequest, res) => {
    if (!req.userId) throw new HttpError(401, 'Sign in to link your WhatsApp number');

    const body = z
      .object({ number: z.string().regex(/^\d{10,15}$/, 'Use digits only, including country code') })
      .parse(req.body);

    const taken = await User.findOne({ whatsappNumber: body.number, _id: { $ne: req.userId } }).lean();
    if (taken) throw new HttpError(409, 'That number is already linked to another account');

    await User.findByIdAndUpdate(req.userId, { $set: { whatsappNumber: body.number } });
    res.json({ linked: true, number: body.number });
  }),
);

export default router;
