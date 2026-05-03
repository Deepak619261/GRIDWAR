# GRIDapp Docs

## What This Folder Is

This folder is the single source of truth for the InboxKit take-home assignment. It contains the conceptual primer you need before writing code, the design decisions you must record in your own words before touching a keyboard, the hour-by-hour build plan, and the interview pack you will use from submission through the founders round. These docs exist so you do not have to hold the full context in your head under pressure — read them in order, fill in what is yours to fill, then build. Return to them before each interview round.

## The Gating Rule

**No application code until `02_design_and_tradeoffs.md` Parts B, C, and D are filled in your own words.**

This is not a suggestion. The decisions you write there are the ones you will defend in the CTO round. If someone else writes them — or if you write them after building — you will not own them in the room. Write them first. Every word in that file must be yours.

Reading order:
1. Read `01_concepts.md` (real-time grid concepts — WebSockets, concurrency, scaling)
2. Read `05_dotnet_concepts.md` (async/await, DI, middleware, ConcurrentDictionary internals — read the sections relevant to what you are about to code)
3. Fill `02_design_and_tradeoffs.md` Parts B, C, D (write your actual choices — leave Part A alone, it is pre-filled)
4. Read `03_build_roadmap.md` (understand the full plan before executing any of it)
5. Start coding
6. Return to `04_interview_pack.md` Sunday afternoon (submission text + interview prep)

## Reading Order and Time Estimates

1. **`00_README.md`** (this file) — 5 minutes. Orientation only. You are here.
2. **`01_concepts.md`** — 25–30 minutes. Read end-to-end once. Do not skim. WebSockets, CAS, broadcast patterns, scaling — every interviewer at a real-time SaaS probes these. Build the model now so defending it is recall, not improvisation.
3. **`05_dotnet_concepts.md`** — 20–25 minutes. Read before you start coding. Cover async/await + DI before Stage 0 Thursday. Read the middleware and SemaphoreSlim sections before Stage 1 Friday. Return to IQueryable and Span<T> during your Week 7 .NET depth block. This file doubles as switch-plan interview prep — every section maps to a question Zeta or Chargebee will ask.
4. **`02_design_and_tradeoffs.md`** — 45–60 minutes. Part A is pre-filled (read it). Write Parts B, C, D yourself. This is the most important block of the entire weekend. Own every sentence.
5. **`03_build_roadmap.md`** — 10 minutes. Scan the full plan before executing. Internalize the hard cuts so you are not making scope decisions under fatigue at midnight.
6. **`04_interview_pack.md`** — Sunday afternoon. Adapt submission answers to what you actually shipped, fill Q&A placeholders in your own words, rehearse the pitch out loud at least once.

## Stack Context

InboxKit already knows you are a .NET engineer — the screening call cleared the stack question before they sent the assignment. The submission does not explain or hedge the choice. You built this in .NET because that is where you can ship a thoughtful, correct, well-designed solution in three days. A shakier Node version under a learning curve would have been worse engineering and worse evidence of your ability. Every backend decision in these docs includes a one-line Node/Socket.io equivalent — that is ammunition for the CTO round (round 3) and the founders round (round 4), not submission framing. In those rooms you will demonstrate that the mental model transfers cleanly: Hub → Namespace, Group → Room, ConcurrentDictionary + TryUpdate → Map + mutex or Redis WATCH/MULTI. You will be shipping in their stack within 2–3 weeks. Say this confidently and without apology when asked.

## Hard Stops and Scope Cuts

| Deadline | Goal | Cut this if behind |
|---|---|---|
| **Fri 11:45 PM** | Core capture works: two browsers, click syncs in real time under 200ms | Drop leaderboard, cooldown UI, animations — anything decorative |
| **Sat 6 PM** | UI polished, leaderboard live, cooldown enforced server-side | Cut the Stage-2 bonus entirely — do not start it |
| **Sun 12 PM** | Deployed and publicly accessible from a live URL | Cut any bonus not yet started; stop adding features |
| **Sun 4 PM** | README complete, Q&A answers written, demo video recorded | Record on phone pointed at laptop screen — ugly is fine |
| **Sun 6 PM** | **Submit. Whatever state it is in.** | Nothing gets cut here — you ship what exists |

**When behind, cut features — never cut the deploy.** The submission form requires a live URL. A deployed ugly version beats a polished local version every single time. There is no partial credit for "almost deployed."

## Daily Check-In Template

Fill this at the end of every work session. Be honest — this is for you, not for anyone else.

```
Date / Session:
What worked:
What is stuck:
What I cut (and why):
What is next:
On track? (Y / N — if N, what is the recovery plan):
```
