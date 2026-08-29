import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// This week's spec: https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// Most of the spec is judged by a person at the crit (is the first move
// obvious, does a stranger finish in five minutes, does it hold up under a
// cold pod playtest) or depends on the mechanic we haven't picked a rule for
// yet (the one core rule's automated test, the losable/ends-somewhere state
// machine). Those come later, once the game itself exists.
//
// This is the one line checkable against the shipped markup alone, no matter
// what the mechanic turns out to be: "it teaches itself: no instructions
// anywhere, on screen or off."
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
