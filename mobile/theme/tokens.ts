/**
 * Design tokens in TypeScript, for the places React Native needs real values
 * rather than class names: gradients, blur tints, chart fills, navigation
 * options, and animated style interpolation.
 *
 * These mirror tailwind.config.js exactly. Change both together.
 */

export const colors = {
  ink: '#0B0F14',
  inkDeep: '#070A0E',
  inkRaised: '#141A21',
  inkHigh: '#1C242E',
  inkEdge: '#263039',

  chalk: '#E8EEF4',
  chalkSoft: '#8FA3B5',
  chalkFaint: '#5C6F80',

  zahiri: '#00D68F',
  zahiriDim: '#00A46E',
  zahiriGlow: '#4DFFC3',

  info: '#6C8BFF',
} as const;

export type Verdict = 'verified' | 'false' | 'misleading' | 'unverified' | 'pending';

/**
 * The verdict language. Colour, label, and icon travel together so a verdict
 * can never be shown with the wrong colour anywhere in the app.
 */
export const VERDICT = {
  verified: {
    color: '#00D68F',
    label: 'Verified',
    short: 'TRUE',
    icon: 'checkmark-circle' as const,
    blurb: 'Checks out against what Zahiri can confirm.',
  },
  false: {
    color: '#FF4757',
    label: 'False',
    short: 'FALSE',
    icon: 'close-circle' as const,
    blurb: 'This claim does not hold up.',
  },
  misleading: {
    color: '#FF9A3C',
    label: 'Misleading',
    short: 'MISLEADING',
    icon: 'alert-circle' as const,
    blurb: 'Partly true, but framed in a way that misleads.',
  },
  unverified: {
    color: '#FFB020',
    label: 'Unverified',
    short: 'UNVERIFIED',
    icon: 'help-circle' as const,
    blurb: 'Not enough evidence either way. Treat with care.',
  },
  pending: {
    color: '#8FA3B5',
    label: 'Checking',
    short: 'CHECKING',
    icon: 'time' as const,
    blurb: 'Zahiri is still working on this.',
  },
} satisfies Record<Verdict, {
  color: string;
  label: string;
  short: string;
  icon: string;
  blurb: string;
}>;

export function verdictOf(v: string | null | undefined) {
  return VERDICT[(v as Verdict) ?? 'pending'] ?? VERDICT.pending;
}

/** Translucent version of a verdict colour, for fills and glows. */
export function alpha(hex: string, a: number): string {
  const n = Math.round(Math.max(0, Math.min(1, a)) * 255);
  return `${hex}${n.toString(16).padStart(2, '0')}`;
}

export const fonts = {
  display: 'InterTight_700Bold',
  displaySemi: 'InterTight_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Spring config used for every interactive press and card entrance. */
export const spring = {
  damping: 18,
  stiffness: 220,
  mass: 0.7,
} as const;

export const topicMeta: Record<string, { label: string; color: string }> = {
  health: { label: 'Health', color: '#00D68F' },
  education: { label: 'Education', color: '#6C8BFF' },
  civic: { label: 'Civic', color: '#B388FF' },
  local: { label: 'Local', color: '#FFB020' },
  election: { label: 'Election', color: '#FF9A3C' },
  crisis: { label: 'Crisis', color: '#FF4757' },
  general: { label: 'General', color: '#8FA3B5' },
};
