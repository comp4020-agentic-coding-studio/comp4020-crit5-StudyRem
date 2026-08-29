# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## My working rules

- **Check the course plugin for updates before starting a new crit or
  assignment.** Run `claude plugin update comp4020@comp4020` (and
  `comp4020-statusline@comp4020` while you're at it) before running **start**
  for a new deliverable, and restart the session if it reports an update ---
  a stale plugin means `start` is pulling specs or running checks against
  outdated skill logic without either of us noticing. Once caught genuinely
  out of date by several releases (0.12.4 installed while 0.13.0--0.14.0 had
  shipped), so this isn't hypothetical --- check it every time, not just when
  something seems off.
- **Commit locally, don't push without asking.** Commit every meaningful
  change as you go (a new file, a spec test, a harness edit, a working
  feature) --- don't batch everything into one commit at the end. But never run
  `git push`, open a PR, or otherwise touch the remote unless I explicitly ask
  for that push in the same turn. Approval to push once does not carry
  forward --- ask again next time. This repo stays private and local-only
  until I say otherwise.
- **When I name the deliverable, summarize the spec back to me.** If I tell
  you which crit or assignment we're working on, after you've finished any
  initialization work (cloning, installing, pulling the spec, writing starter
  tests), give me a brief summary of that week's spec before we start
  building --- what's mechanically checkable vs. judged at the crit, and the
  cutoff. I shouldn't have to re-read the brief myself to know what we're
  aiming at.
- **Big changes get a plan first.** If a change is big --- a new feature, a
  restructure, anything touching multiple files or the content/information
  model --- write out a detailed implementation plan and get my sign-off
  before writing code. Small, mechanical, or single-file edits don't need
  this; use judgement on where the line is.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
