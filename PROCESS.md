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

**The problem was my own prompt, not the code.** I asked for a
"batch/random" traffic generator. What came back matched those words, but
playing it showed cars still lining up into coincidental walls — nothing
was ever scheduled together, several lanes' independent timers just
happened to land close enough in time by chance. My first instinct was to
keep iterating on the same idea: tweak a number, try again. That didn't
help, because the real problem wasn't in the numbers — "batch" and
"random" never pinned down the distribution precisely enough for either
of us to land on the same thing. I only found the actual problem
(coincidental clustering across independently-timed lanes) by playing the
built game repeatedly, not by re-reading the prompt or the diff. Once I
could name it, the fix was direct: an explicit global anti-bunching floor
(a cluster limiter) plus generating spawns from a provably-reachable path
instead of hoping a random draw left an opening.

> the batch/random generation is working in a different way than I
> thought though in the same way that word can tell

[`546cae3...fc9c5a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-StudyRem/compare/546cae3...fc9c5a5)
