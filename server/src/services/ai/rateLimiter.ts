/**
 * Sliding-window request counter used to stay under a provider's RPM ceiling
 * before we ever hit the network. The NVIDIA build.nvidia.com free tier is the
 * reason this exists.
 */
export class RpmGuard {
  private hits: number[] = [];

  constructor(private readonly limit: number) {}

  private prune(now: number) {
    const cutoff = now - 60_000;
    while (this.hits.length && this.hits[0] < cutoff) this.hits.shift();
  }

  /** True when another request would exceed the ceiling right now. */
  isSaturated(): boolean {
    const now = Date.now();
    this.prune(now);
    return this.hits.length >= this.limit;
  }

  record(): void {
    this.hits.push(Date.now());
  }

  /** Milliseconds until a slot frees up, or 0 if one is free now. */
  msUntilFree(): number {
    const now = Date.now();
    this.prune(now);
    if (this.hits.length < this.limit) return 0;
    return Math.max(0, this.hits[0] + 60_000 - now);
  }

  remaining(): number {
    this.prune(Date.now());
    return Math.max(0, this.limit - this.hits.length);
  }
}
