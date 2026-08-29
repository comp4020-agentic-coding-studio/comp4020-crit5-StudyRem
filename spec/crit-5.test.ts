import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { generateBatch } from "../src/game/spawner.ts";
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
//   is that a batch of oncoming cars always leaves at least one lane open;
//   `generateBatch` (src/game/spawner.ts) is the sole place that's enforced.
//   Collision itself stays verified by playing, per the brief's own framing:
//   a test can establish that a collision ends the round, only playing can
//   tell you whether it feels fair.
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

describe("crit 5: a batch of cars always leaves a lane open", () => {
  it("never blocks every lane, across densities and many random draws", () => {
    for (const density of [0, 0.25, 0.5, 0.75, 1, 1.5]) {
      for (let i = 0; i < 200; i++) {
        const batch = generateBatch(LANE_COUNT, density);
        expect(batch.some((blocked) => !blocked)).toBe(true);
      }
    }
  });

  it("never blocks every lane even with a rigged rng that always rolls blocked", () => {
    const batch = generateBatch(LANE_COUNT, 1, () => 0);
    expect(batch.some((blocked) => !blocked)).toBe(true);
  });
});
