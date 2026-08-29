// The expected operation series: a pre-generated timeline of which lane is
// "safe" at any given moment, respecting real movement constraints (only
// adjacent-lane moves, each held long enough to be noticed and executed).
// Traffic (see spawner.ts) is generated *from* this timeline, rather than
// generated first and hoped to leave an opening --- so the series is what
// actually guarantees the game is always solvable.

export interface PathConfig {
  laneCount: number;
  /** Minimum/maximum milliseconds a lane is held safe before the next move. */
  minHoldMs: number;
  maxHoldMs: number;
}

interface Segment {
  lane: number;
  durationMs: number;
}

export class OperationSeries {
  private segments: Segment[] = [];
  private totalMs = 0;

  constructor(
    startLane: number,
    private config: PathConfig,
    private rng: () => number = Math.random,
  ) {
    this.append(startLane);
  }

  /** The lane the expected path holds safe at time `tMs`. */
  laneAt(tMs: number): number {
    return this.segmentAt(tMs).lane;
  }

  /**
   * The lane the path holds safe at `tMs`, or `null` if `tMs` falls within
   * `marginMs` of that segment's start or end. Two arrivals that are each
   * `marginMs` or more from a boundary --- on the same side or opposite
   * sides of it --- are always at least `2*marginMs` apart, which is what
   * lets a caller pick `marginMs` to guarantee any two non-null results
   * close enough in time to physically collide always agree on the lane.
   */
  stableLaneAt(tMs: number, marginMs: number): number | null {
    const { lane, start, end } = this.segmentAt(tMs, marginMs);
    if (tMs - start < marginMs || end - tMs < marginMs) return null;
    return lane;
  }

  private segmentAt(tMs: number, lookahead = 0): { lane: number; start: number; end: number } {
    this.growUntil(tMs + lookahead);
    let cursor = 0;
    for (const segment of this.segments) {
      const start = cursor;
      cursor += segment.durationMs;
      if (tMs < cursor) return { lane: segment.lane, start, end: cursor };
    }
    const last = this.segments[this.segments.length - 1];
    return { lane: last.lane, start: this.totalMs - last.durationMs, end: this.totalMs };
  }

  private growUntil(tMs: number): void {
    while (this.totalMs <= tMs) {
      const lastLane = this.segments[this.segments.length - 1].lane;
      const options = [lastLane];
      if (lastLane > 0) options.push(lastLane - 1);
      if (lastLane < this.config.laneCount - 1) options.push(lastLane + 1);
      this.append(options[Math.floor(this.rng() * options.length)]);
    }
  }

  private append(lane: number): void {
    const { minHoldMs, maxHoldMs } = this.config;
    const durationMs = minHoldMs + this.rng() * (maxHoldMs - minHoldMs);
    this.segments.push({ lane, durationMs });
    this.totalMs += durationMs;
  }
}
