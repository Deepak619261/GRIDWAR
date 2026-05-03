# Design and Trade-offs

**GATING RULE:** Parts B, C, and D are yours to fill. Do not start coding until all three are complete in your own words. Part A is pre-filled — read it, do not change it.

---

## Part A — Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                           │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │              Angular App (TypeScript + Angular CLI)       │     │
│   │                                                          │     │
│   │  GridService (singleton)   GridComponent                 │     │
│   │  Signal<CellState[]>       2500 <app-cell> OnPush        │     │
│   │  optimistic update         LeaderboardComponent          │     │
│   │                                                          │     │
│   │  signalr.service.ts  ← HubConnection singleton           │     │
│   └─────────────────────────┬────────────────────────────────┘     │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                    WebSocket Connection
                 (ws:// or wss:// after HTTP upgrade)
                    full-duplex, persistent
                              │
┌─────────────────────────────┼───────────────────────────────────────┐
│                        ASP.NET Core Server                          │
│                                                                     │
│   ┌─────────────────────────▼────────────────────────────────┐     │
│   │                      GridHub                             │     │
│   │  (SignalR Hub — Hubs/GridHub.cs)                        │     │
│   │                                                          │     │
│   │  OnConnectedAsync()   → assign identity, send snapshot  │     │
│   │  CaptureCell(index)   → validate → CAS → broadcast      │     │
│   │  OnDisconnectedAsync() → remove user, update count      │     │
│   └─────────────────────────┬────────────────────────────────┘     │
│                             │ calls                                  │
│   ┌─────────────────────────▼────────────────────────────────┐     │
│   │                    GridService                           │     │
│   │  (Services/GridService.cs — singleton)                  │     │
│   │                                                          │     │
│   │  ConcurrentDictionary<int, CellState> _grid             │     │
│   │  ConcurrentDictionary<string, UserInfo> _users          │     │
│   │  ConcurrentDictionary<string, DateTime> _cooldowns      │     │
│   │                                                          │     │
│   │  TryCapture(index, userId, color) → CAS via TryUpdate   │     │
│   │  GetSnapshot() → CellState[]                            │     │
│   │  GetLeaderboard() → top-5 by cells owned               │     │
│   └──────────────────────────────────────────────────────────┘     │
│                                                                     │
│                  Fan-out: Clients.All.SendAsync(...)                │
│                  ↓         ↓         ↓         ↓                   │
│              conn-1     conn-2    conn-3    conn-N                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Click Data Flow (CaptureCell)

1. **User clicks a cell** in the Angular grid. The cell's `(click)` handler calls `GridService.captureCell(index)`.
2. **Optimistic update:** `GridService` immediately updates the `Signal<CellState[]>` with the user's color. The UI feels instant because Angular's OnPush cells react to the signal.
3. **Hub invocation:** `SignalrService` calls `connection.invoke("CaptureCell", index)` over the WebSocket.
4. **Server receives:** `GridHub.CaptureCell(index)` fires. It reads the current `CellState` from `GridService`. It checks cooldown — if the user is on cooldown, sends `CaptureRejected` to `Clients.Caller` with reason `"cooldown"` and returns.
5. **CAS attempt:** `GridService.TryCapture(index, userId, color)` calls `_grid.TryUpdate(index, updated, current)` where `updated` increments `Version`. Returns `true` (won) or `false` (lost race).
6. **On success:** hub calls `Clients.All.SendAsync("CellCaptured", cellState)`. Every connected client receives the authoritative state.
7. **On failure (lost race):** hub calls `Clients.Caller.SendAsync("CaptureRejected", { index, reason: "race" })`.
8. **Client reconciles:** on `CellCaptured`, `GridService` updates the signal with the server's authoritative state (overwriting the optimistic value — in the success case they are identical; in a race they differ). On `CaptureRejected`, `GridService` reverts the optimistic state and briefly sets an error flag on that cell.

### File and Folder Structure

```
GRIDapp/
├── docs/
│   ├── 00_README.md
│   ├── 01_concepts.md
│   ├── 02_design_and_tradeoffs.md  ← this file
│   ├── 03_build_roadmap.md
│   └── 04_interview_pack.md
│
├── Server/                         (.NET 8 / ASP.NET Core)
│   ├── Hubs/
│   │   └── GridHub.cs              SignalR hub — all real-time endpoints
│   ├── Services/
│   │   ├── GridService.cs          in-memory grid state + business logic
│   │   └── UserService.cs          online user tracking, color assignment
│   ├── Models/
│   │   ├── CellState.cs            record { Index, OwnerId, OwnerColor, Version, CapturedAt }
│   │   ├── UserInfo.cs             record { ConnectionId, UserId, DisplayName, Color }
│   │   └── CaptureResult.cs       record { Success, Reason, CellState }
│   └── Program.cs                  DI setup, CORS, SignalR config, hub mapping
│
├── Client/                         (Angular 17+ + TypeScript + Angular CLI)
│   ├── src/
│   │   └── app/
│   │       ├── components/
│   │       │   ├── grid/
│   │       │   │   ├── grid.component.ts       renders 50×50, passes index+state to cell
│   │       │   │   └── grid.component.html     *ngFor with trackBy, CSS grid layout
│   │       │   ├── cell/
│   │       │   │   ├── cell.component.ts       OnPush, (click) handler, @Input() state
│   │       │   │   └── cell.component.html
│   │       │   ├── leaderboard/
│   │       │   │   └── leaderboard.component.ts top-5 panel, live updates
│   │       │   └── player-info/
│   │       │       └── player-info.component.ts color swatch + name + cell count
│   │       ├── services/
│   │       │   ├── grid.service.ts             Signal<CellState[]>, captureCell, event listeners
│   │       │   └── signalr.service.ts          HubConnection singleton, connection lifecycle
│   │       └── types/
│   │           └── grid.types.ts               TypeScript interfaces matching server models
│   └── angular.json
│
└── .gitignore
```

### Tech Stack Table

| Component | Choice | Node/Socket.io Equivalent |
|---|---|---|
| Backend runtime | .NET 8 / ASP.NET Core | Node.js 20 + Express |
| Real-time layer | SignalR (WebSocket transport) | Socket.io |
| Hub / Namespace | `GridHub : Hub` class | `io.of('/grid')` namespace |
| Shared state | `ConcurrentDictionary<int, CellState>` (in-memory singleton) | `Map` in a singleton module (in-memory) |
| Conflict resolution | `TryUpdate` (CAS) | Synchronous map access (safe if no await between read/write) |
| Frontend framework | Angular 17+ + TypeScript | React 18 + TypeScript (InboxKit's stack) |
| Frontend build | Angular CLI (`ng serve` / `ng build`) | Vite |
| Change detection | `ChangeDetectionStrategy.OnPush` + Signals | `React.memo` + minimal state updates |
| SignalR client | `@microsoft/signalr` npm package | `socket.io-client` npm package |
| Hosting — backend | Render (free tier, supports .NET + WebSocket) | Railway / Render / Fly.io |
| Hosting — frontend | Vercel | Vercel (identical) |

---

## Part B — The 8 Design Decisions

**Instructions:** for each decision, read the options and their trade-offs, then write your actual choice and reasoning under "My choice and defense." Write 3–5 sentences in your own words. This is what you will defend in the CTO interview — own every word.

---

### Decision 1: Real-Time Transport

**Question:** What mechanism delivers live cell updates between server and all connected clients?

**Options:**

| Option | Description |
|---|---|
| A | SignalR with auto-negotiated WebSocket transport |
| B | Raw WebSockets (no SignalR abstraction) |
| C | Server-Sent Events (SSE) for server→client push, REST POST for client→server |

**Option A — SignalR with WebSocket transport**
- Pros: transport fallback built-in; hub abstraction = strongly-typed method calls instead of raw JSON parsing; group management included; automatic reconnect built into .NET and JS clients; first-class ASP.NET Core integration with DI, middleware, logging
- Cons: adds a dependency on top of raw WebSockets; slightly more HTTP round-trips during initial negotiation; opinionated message format (JSON envelope with method name)

**Option B — Raw WebSockets**
- Pros: no abstraction overhead; full control over framing and protocol; lighter client library; cleaner if you want binary frames
- Cons: you write all the routing (dispatch by message type), reconnect logic, group management, serialization — all ground SignalR already covers; more code, more bugs, no real upside for this use case

**Option C — SSE + REST**
- Pros: SSE is very simple server-side; works through any HTTP proxy; good enough for read-heavy use cases
- Cons: unidirectional — client cannot send over the same connection; `CaptureCell` requires a separate REST call; you lose the atomicity of "send command, receive result on the same connection"; two codepaths to maintain

**My choice and defense (3–5 sentences in my own words):**

For real-time updates I had four options. Polling — the client repeatedly checks the server at a fixed interval — introduces lag equal to that interval and floods the server with requests that mostly return nothing useful.

Long polling improves on this: the server holds the request open until something changes, then responds. But it has several problems: the server holds one connection object per waiting user (1000 users = 1000 objects in memory); every response forces the client to immediately re-establish a new connection, adding repeated TCP and HTTP overhead; proxies and load balancers have default timeouts that can kill held requests before the server responds; and there is a small window between response and the next request where an event can be missed.

Server-Sent Events give real-time server-to-client push but are one-directional — the browser cannot send data back over the same connection, so capturing a cell would require a separate HTTP POST. Two codepaths for one interaction.

WebSocket upgrades a normal HTTP connection via the Upgrade header, establishing a persistent full-duplex channel. Both directions use the same connection. The server still holds one connection per user — 10,000 users means 10,000 persistent connections — but there is no repeated connection churn, no HTTP overhead per message, and no split between sending and receiving.

*(SignalR vs raw WebSockets — write this yourself after the question session)*

**Node/Socket.io mapping:** Socket.io is the direct equivalent of SignalR here. Transport negotiation works the same way — WebSocket first, polling fallback. Hub methods map to socket event handlers (`socket.on('captureCell', handler)`). The reconnect config is `io(url, { reconnection: true })`.

---

### Decision 2: Grid State Storage

**Question:** Where does the authoritative grid state live, and how is it accessed?

**Options:**

| Option | Description |
|---|---|
| A | In-memory `ConcurrentDictionary<int, CellState>` in a singleton service |
| B | Redis — all reads/writes go through Redis |
| C | PostgreSQL — every capture is a DB row upsert |
| D | MongoDB — every cell is a document |

**Option A — In-memory ConcurrentDictionary**
- Pros: microsecond reads/writes; no network round-trips; no external dependency to set up; trivial to implement correctly with .NET's built-in thread-safe primitives; fits entirely in RAM (2500 cells × ~100 bytes ≈ 250KB)
- Cons: state lost on server restart; does not work across multiple instances; no persistence for analytics; no durability

**Option B — Redis**
- Pros: survives restarts; works across instances; supports atomic CAS via WATCH/MULTI/EXEC or Lua scripts; can use Redis pub/sub for the SignalR backplane in one system
- Cons: adds network latency per operation (1–3ms vs microseconds); requires Redis infrastructure; more complex CAS pattern than `TryUpdate`; overkill for a three-day assignment with one instance

**Option C — PostgreSQL**
- Pros: full ACID durability; queryable for analytics; natural fit for leaderboard history
- Cons: milliseconds per write (vs microseconds); cannot do 1000 captures/sec without connection pooling and query tuning; a DB write per cell click is expensive at scale; wrong primitive for hot path state

**Option D — MongoDB**
- Pros: flexible schema; JSON-native; horizontal sharding if you need it
- Cons: same latency problem as Postgres; no meaningful benefit over Postgres for this use case; adds a dependency with no clear upside

**My choice and defense (3–5 sentences in my own words):**

We had four options. Database options (Postgres, MongoDB) are eliminated immediately — a DB write per cell click adds milliseconds of latency on a hot path that should take microseconds. That leaves Redis and in-memory. For a production application with high traffic, Redis would be the right choice — if you use in-memory and scale to multiple instances, each instance has its own separate copy of the grid and knows nothing about the others, causing state divergence. Redis acts as a centralized store shared across all instances. For this assignment we have a single instance, so in-memory is the correct choice — fast, simple, and no divergence problem.

**Node/Socket.io mapping:** Node is single-threaded, so a simple `Map` object serves the same role as `ConcurrentDictionary` — as long as there is no `await` between reading and writing, access is serialized by the event loop. For production multi-instance Node deployments, Redis is the same answer regardless of language.

---

### Decision 3: Conflict Resolution on Simultaneous Clicks

**Question:** Two users click the same cell at the same millisecond. Exactly one should win. How does the server decide?

**Options:**

| Option | Description |
|---|---|
| A | Last-write-wins — no coordination; whoever writes last wins |
| B | Versioned CAS via `TryUpdate` — one wins, one gets a rejection |
| C | Pessimistic per-cell lock — acquire lock before read, release after write |

**Option A — Last-write-wins**
- Pros: simplest implementation; no rejection path needed; for a casual game, outcome is indistinguishable from CAS
- Cons: both users briefly see themselves as owner (optimistic state) before one is silently overwritten; no rejection message means client cannot display a clear "you lost the race" state; technically incorrect (two writes appear to succeed)

**Option B — CAS via TryUpdate**
- Pros: exactly one writer wins; loser gets an explicit rejection they can act on; no blocking; version field prevents stale overwrites even outside of race conditions; correct and explicit
- Cons: loser must handle `CaptureRejected`; slightly more code on both client and server; rare in practice (human clicks at human speed rarely race)

**Option C — Pessimistic per-cell lock**
- Pros: guaranteed serialization; simple mental model
- Cons: blocks threads waiting to acquire the lock; if any async operation occurs inside the lock, you can deadlock; does not compose well with async/await; wrong primitive for an operation that takes microseconds; scales poorly with many cells and many threads; no benefit over CAS for this use case

**My choice and defense (3–5 sentences in my own words):**

> so we had the three option for the conflict resolution on simaltaneous clicks , 
1. last write wins -> in this whatever executed last at cpu wins , its so random that it doesn't gurranty the updation will be correct or not , another thing is that say two request by conicidence arrived at the same nanoseconds the memory get corrupeted , means it will have some part updated from the req A and some from req B 
2. passimistic lock : - it means whenever two requests came at the same time , we put a lock there and see who entered the first first entered alright then the second will get the someone captured already msg , the main cons of this is the thread locking stops the whole system and makes the system stopes. the read can happen while the write lock is locked , but the main issue is that threads pile ups 
3. CAS comapre and swap -> means while making the actual request we take the current value of the cell and if that is the same while the actaul request we keep else we just send the cell got captured 
**Node/Socket.io mapping:** Node's event loop serializes synchronous code. If `captureCell` handler reads the map, checks, and writes with no `await` in between, races cannot happen within one process. For multi-process Node, use Redis `SET key NX PX milliseconds` (set-if-not-exists with TTL) or Lua scripts for atomic CAS. The concept is identical — only the primitive differs.

---

### Decision 4: Initial State Delivery

**Question:** When a new user connects, how do they receive the current state of all 2500 cells?

**Options:**

| Option | Description |
|---|---|
| A | Full grid snapshot pushed in `OnConnectedAsync` over the WebSocket |
| B | Separate REST endpoint — client calls `GET /api/grid` on page load, then connects to hub |
| C | Lazy/chunked load — client loads the viewport first, fetches remaining cells as they scroll |

**Option A — Full snapshot in OnConnectedAsync**
- Pros: single connection, single protocol; client receives grid as part of the hub connection flow; no timing gap between snapshot and first delta event; trivial to implement
- Cons: ~125KB JSON per connection event; if the grid grows large (100k+ cells), this becomes a bottleneck

**Option B — REST + WebSocket diffs**
- Pros: separates concerns cleanly; HTTP snapshot is cacheable at a CDN; smaller WebSocket messages (deltas only after connect)
- Cons: timing gap between snapshot fetch and WebSocket connect = missed events; requires sequence numbers to detect and fill the gap; two transport protocols to manage

**Option C — Lazy/chunked load**
- Pros: correct approach for very large grids; only loads what the user can see
- Cons: meaningless for 2500 cells; adds viewport tracking, chunk request logic, and infinite scroll handling — all for a 50×50 grid that fits in a single JSON message

**My choice and defense (3–5 sentences in my own words):**

> *(Write your choice and reasoning here. Do not paste AI text. This must be yours.)*

**Node/Socket.io mapping:** `socket.on('connect', () => socket.emit('getSnapshot'))` or push from the server in `io.on('connection', socket => { socket.emit('snapshot', gridState); })`. Identical pattern.

---

### Decision 5: Identity Model

**Question:** How does the system know who a user is, assign them a color, and track their captures?

**Options:**

| Option | Description |
|---|---|
| A | Anonymous session — server assigns a random color and display name (e.g., "Falcon#7A2B") on connect; identity lasts for the lifetime of the WebSocket connection |
| B | Cookie-based persistent identity — browser stores a session token; user retains their color and score across page refreshes |
| C | Full account auth — email + password or OAuth; score and ownership are permanent |

**Option A — Anonymous session**
- Pros: zero friction; no auth infrastructure; anyone can join instantly; correct scope for an assignment
- Cons: identity lost on page refresh or reconnect; no persistence of score; cannot attribute captures across sessions

**Option B — Cookie-based persistent identity**
- Pros: survives page refresh; user retains color and score across sessions without a full auth system; moderate implementation cost (one cookie + server-side session store)
- Cons: adds a session store (in-memory map, Redis, or DB); slightly more setup; not necessary for a three-day assignment

**Option C — Full account auth**
- Pros: permanent identity; proper leaderboard history; user management
- Cons: significant scope — registration, password handling, JWT issuance, token refresh; days of work for no gameplay benefit; explicitly out of scope

**My choice and defense (3–5 sentences in my own words):**

> *(Write your choice and reasoning here. Do not paste AI text. This must be yours.)*

**Node/Socket.io mapping:** in Node, assign identity in the `connection` event handler: `const userId = generateId(); const color = pickColor(); socket.data.userId = userId;`. The concept is identical — connection-scoped server-assigned identity.

---

### Decision 6: Cooldown / Abuse Prevention

**Question:** How do you prevent a single user from capturing cells faster than intended?

**Options:**

| Option | Description |
|---|---|
| A | Server-side per-user cooldown enforced in the hub method |
| B | Client-side throttle only — disable the click handler for N milliseconds |
| C | No rate limiting |

**Option A — Server-side cooldown**
- Pros: cannot be bypassed (a determined attacker cannot skip the server); single source of truth; works even if the client is a custom WebSocket script; correct
- Cons: every request pays a dictionary lookup; adds a tiny bit of code to the hub method

**Option B — Client-side throttle only**
- Pros: instant feedback for the honest user (button disables locally); no server-side code
- Cons: a script calling the WebSocket API directly bypasses it entirely; not a real security control; trivially bypassable

**Option C — No rate limiting**
- Pros: zero code
- Cons: one malicious user can flood the hub with thousands of calls per second, starving legitimate users and potentially crashing the server; never acceptable for a networked game

**My choice and defense (3–5 sentences in my own words):**

> *(Write your choice and reasoning here. Do not paste AI text. This must be yours.)*

**Node/Socket.io mapping:** `const cooldowns = new Map(); socket.on('captureCell', (index) => { const last = cooldowns.get(socket.id) ?? 0; if (Date.now() - last < COOLDOWN_MS) return socket.emit('rejected', 'cooldown'); cooldowns.set(socket.id, Date.now()); /* proceed */ })`. Same logic, different primitives.

---

### Decision 7: Broadcast Pattern

**Question:** After the server validates and applies a capture, how does it notify clients?

**Options:**

| Option | Description |
|---|---|
| A | `Clients.All.SendAsync("CellCaptured", cellState)` — single broadcast to everyone including the originator |
| B | `Clients.Caller.SendAsync("CaptureAcknowledged", ...)` + `Clients.Others.SendAsync("CellCaptured", ...)` — two separate messages |

**Option A — Single broadcast to All**
- Pros: one call, one message; originator receives canonical server state as confirmation of their optimistic update; symmetric — all clients handle the same event; less code
- Cons: originator receives an echo of their own action; negligible bandwidth cost

**Option B — Ack to Caller + Broadcast to Others**
- Pros: can include caller-specific data in the ack (score delta, timestamp); originator does not need to "undo then redo" from the echo — their optimistic state is confirmed by a dedicated ack
- Cons: two messages per capture; client must handle two event types for essentially the same information; more code for no meaningful gain when payloads are identical

**My choice and defense (3–5 sentences in my own words):**

> *(Write your choice and reasoning here. Do not paste AI text. This must be yours.)*

**Node/Socket.io mapping:** Option A = `io.emit('cellCaptured', cellState)`. Option B = `socket.emit('captureAcknowledged', ...)` + `socket.broadcast.emit('cellCaptured', ...)`. The pattern is identical; only the method names differ.

---

### Decision 8: Frontend Grid Rendering

**Question:** How do you render a 50×50 grid (2500 cells) in Angular efficiently?

**Options:**

| Option | Description |
|---|---|
| A | CSS grid + Angular with `OnPush` change detection + `trackBy` and minimal `@Input()` passing |
| B | `<canvas>` element — draw all cells programmatically, track hit regions for click handling |
| C | Virtualized list — only render cells in the viewport |

**Option A — CSS grid + Angular OnPush**
- Pros: accessible (DOM elements, keyboard navigation possible); easy to apply CSS transitions for capture animations; idiomatic Angular; correct for 2500 cells; easy to debug in DevTools; `OnPush` + Signals means Angular only re-renders the cells whose `@Input()` reference changed — same performance guarantee as `React.memo`
- Cons: 2500 DOM elements; layout cost grows linearly; wrong choice above ~10,000 cells

**Option B — Canvas**
- Pros: one DOM element regardless of cell count; rendering cost is O(visible cells), not O(all cells); handles 1,000,000 cells without DOM overhead
- Cons: no built-in accessibility; manual hit-region detection for clicks; manual animation logic; significantly more code; wrong choice for 2500 cells (massive complexity for zero benefit)

**Option C — Virtualized list**
- Pros: renders only visible cells; correct for very long lists
- Cons: CSS grid layouts do not virtualize simply (virtualization works for linear scroll, not 2D grids); Angular CDK virtual scroll is designed for linear lists, not 2D grids; overkill for 2500 cells

**My choice and defense (3–5 sentences in my own words):**

> *(Write your choice and reasoning here. Do not paste AI text. This must be yours.)*

**React/Node equivalent:** `React.memo` on each `<Cell>` component = `ChangeDetectionStrategy.OnPush` in Angular. `key` prop in React = `trackBy` function in Angular's `*ngFor`. The rendering boundary (CSS grid → Canvas above ~10k cells) is identical regardless of framework.

---

## Part C — Explicitly Out of Scope

*(Pre-filled — these are intentional scope cuts, not gaps. Have a one-line explanation ready for each.)*

- **Full account authentication** — email/password or OAuth would add days of work with no gameplay benefit; anonymous sessions are correct for the assignment scope
- **Cross-restart grid persistence** — in-memory state is ephemeral by design; production path is Redis; called out explicitly in trade-offs so it is not a hidden gap
- **Multi-instance / horizontal scaling** — one server is correct for the assignment; Redis backplane is the named upgrade path
- **Multi-region deployment** — global latency optimization is a real concern at 10,000+ concurrent users; not relevant at assignment scale
- **Mobile-responsive layout** — desktop-first; the grid interaction (click, hover) does not translate to touch without additional work; noted as "what I'd add next"
- **Undo / re-capture rules** — once a cell is captured it stays captured until someone else takes it; no undo, no time-based expiry, no area-control rules
- **In-game chat** — not part of the assignment spec
- **Custom grid sizes per user** — 50×50 is fixed; per-user viewport sizing is a product decision, not a technical one
- **Paint tools / multi-cell selection** — one click = one cell; brushes, fills, and area tools are a different product

---

## Part D — What "Done" Looks Like

*(Pre-filled — this is the acceptance checklist. Every item should be true before you record the demo video.)*

- [ ] Anonymous user opens the URL and sees the 50×50 grid with no login prompt
- [ ] Server assigns a color and display name; user can see their color in a panel at the top of the screen
- [ ] User clicks an empty cell — it immediately shows their color (optimistic), server confirms within 200ms
- [ ] A second browser window open on the same URL sees the cell update without refreshing
- [ ] User tries to click a cell they already own — server rejects; client shows brief visual feedback (e.g., shake or red flash)
- [ ] Server-side cooldown is enforced: clicking faster than the limit produces a rejection with reason "cooldown"
- [ ] Live online-user count is visible and updates when a browser tab opens or closes
- [ ] Leaderboard shows top 5 users by cells owned, updating live as captures happen
- [ ] If the browser tab loses network for a few seconds and reconnects, the grid returns to the correct current state
- [ ] The app is deployed and accessible from a public URL that works from a phone on a different network
