/**
 * Provenance & Content-Credential checker.
 *
 * This inspects the raw bytes of an upload for the markers that C2PA / Content
 * Credentials leave behind (a JUMBF box carrying a `c2pa` manifest), plus XMP and
 * EXIF blocks. It reports what is present; it does not cryptographically validate
 * the manifest chain, and it says so in the result rather than implying it did.
 */

export interface ProvenanceResult {
  hasCredentials: boolean;
  issuer: string | null;
  markers: string[];
  hasExif: boolean;
  hasXmp: boolean;
  generatorHints: string[];
  /** True only when a signature chain was actually validated. Always false here. */
  cryptographicallyVerified: boolean;
  summary: string;
}

/** Software strings that identify a generative tool when left in metadata. */
const GENERATOR_PATTERNS: [RegExp, string][] = [
  [/dall[\s-]?e/i, 'DALL-E'],
  [/midjourney/i, 'Midjourney'],
  [/stable[\s-]?diffusion/i, 'Stable Diffusion'],
  [/firefly/i, 'Adobe Firefly'],
  [/\bimagen\b/i, 'Google Imagen'],
  [/\bsora\b/i, 'OpenAI Sora'],
  [/runway(?:ml)?/i, 'Runway'],
  [/leonardo\.ai/i, 'Leonardo.ai'],
  [/\bflux\b/i, 'FLUX'],
  [/\bveo\b/i, 'Google Veo'],
  [/elevenlabs/i, 'ElevenLabs'],
];

function findAscii(buf: Buffer, needle: string): boolean {
  return buf.includes(Buffer.from(needle, 'ascii'));
}

export function inspectProvenance(buf: Buffer): ProvenanceResult {
  const markers: string[] = [];

  // C2PA manifests live in a JUMBF box; the box type and the claim namespace are
  // both plain ASCII inside the file.
  const hasJumbf = findAscii(buf, 'jumb') || findAscii(buf, 'jumd');
  const hasC2pa = findAscii(buf, 'c2pa') || findAscii(buf, 'urn:uuid:c2pa');
  const hasCai = findAscii(buf, 'contentauth') || findAscii(buf, 'cai_store');

  if (hasJumbf) markers.push('JUMBF box');
  if (hasC2pa) markers.push('C2PA claim');
  if (hasCai) markers.push('Content Authenticity Initiative store');

  const hasXmp = findAscii(buf, 'http://ns.adobe.com/xap/1.0/') || findAscii(buf, 'x:xmpmeta');
  const hasExif = findAscii(buf, 'Exif\0\0') || findAscii(buf, 'Exif');
  if (hasXmp) markers.push('XMP metadata');
  if (hasExif) markers.push('EXIF metadata');

  // Only scan a bounded prefix as text: metadata sits near the front of the file
  // and decoding megabytes of pixel data as latin1 is wasted work.
  const head = buf.subarray(0, Math.min(buf.length, 512 * 1024)).toString('latin1');

  const generatorHints = GENERATOR_PATTERNS.filter(([re]) => re.test(head)).map(([, name]) => name);

  let issuer: string | null = null;
  const issuerMatch =
    head.match(/"claim_generator"\s*:\s*"([^"]{1,120})"/i) ??
    head.match(/claim_generator["\s:]+([A-Za-z0-9._\- /]{3,80})/i) ??
    head.match(/<xmp:CreatorTool>([^<]{1,120})<\/xmp:CreatorTool>/i) ??
    head.match(/<tiff:Software>([^<]{1,120})<\/tiff:Software>/i);
  if (issuerMatch) issuer = issuerMatch[1].trim();

  const hasCredentials = hasC2pa || hasCai;

  let summary: string;
  if (hasCredentials) {
    summary = issuer
      ? `This file carries Content Credentials naming "${issuer}" as the tool that made or last edited it. Zahiri detected the credential but did not validate its signature.`
      : 'This file carries Content Credentials, but the issuing tool could not be read. Zahiri detected the credential but did not validate its signature.';
  } else if (generatorHints.length) {
    summary = `No Content Credentials found, but the file's metadata mentions ${generatorHints.join(', ')}, which suggests it was AI-generated or AI-edited.`;
  } else if (hasExif || hasXmp) {
    summary =
      'No Content Credentials found. The file has ordinary camera or editor metadata, which neither proves nor disproves authenticity.';
  } else {
    summary =
      'No Content Credentials and no metadata at all. This is normal for files re-shared through WhatsApp or Facebook, which strip metadata, so it is not evidence of tampering on its own.';
  }

  return {
    hasCredentials,
    issuer,
    markers,
    hasExif,
    hasXmp,
    generatorHints,
    cryptographicallyVerified: false,
    summary,
  };
}
