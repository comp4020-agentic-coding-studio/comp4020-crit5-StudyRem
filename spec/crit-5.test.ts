import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { OperationSeries } from "../src/game/path.ts";
import { canSpawnInLane, pickBonusLane } from "../src/game/spawner.ts";
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
//   generated first and hoped to leave an opening: `canSpawnInLane`
//   (src/game/spawner.ts) never allows a spawn in whatever lane(s) the series
//   names safe, `OperationSeries.laneAt` never demands an unreachable jump,
//   and `safeLanesAt` always agrees with any other arrival close enough in
//   time to physically collide with it. Collision itself stays verified by
//   playing, per the brief's own framing: a test can establish that a
//   collision ends the round, only playing can tell you whether it feels
//   fair.
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

describe("crit 5: a car never spawns in a lane the expected path needs safe", () => {
  it("allows a spawn iff the lane isn't in the safe set, across every lane and safe-set size", () => {
    for (let a = 0; a < LANE_COUNT; a++) {
      for (let b = 0; b < LANE_COUNT; b++) {
        const safe = a === b ? [a] : [a, b];
        for (let lane = 0; lane < LANE_COUNT; lane++) {
          expect(canSpawnInLane(lane, safe)).toBe(!safe.includes(lane));
        }
      }
    }
  });
});

describe("crit 5: a bonus never spawns in a lane that isn't safe for cars too", () => {
  it("always returns a member of the safe set, across every safe-set size and rng roll", () => {
    for (let a = 0; a < LANE_COUNT; a++) {
      for (let b = 0; b < LANE_COUNT; b++) {
        const safe = a === b ? [a] : [a, b];
        for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
          expect(safe.includes(pickBonusLane(safe, () => roll))).toBe(true);
        }
      }
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

  it("safeLanesAt always shares a common lane between two arrivals close enough to collide", () => {
    // Arrivals this close together in time can have overlapping collision
    // windows at the player's row (see engine.ts's trySpawn); if two such
    // arrivals' safe-lane sets shared no lane, neither lane would actually
    // be safe against both arrivals at once.
    const marginMs = 625;
    const series = new OperationSeries(Math.floor(LANE_COUNT / 2), {
      laneCount: LANE_COUNT,
      minHoldMs: 1700,
      maxHoldMs: 2900,
    });

    const samples: { t: number; lanes: number[] }[] = [];
    for (let t = 0; t < 120_000; t += 420) {
      samples.push({ t, lanes: series.safeLanesAt(t, marginMs) });
    }

    for (let i = 1; i < samples.length; i++) {
      if (samples[i].t - samples[i - 1].t < 2 * marginMs) {
        const sharesLane = samples[i].lanes.some((lane) => samples[i - 1].lanes.includes(lane));
        expect(sharesLane).toBe(true);
      }
    }
  });
});
