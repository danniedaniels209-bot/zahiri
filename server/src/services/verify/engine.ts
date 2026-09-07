import { complete, parseJsonResponse } from '../ai/client.js';
import type { ChatMessage } from '../ai/types.js';
import { Verification } from '../../models/Verification.js';
import { claimVerificationPrompt, deepfakePrompt, linkAnalysisPrompt } from './prompts.js';
import { extractDomain, findUrls, recordOutcome, scoreDomain } from './reputation.js';
import { inspectProvenance, type ProvenanceResult } from './provenance.js';
import {
  fenceUntrusted,
  logSecurityEvent,
  sanitiseForPrompt,
} from '../../middleware/security.js';

export type Verdict = 'verified' | 'false' | 'misleading' | 'unverified' | 'pending';
export type EntryPoint =
  | 'app_chat'
  | 'whatsapp'
  | 'facebook'
  | 'linkedin'
  | 'hub'
  | 'api'
  | 'crisis_desk';

const VALID_VERDICTS = new Set(['verified', 'false', 'misleading', 'unverified']);

function normalizeVerdict(v: unknown): Verdict {
  return typeof v === 'string' && VALID_VERDICTS.has(v) ? (v as Verdict) : 'unverified';
}

function clampScore(n: unknown, fallback = 0): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

interface EngineContext {
  userId?: string | null;
  entryPoint?: EntryPoint;
  language?: string;
  persist?: boolean;
}

interface ClaimJson {
  verdict?: string;
  confidence?: number;
  explanation?: string;
  reasoning?: string;
  evidence?: { title?: string; url?: string; publisher?: string; note?: string }[];
  needsHumanReview?: boolean;
  topic?: string;
  domainAssessment?: string;
  contentFarmIndicators?: string[];
}

/**
 * Text and link verification. Any URL in the claim is scored against the source
 * reputation collection first, and that score is handed to the model as context
 * rather than left for it to guess at.
 */
export async function verifyClaim(rawClaim: string, ctx: EngineContext = {}) {
  const sanitised = sanitiseForPrompt(rawClaim.trim());
  if (sanitised.suspicious) {
    logSecurityEvent('injection.detected', {
      surface: 'verifyClaim',
      entryPoint: ctx.entryPoint ?? 'app_chat',
      patterns: sanitised.patterns,
    });
  }
  const claim = sanitised.text;
  const language = ctx.language ?? 'en';
  const urls = findUrls(claim);
  const isLink = urls.length > 0 || /^https?:\/\//i.test(claim);

  const domain = urls[0] ? extractDomain(urls[0]) : null;
  const reputation = domain ? await scoreDomain(domain) : null;

  const contextLines: string[] = [];
  if (reputation) {
    contextLines.push(
      reputation.known
        ? `Zahiri source reputation for ${reputation.domain}: score ${reputation.score}/100, band "${reputation.band}"${
            reputation.aiContentFarm ? ', flagged as a confirmed AI content farm' : ''
          }${reputation.isWatchlisted ? ', on the watchlist' : ''}. ${reputation.note}`
        : `Zahiri has no reputation record for ${reputation.domain}. Treat the domain as unknown, not as trustworthy.`,
    );
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: isLink ? linkAnalysisPrompt(language) : claimVerificationPrompt(language),
    },
    {
      role: 'user',
      // The claim is fenced so the model treats it as material to judge rather
      // than as instructions addressed to it.
      content: contextLines.length
        ? `${contextLines.join('\n')}\n\nContent to check:\n${fenceUntrusted(claim)}`
        : `Content to check:\n${fenceUntrusted(claim)}`,
    },
  ];

  const result = await complete({ messages, json: true, temperature: 0.1, maxTokens: 900 });
  const parsed = parseJsonResponse<ClaimJson>(result.text);

  let verdict = normalizeVerdict(parsed?.verdict);
  let confidence = clampScore(parsed?.confidence, 40);
  const explanation =
    parsed?.explanation?.trim() ||
    'Zahiri could not produce a clear reading of this claim. It has been logged for a human fact-checker.';

  // A confirmed content farm caps how much confidence a "verified" verdict can carry.
  if (reputation?.aiContentFarm && verdict === 'verified') {
    verdict = 'misleading';
    confidence = Math.min(confidence, 50);
  }

  const needsHumanReview =
    parsed?.needsHumanReview === true || confidence < 55 || verdict === 'unverified';

  const doc = {
    user: ctx.userId ?? null,
    entryPoint: ctx.entryPoint ?? 'app_chat',
    inputType: isLink ? ('link' as const) : ('text' as const),
    claim,
    sourceUrl: urls[0] ?? null,
    verdict,
    confidence,
    explanation,
    evidence: (parsed?.evidence ?? [])
      .filter((e) => e && (e.title || e.url))
      .slice(0, 6)
      .map((e) => ({
        title: e.title ?? '',
        url: e.url ?? '',
        publisher: e.publisher ?? '',
        note: e.note ?? '',
      })),
    signals: {
      deepfake: { checked: false, score: null, indicators: [] as string[] },
      provenance: { checked: false, hasCredentials: false, issuer: null as string | null },
      sourceReputation: {
        checked: Boolean(reputation),
        domain: reputation?.domain ?? null,
        score: reputation?.score ?? null,
      },
    },
    humanReview: {
      required: needsHumanReview,
      status: needsHumanReview ? ('queued' as const) : ('not_needed' as const),
      reviewer: null,
      notes: '',
      decidedAt: null,
    },
    aiProvider: result.provider,
    aiModel: result.model,
    latencyMs: result.latencyMs,
    language,
  };

  if (domain) await recordOutcome(domain, verdict);

  const saved = ctx.persist === false ? null : await Verification.create(doc);

  return {
    ...doc,
    id: saved?._id?.toString() ?? null,
    reputation,
    contentFarmIndicators: parsed?.contentFarmIndicators ?? [],
    domainAssessment: parsed?.domainAssessment ?? null,
  };
}

