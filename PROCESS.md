# Process overview

A reading-guide to how the work came together.

## What I built

Lane Dodge: a lane-dodging car game where the safety of the round is
guaranteed by construction rather than caught after the fact — traffic is
generated *from* two independent, pre-generated "expected path" timelines
that each prove their own lane is always reachable, and a spawn is only ever
allowed outside the union of both paths' currently-safe lanes. A bonus pickup
reuses that identical guarantee (it only ever spawns where a car also could),
and a difficulty ramp speeds up, densifies, and shortens lane-hold time over
the course of a run.

## The moments that mattered

1. **The traffic generator matched my words, not my intent.** I asked for
   traffic that spawned in independent, randomly-timed batches per lane —
   what came back technically did that, but playing it showed cars lining up
   into coincidental walls anyway, since nothing stopped several lanes'
   independent timers landing close together by chance. Instead of accepting
   "the code does what I asked" as done, I iterated through several
   different generation strategies — staggered mini-waves, then generating
   spawns from a provably-reachable expected path instead of hoping a random
   draw left an opening, then independent per-lane real-time timers, then
   finally an explicit global anti-bunching floor once even independent
   timers still coincided occasionally. I only knew each attempt was actually
   right by playing the built game repeatedly, not by re-reading the prompt
   or the diff — "random"/"batch" never pinned down the distribution I
   actually wanted precisely enough for either of us to check it any other
   way.

   > the batch/random generation is working in a different way than I
   > thought though in the same way that word can tell

   [`546cae3...fc9c5a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-StudyRem/compare/546cae3...fc9c5a5)

2. **Iteration and a research subagent weren't the fix — finding the real
   problem was.** The first difficulty ramp (linear, 90s, +40-50% on speed
   and density) was bot-verified as mechanically correct, but playing it
   still felt too easy. A few direct retuning passes on those same three
   numbers didn't move the verdict, and pointing a research subagent at "why
   does this feel easy" on its own wouldn't have been enough either — the
   actual turn was recognizing the real problem wasn't something I could
   name from the outset. It took the subagent's survey of shipped dodge-game
   design (curves are front-loaded, not linear) plus a diagnosis specific to
   this engine (two fixed 130ms constants were silently capping how hard the
   other three knobs could ever push) before I could describe the problem
   precisely enough to decide a direction: switch to a front-loaded curve,
   steepen the deltas, and ramp the two constants down too. Bot-sim then
   confirmed the redesign is safe and measurably steeper/earlier (avg speed
   already 394.7px/s by t=10s vs. a 300 base, plateauing at 560 by t=60-70s,
   0 crashes across 50 combined trials) — but that only confirms mechanical
   correctness, not the feel; that verdict is still a playtest away. See
   `reflections/crit-5.md` for the same thread from the other side.

   > still feel too easy to me, get a sub-agent to deeply research such game
   > design, and see if there's relevant open-source projects and how they
   > design their dodging game.

   [`a3c63c8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-StudyRem/commit/a3c63c8)
   → [`6354763`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-StudyRem/commit/6354763)
