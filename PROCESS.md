# Process overview

A reading-guide to how the work came together.

## What I built

Lane Dodge: a lane-dodging car game. Traffic is generated *from* two
independent, pre-computed "safe path" timelines rather than generated first
and hoped to leave an opening — a spawn is only ever blocked from lanes that
stay reachable no matter which of the two paths the player is actually
following. A bonus pickup reuses that same guarantee, and a difficulty ramp
speeds cars up, thickens traffic, and shortens lane-hold time over the course
of a run.

## The moment that mattered

**The problem was in my prompt, not the code.** I asked for a "batch/random"
traffic generator, and that's what I got — but playing it, cars still lined
up into walls sometimes. Nothing was actually scheduled together, it's just
that a few lanes' random timers happened to land close in time by chance. At
first I kept tweaking the same numbers and re-running it, which didn't go
anywhere, because "batch" and "random" were never specific enough for the AI
and me to land on the same picture. I only spotted the real issue
(independent lanes randomly clustering) by playing the game over and over,
not by staring at the prompt or the diff again. Once I could name it, the fix
was simple: a global anti-bunching gap (a cluster limiter), and generating
spawns from a path that's already proven reachable instead of hoping a
random roll leaves a gap.

> the batch/random generation is working in a different way than I
> thought though in the same way that word can tell

[`546cae3...fc9c5a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-StudyRem/compare/546cae3...fc9c5a5)
