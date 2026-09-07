import { useWindowDimensions } from 'react-native';

/**
 * Responsive layout for Zahiri.
 *
 * The app is phone-first, but the same code now runs in a desktop browser, on
 * tablets, and in landscape. Two rules drive everything here:
 *
 *  1. Reading content never gets wider than is comfortable. A verdict
 *     explanation stretched across 1400px is unreadable, so content is capped
 *     and centred rather than filling the viewport.
 *  2. Nothing is measured at module scope. `Dimensions.get()` at import time is
 *     captured once and never updates, so a browser resize or a device rotation
 *     leaves the layout wrong. Everything here is a hook.
 */

export const BREAKPOINTS = {
  /** Small phones (iPhone SE and similar). */
  xs: 0,
  /** Standard phones. */
  sm: 380,
  /** Large phones and small tablets in portrait. */
  md: 600,
  /** Tablets, and browser windows. */
  lg: 900,
  /** Desktop. */
  xl: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** Widest a column of text may get before it becomes hard to read. */
export const CONTENT_MAX_WIDTH = 640;
/** Auth and other single-purpose screens read better narrower still. */
export const NARROW_MAX_WIDTH = 460;

export interface Responsive {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  /** True on phone-sized viewports, where the single-column layout applies. */
  isCompact: boolean;
  /** Tablet and up: room for two columns and larger touch targets. */
  isWide: boolean;
  /** Desktop: the app is centred with generous surrounding space. */
  isDesktop: boolean;
  isLandscape: boolean;
  /** Horizontal page padding, growing with available space. */
  gutter: number;
  /** How many cards fit comfortably across. */
  columns: number;
  /** Scales a phone-tuned font size up slightly on large screens. */
  fontScale: number;
}

function breakpointFor(width: number): Breakpoint {
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const breakpoint = breakpointFor(width);

  const isCompact = width < BREAKPOINTS.md;
  const isWide = width >= BREAKPOINTS.md;
  const isDesktop = width >= BREAKPOINTS.lg;

  return {
    width,
    height,
    breakpoint,
    isCompact,
    isWide,
    isDesktop,
    isLandscape: width > height,
    // Tight on a small phone, roomier once there is space to spend.
    gutter: width < BREAKPOINTS.sm ? 16 : width < BREAKPOINTS.md ? 20 : 24,
    columns: width >= BREAKPOINTS.xl ? 3 : width >= BREAKPOINTS.md ? 2 : 1,
    // Deliberately mild. Doubling type on desktop looks like a zoomed phone.
    fontScale: width >= BREAKPOINTS.lg ? 1.08 : 1,
  };
}

/**
 * Pick a value per breakpoint, falling back down the scale. `{ xs: 1, lg: 3 }`
 * at "md" resolves to 1, because md has no entry and xs is the nearest below.
 */
export function select<T>(bp: Breakpoint, values: Partial<Record<Breakpoint, T>>): T | undefined {
  const order: Breakpoint[] = ['xl', 'lg', 'md', 'sm', 'xs'];
  const from = order.indexOf(bp);
  for (let i = from; i < order.length; i += 1) {
    const v = values[order[i]];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Round a phone-tuned size for a larger viewport. */
export function scaled(size: number, fontScale: number): number {
  return Math.round(size * fontScale * 10) / 10;
}
