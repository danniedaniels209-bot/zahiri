import { SourceReputation } from '../../models/SourceReputation.js';

/** Pull a bare hostname out of anything a user might paste. */
export function extractDomain(input: string): string | null {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function findUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  return [...new Set(matches)];
}

export function bandForScore(score: number, aiContentFarm: boolean) {
  if (aiContentFarm) return 'content_farm' as const;
  if (score >= 75) return 'trusted' as const;
  if (score >= 45) return 'mixed' as const;
  return 'low' as const;
}

/**
 * Look a domain up in the reputation collection. Unknown domains come back as a
 * neutral, explicitly-unknown record rather than being invented.
 */
export async function scoreDomain(domain: string) {
  const record = await SourceReputation.findOne({ domain }).lean();

  if (!record) {
    return {
      domain,
      known: false,
      score: 50,
      band: 'mixed' as const,
      isWatchlisted: false,
      aiContentFarm: false,
      note: 'This source is not yet in the Zahiri reputation database.',
    };
  }

  return {
    domain,
    known: true,
    score: record.score,
    band: record.band,
    isWatchlisted: record.isWatchlisted,
    aiContentFarm: record.aiContentFarm,
    note: record.notes || '',
  };
}

/** Fold a finished verdict back into the domain's running accuracy record. */
export async function recordOutcome(domain: string, verdict: string) {
  const isFalse = verdict === 'false' || verdict === 'misleading';

  const doc = await SourceReputation.findOneAndUpdate(
    { domain },
    {
      $inc: { checksTotal: 1, checksFalse: isFalse ? 1 : 0 },
      $set: { lastEvaluatedAt: new Date() },
      $setOnInsert: { domain },
    },
    { upsert: true, new: true },
  );

  if (!doc) return null;

  // Score is the share of checks that did not come back false, smoothed so a
  // single bad check cannot sink a domain outright.
  const total = doc.checksTotal || 1;
  const accuracy = 1 - doc.checksFalse / total;
  const smoothed = (accuracy * total + 0.5 * 5) / (total + 5);
  doc.score = Math.round(smoothed * 100);
  doc.band = bandForScore(doc.score, doc.aiContentFarm);
  await doc.save();

  return doc;
}
