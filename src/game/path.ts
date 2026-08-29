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
    this.growUntil(tMs);
    return this.segments[this.indexAt(tMs)].lane;
  }

  /**
   * The lane(s) that must stay open for a row arriving at `tMs`. Normally
   * just the one lane the current segment holds safe --- but within
   * `marginMs` of a segment boundary, both the outgoing and incoming lane
   * are included, since the player could physically still be crossing
   * between them at that moment. This is what lets traffic keep streaming
   * continuously right through a lane change (nothing ever has to pause
   * spawning to stay safe) while still guaranteeing that any two rows close
   * enough in time to actually collide agree on at least one lane that's
   * safe for both.
   */
  safeLanesAt(tMs: number, marginMs: number): number[] {
    this.growUntil(tMs + marginMs);
    const index = this.indexAt(tMs);
    const { start, end } = this.boundsAt(index);
    const lanes = new Set<number>([this.segments[index].lane]);
    if (tMs - start < marginMs && index > 0) lanes.add(this.segments[index - 1].lane);
    if (end - tMs < marginMs && index < this.segments.length - 1) {
      lanes.add(this.segments[index + 1].lane);
    }
    return [...lanes];
  }

  private indexAt(tMs: number): number {
    let cursor = 0;
    for (let i = 0; i < this.segments.length; i++) {
      cursor += this.segments[i].durationMs;
      if (tMs < cursor) return i;
    }
    return this.segments.length - 1;
  }

  private boundsAt(index: number): { start: number; end: number } {
    let start = 0;
    for (let i = 0; i < index; i++) start += this.segments[i].durationMs;
    return { start, end: start + this.segments[index].durationMs };
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