interface DeepfakeJson {
  syntheticScore?: number;
  verdict?: string;
  confidence?: number;
  indicators?: string[];
  explanation?: string;
  needsHumanReview?: boolean;
}

/**
 * Deepfake & synthetic media detection. Images go to the vision model directly.
 * Video and audio are checked on provenance plus any description the user gives,
 * and the result says plainly what could not be inspected.
 */
export async function verifyMedia(
  buffer: Buffer,
  mimeType: string,
  opts: { description?: string; filename?: string } & EngineContext = {},
) {
  const language = opts.language ?? 'en';
  const kind: 'image' | 'video' | 'audio' = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('video/')
      ? 'video'
      : 'audio';

  const provenance: ProvenanceResult = inspectProvenance(buffer);

  const contextLines = [
    `File type: ${mimeType}`,
    `File size: ${(buffer.length / 1024).toFixed(0)} KB`,
    `Provenance scan: ${provenance.summary}`,
  ];
  if (provenance.generatorHints.length) {
    contextLines.push(
      `Generator strings found in metadata: ${provenance.generatorHints.join(', ')}`,
    );
  }
  if (opts.description) {
    contextLines.push(
      `What the user says about it: ${fenceUntrusted(sanitiseForPrompt(opts.description, 1000).text)}`,
    );
  }

  const messages: ChatMessage[] = [{ role: 'system', content: deepfakePrompt(kind, language) }];

  if (kind === 'image') {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: contextLines.join('\n') },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}` },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: contextLines.join('\n') });
  }

  const result = await complete({
    messages,
    vision: kind === 'image',
    json: true,
    temperature: 0.1,
    maxTokens: 800,
  });
  const parsed = parseJsonResponse<DeepfakeJson>(result.text);

  let syntheticScore = clampScore(parsed?.syntheticScore, 50);
  const indicators = (parsed?.indicators ?? []).filter(Boolean).slice(0, 10);

  // A generator string in the metadata is hard evidence and outranks the model's guess.
  if (provenance.generatorHints.length) {
    syntheticScore = Math.max(syntheticScore, 85);
    indicators.unshift(`Metadata names a generative tool: ${provenance.generatorHints.join(', ')}`);
  }

  let verdict = normalizeVerdict(parsed?.verdict);
  if (syntheticScore >= 75) verdict = 'false';
  else if (syntheticScore >= 55) verdict = 'misleading';
  else if (syntheticScore <= 25 && provenance.hasCredentials) verdict = 'verified';

  const confidence =
    kind === 'audio'
      ? Math.min(clampScore(parsed?.confidence, 30), 60)
      : clampScore(parsed?.confidence, 45);

  const needsHumanReview =
    parsed?.needsHumanReview === true ||
    confidence < 60 ||
    (syntheticScore > 35 && syntheticScore < 70);

  const explanation =
    parsed?.explanation?.trim() ||
    'Zahiri could not reach a clear reading on this file. It has been sent to a human fact-checker.';

  const doc = {
    user: opts.userId ?? null,
    entryPoint: opts.entryPoint ?? 'app_chat',
    inputType: kind,
    claim: opts.description ?? '',
    sourceUrl: null,
    mediaRef: opts.filename ?? null,
    verdict,
    confidence,
    explanation,
    evidence: [],
    signals: {
      deepfake: { checked: true, score: syntheticScore, indicators },
      provenance: {
        checked: true,
        hasCredentials: provenance.hasCredentials,
        issuer: provenance.issuer,
      },
      sourceReputation: {
        checked: false,
        domain: null as string | null,
        score: null as number | null,
      },
    },
    humanReview: {
      required: needsHumanReview,
      status: needsHumanReview ? ('queued' as const) : ('not_needed' as const),
      reviewer: null,
      notes: '',
      decidedAt: null,
    },
    aiProvider: result.provider,
    aiModel: result.model,
    latencyMs: result.latencyMs,
    language,
  };

  const saved = opts.persist === false ? null : await Verification.create(doc);

  return { ...doc, id: saved?._id?.toString() ?? null, provenance };
}
