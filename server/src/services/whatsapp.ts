import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { assertSafeOutboundUrl } from '../middleware/security.js';

/**
 * Outbound WhatsApp messaging.
 *
 * Meta splits outbound messages in two, and the split is the reason this module
 * exists rather than a single send function:
 *
 *  - Within 24 hours of the user's last inbound message, any free-form text is
 *    allowed. This covers Zahiri's main loop: someone forwards a claim, Zahiri
 *    answers seconds later.
 *  - Outside that window, only a template approved by Meta in advance may be
 *    sent. A fact-checker finishing a review the next morning falls here.
 *
 * Sending free-form text outside the window does not warn — it fails. So the
 * window is checked before choosing how to send.
 */

const GRAPH_VERSION = 'v21.0';
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Name of the message template used for a late verdict. Create it in WhatsApp
 * Manager with two body variables: {{1}} the claim, {{2}} the verdict summary.
 */
export const LATE_VERDICT_TEMPLATE = 'zahiri_verdict_update';

export function isConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

async function postToGraph(body: Record<string, unknown>): Promise<boolean> {
  if (!isConfigured()) {
    console.warn('[whatsapp] outbound not configured, skipping send');
    return false;
  }

  const url = assertSafeOutboundUrl(
    `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    ['facebook.com'],
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error('[whatsapp] send failed:', (err as Error).message);
    return false;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[whatsapp] send rejected:', res.status, detail.slice(0, 300));
    return false;
  }
  return true;
}

/** Free-form text. Only valid inside the 24-hour window. */
export function sendText(to: string, body: string) {
  return postToGraph({
    to,
    type: 'text',
    text: { body: body.slice(0, 4000) },
  });
}

/** An approved template. The only thing deliverable outside the window. */
export function sendTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  languageCode = 'en',
) {
  return postToGraph({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [
            {
              type: 'body',
              // Template variables cannot contain newlines or run long, or Meta
              // rejects the send outright.
              parameters: bodyParams.map((text) => ({
                type: 'text',
                text: text.replace(/\s+/g, ' ').trim().slice(0, 900),
              })),
            },
          ]
        : [],
    },
  });
}

export function isWithinWindow(lastInboundAt: Date | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

/** Record an inbound message, which opens (or reopens) the 24-hour window. */
export async function noteInbound(whatsappNumber: string): Promise<void> {
  await User.updateOne(
    { whatsappNumber },
    { $set: { whatsappLastInboundAt: new Date() } },
  );
}

export interface NotifyResult {
  sent: boolean;
  method: 'text' | 'template' | 'none';
  reason?: string;
}

/**
 * Deliver a verdict to a WhatsApp user, picking the method the window allows.
 * Falls back to the template automatically rather than silently failing.
 */
export async function notifyVerdict(
  whatsappNumber: string,
  claim: string,
  summary: string,
): Promise<NotifyResult> {
  if (!isConfigured()) return { sent: false, method: 'none', reason: 'not configured' };

  const user = await User.findOne({ whatsappNumber })
    .select('whatsappLastInboundAt language')
    .lean();

  if (isWithinWindow(user?.whatsappLastInboundAt)) {
    const ok = await sendText(whatsappNumber, `${summary}\n\n— Zahiri`);
    return { sent: ok, method: 'text' };
  }

  // Outside the window: the template is the only route. If it has not been
  // approved in WhatsApp Manager yet, this send fails and says so in the logs.
  const ok = await sendTemplate(
    whatsappNumber,
    LATE_VERDICT_TEMPLATE,
    [claim.slice(0, 200), summary],
    user?.language ?? 'en',
  );

  return {
    sent: ok,
    method: 'template',
    reason: ok
      ? undefined
      : `Outside the 24-hour window and template "${LATE_VERDICT_TEMPLATE}" was not accepted. Create and get it approved in WhatsApp Manager.`,
  };
}
