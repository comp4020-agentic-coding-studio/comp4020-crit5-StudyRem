import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { OperationSeries } from "../src/game/path.ts";
import { rowLanes } from "../src/game/spawner.ts";
import { LANE_COUNT } from "../src/game/types.ts";

// This week's spec: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// Most of the spec is judged by a person at the crit (is the first move
// obvious, does a stranger finish in five minutes, does it hold up under a
// cold pod playtest). Two lines are mechanically checkable:
//
// - "it teaches itself: no instructions anywhere, on screen or off" ---
//   checked against the shipped markup.
// - "one rule of the game has a focused automated test" --- this game's rule
//   is that traffic is generated *from* a pre-generated, guaranteed-reachable
//   safe path (the "expected operation series", src/game/path.ts) rather than
//   generated first and hoped to leave an opening: `rowLanes`
//   (src/game/spawner.ts) never blocks whatever lane the series names safe,
//   and `OperationSeries.laneAt` never demands an unreachable jump. Collision
//   itself stays verified by playing, per the brief's own framing: a test can
//   establish that a collision ends the round, only playing can tell you
//   whether it feels fair.
const DIST = resolve("dist");
const doc = new JSDOM(readFileSync(join(DIST, "index.html"), "utf8")).window.document;

describe("crit 5: no instructions anywhere on screen", () => {
  it("has no modal or dialog element", () => {
    expect(doc.querySelector("dialog")).toBeNull();
    expect(doc.querySelectorAll('[role="dialog"]').length).toBe(0);
  });

  it("has no element that reads as help/instructions/tutorial", () => {
    const suspects = ["help", "instructions", "tutorial", "how-to-play", "howtoplay"];
    for (const el of doc.querySelectorAll("[id], [class]")) {
      const haystack = `${el.id} ${el.className}`.toLowerCase();
      for (const word of suspects) {
        expect(
          haystack.includes(word),
          `<${el.tagName.toLowerCase()} id="${el.id}" class="${el.className}"> reads as an instructions element`,
        ).toBe(false);
      }
    }
  });
});

describe("crit 5: traffic never blocks the expected safe lane", () => {
  it("never blocks the safe lane, across densities, every lane, and many random draws", () => {
    for (const density of [0, 0.25, 0.5, 0.75, 1, 1.5]) {
      for (let safeLane = 0; safeLane < LANE_COUNT; safeLane++) {
        for (let i = 0; i < 50; i++) {
          const row = rowLanes(LANE_COUNT, safeLane, density);
          expect(row[safeLane]).toBe(false);
        }
      }
    }
  });

  it("never blocks the safe lane even with a rigged rng that always rolls blocked", () => {
    for (let safeLane = 0; safeLane < LANE_COUNT; safeLane++) {
      const row = rowLanes(LANE_COUNT, safeLane, 1, () => 0);
      expect(row[safeLane]).toBe(false);
    }
  });
});

describe("crit 5: the expected operation series is always reachable", () => {
  it("only ever moves one lane at a time and stays on the road", () => {
    const startLane = Math.floor(LANE_COUNT / 2);
    const series = new OperationSeries(startLane, {
      laneCount: LANE_COUNT,
      minHoldMs: 200,
      maxHoldMs: 400,
    });

    let previousLane = startLane;
    for (let t = 0; t < 60_000; t += 50) {
      const lane = series.laneAt(t);
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(LANE_COUNT);
      expect(Math.abs(lane - previousLane)).toBeLessThanOrEqual(1);
      previousLane = lane;
    }
  });

  it("stableLaneAt never disagrees between two arrivals close enough to collide", () => {
    // Rows this close together in arrival time can have overlapping
    // collision windows at the player's row (see engine.ts's spawnRow); if
    // stableLaneAt returned non-null for both but named different lanes,
    // neither lane would actually be safe against both rows at once.
    const marginMs = 625;
    const series = new OperationSeries(Math.floor(LANE_COUNT / 2), {
      laneCount: LANE_COUNT,
      minHoldMs: 2200,
      maxHoldMs: 3400,
    });

    const samples: { t: number; lane: number }[] = [];
    for (let t = 0; t < 120_000; t += 420) {
      const lane = series.stableLaneAt(t, marginMs);
      if (lane !== null) samples.push({ t, lane });
    }

    for (let i = 1; i < samples.length; i++) {
      if (samples[i].t - samples[i - 1].t < 2 * marginMs) {
        expect(samples[i].lane).toBe(samples[i - 1].lane);
      }
    }
  });
});
