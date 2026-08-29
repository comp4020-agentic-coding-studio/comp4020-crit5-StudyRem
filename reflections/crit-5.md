# Crit 5 reflection

## What was the breakthrough that moved the work forward?

Early on I told the AI the traffic spawns should feel independently, randomly
timed per lane — and the code it wrote matched that sentence, but not what I
actually meant by it. Cars kept lining up into coincidental "walls": nothing
was scheduled together, but independent per-lane timers occasionally landed
close enough in time to read as one deliberate line of traffic. As I put it at
the time, "the batch/random generation is working in a different way than I
thought though in the same way that word can tell" — the description and the
implementation both matched the words I'd used, they just didn't match each
other's picture of what those words meant. The gap only showed up once I
actually played the built game; reading the code or the prompt back wouldn't
have caught it.

## What did this work change about who I want to be as a software developer?

I don't trust a prose description as a spec anymore, mine or the AI's restated
version of it. If a behaviour can't be pinned down precisely in words —
timing, randomness, "feel" — I assume the AI may have landed on a different
picture than the one in my head, and I check by playing first, not by
re-reading the diff.
