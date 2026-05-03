# Interview Pack

Everything you need from submission through the founders round. Fill Q&A placeholders in your own words before the CTO interview. The coaching notes tell you what your answer must cover — use them to self-grade, not to copy.

---

## 1. Submission Form — Pre-Written Answers

*Adapt these to what you actually shipped before submitting. Do not submit the template verbatim.*

---

### Tech Stack Used

Built with .NET 8 + ASP.NET Core on the backend, using SignalR for real-time WebSocket communication. Frontend is Angular 17+ + TypeScript built with Angular CLI. Grid state is held in an in-memory `ConcurrentDictionary` within a singleton service, exposed to the UI via Angular Signals. Deployed backend on [Render / Railway] and frontend on Vercel.

---

### How did you handle real-time updates?

Every connected browser maintains a persistent WebSocket connection to an ASP.NET Core SignalR hub. When a user clicks a cell, the browser invokes a `CaptureCell` hub method. The server validates the request — checking a per-user cooldown and resolving any concurrent captures via a compare-and-swap using `ConcurrentDictionary.TryUpdate` — and on success broadcasts a `CellCaptured` event to all connected clients using `Clients.All.SendAsync`. Each client's `GridService` listens for this event, updates an Angular Signal holding the grid state, and only the `CellComponent` with `OnPush` change detection whose input reference changed re-renders.

New users receive a full grid snapshot synchronously in `OnConnectedAsync` so they see current state immediately. The JavaScript SignalR client is configured with automatic reconnect; on reconnection, the client requests a fresh snapshot to reconcile any state missed during the disconnect window.

I chose SignalR specifically because it handles transport negotiation (WebSocket → SSE → long-polling fallback), hub-method routing, and reconnect logic — all of which I would have written manually with raw WebSockets. On Node/Socket.io the architecture is identical: `io.on('connection')` for initial setup, `socket.on('captureCell')` for capture events, and `io.emit('cellCaptured', state)` for broadcast fan-out.

---

### What trade-offs did you make?

**In-memory state vs. persistence:** I store grid state in a `ConcurrentDictionary` in the server process. It is fast (microsecond reads and writes), simple, and correct for a single-instance deployment. The cost is that state is lost on restart and does not scale across multiple instances. For production I would use Redis as the state store with the SignalR Redis backplane for cross-instance broadcast — I designed with this upgrade path explicitly in mind.

**Versioned CAS vs. last-write-wins:** I use `TryUpdate` with a version field to resolve simultaneous clicks. The losing client receives an explicit `CaptureRejected` event with a reason, allowing the UI to revert its optimistic state cleanly. Last-write-wins is simpler but leaves both clients briefly convinced they own the cell.

**CSS grid vs. Canvas:** at 2500 cells, CSS grid with `React.memo`'d cells is the correct tool — accessible, animatable, debuggable. Canvas is the right answer above roughly 10,000 cells where DOM layout cost becomes a bottleneck. I picked the right tool for the size.

**Anonymous identity vs. auth:** server-assigned random names and colors keep the assignment focused on the real-time and concurrency problem. Full authentication would take most of the available time and add no insight into the core architecture.

Built in .NET because that is where I can deliver a correct, thoughtful solution in three days. The architecture maps directly to Node + Socket.io — Hub = Namespace, Group = Room, `TryUpdate` = synchronous Map access or Redis WATCH/MULTI/EXEC — and I would be productive in your stack within 2–3 weeks.

---

### Bonus Features Added

*(Fill this with what actually shipped. Template below.)*

- Server-assigned display names (e.g., "BoldFalcon42") and colors — visible in a player info panel
- Live leaderboard — top 5 users by cells owned, updates on every capture
- Server-side cooldown — 1.5-second minimum between captures per user, enforced in the hub method
- Reconnection handling — re-snapshot on SignalR reconnect restores correct grid state
- [Add whichever Stage-2 bonus shipped: animated capture pulse / pan+zoom / cursor presence]

---

## 2. Public README Template

```markdown
# GRIDapp — Real-Time Shared Grid

A multiplayer shared canvas where hundreds of users compete to capture grid cells in real time. Built for the InboxKit take-home assignment.

**Live demo:** [https://YOUR-VERCEL-URL.vercel.app](https://YOUR-VERCEL-URL.vercel.app)
**Demo video:** [2-minute Loom walkthrough](https://loom.com/YOUR-LINK)

---

## Architecture

```
Browser ──── WebSocket (SignalR) ──── ASP.NET Core Hub ──── ConcurrentDictionary
  │                                         │
  └── React + TypeScript + Vite        fan-out to all connected clients
```

**Backend:** .NET 8 / ASP.NET Core · SignalR · in-memory ConcurrentDictionary
**Frontend:** React 18 · TypeScript · Vite · @microsoft/signalr

---

## How Real-Time Works

When a user clicks a cell, the React app invokes a `CaptureCell` method on the SignalR hub over a persistent WebSocket connection. The server checks a per-user cooldown and resolves any concurrent captures using `ConcurrentDictionary.TryUpdate` — a compare-and-swap that guarantees exactly one writer wins without blocking.

On success, the server broadcasts a `CellCaptured` event to every connected client via `Clients.All.SendAsync`. Each client's `useGrid` hook updates only the affected cell in local state, triggering a re-render of that single memoized `<Cell>` component. End-to-end latency from click to all-clients-updated is typically under 100ms.

New users receive a full grid snapshot synchronously on connection. If the connection drops, the SignalR client reconnects automatically and requests a fresh snapshot to reconcile missed updates.

---

## Decisions and Trade-offs

See [docs/02_design_and_tradeoffs.md](docs/02_design_and_tradeoffs.md) for the full design rationale, including the 8 key decisions and what I would change for production scale.

---

## Run Locally

**Backend:**
```bash
cd Server
dotnet run
# Starts on http://localhost:5000
```

**Frontend:**
```bash
cd Client
npm install
npm run dev
# Starts on http://localhost:5173
```

Open two browser tabs at `http://localhost:5173`. Click cells in one tab and watch them appear in the other.

---

## What I'd Add Next

- **Redis state store + SignalR backplane** — survives restarts, enables horizontal scaling
- **Sequence-numbered event log** — efficient catch-up after reconnect instead of full re-snapshot
- **Mobile-responsive layout** — touch events for capture, pinch-to-zoom for navigation
- **Area-control rules** — bonus points for capturing adjacent cells or completing rows
- **Persistent leaderboard** — store capture history in Postgres for all-time rankings
```

---

## 3. Application Paragraph for hr@inboxkit.com

*Fill in the [highlighted] sections. ~120 words. Do not explain or apologize for the stack choice — the paragraph below is already confident about it.*

---

Subject: Full-Stack Developer Application — Deepak Kumar

Hi,

I'm Deepak Kumar, a backend engineer with [X] years of experience at [Jungleworks / current company] building distributed systems with C#, .NET, PostgreSQL, and Kafka. I applied because **[one sentence — pick something specific: "InboxKit's combination of bootstrapped profitability at $12M ARR, a global product built by a small on-site team, and end-to-end ownership for engineers is exactly the environment I want to grow in" — or cite something specific you know about their product]**.

For the assignment I built a real-time multiplayer grid where concurrent users compete for cell ownership, using .NET + SignalR for WebSocket communication and React + TypeScript on the frontend. The architecture maps cleanly to Node + Socket.io and I would be productive in your stack within 2–3 weeks.

GitHub: [link] | Live demo: [link]

Deepak

---

## 4. Three-Minute Pitch Script

*Rehearse this out loud. Once with the script. Once without. Time markers are in the margin.*

---

**[0:00]** "I built a real-time multiplayer grid — 50 columns by 50 rows, 2500 cells — where any number of concurrent users can claim cells by clicking them, and every change is visible to everyone else in under 200 milliseconds. I'll walk you through the four design decisions that I think are most interesting."

**[0:30]** "First, transport. I used WebSockets via SignalR, not HTTP polling or Server-Sent Events. The grid is bidirectional — users send capture commands, the server broadcasts updates — so you need full-duplex communication. SignalR on top of raw WebSockets gives me transport negotiation, reconnect logic, and the hub abstraction so I am writing RPC-style method calls instead of parsing raw JSON frames. The equivalent in your stack is Socket.io, and the mapping is direct: Hub equals Namespace, the broadcast pattern is identical."

**[1:00]** "Second, state and concurrency. The grid lives in an in-memory ConcurrentDictionary. When two users click the same cell at the same millisecond — which I tested explicitly — I resolve it with a compare-and-swap using TryUpdate. The cell carries a version counter. Whoever's write finds a matching version wins; the other gets a rejection event and their optimistic UI state is rolled back. No locks, no blocking. In Node, the equivalent is keeping the Map update synchronous with no await between read and write, which the event loop serializes for you."

**[1:30]** "Third, broadcast pattern. After a successful capture, I broadcast to Clients.All including the originator. The originator applied the update optimistically on click and receives the server's authoritative state back as confirmation. In the happy path these are identical — the swap is invisible to the user. In the rare race case, the originator's state is corrected by the broadcast."

**[2:00]** "Fourth, the honest weakness: in-memory state means a server restart wipes the grid. That is a deliberate scope choice for a three-day assignment. The production path is Redis as the state store with the SignalR Redis backplane for cross-instance broadcast — I designed with this upgrade explicitly in mind. The cooldown store, the user registry, and the grid state all move to Redis with the same API contract."

**[2:30]** "If I had another week: Redis backplane and persistence first. Then mobile-responsive layout because the click-to-capture interaction does not translate to touch today. Then an area-control rule — bonus points for capturing five adjacent cells — because that makes the game actually interesting. Questions?"

---

## 5. Thirty-Second Elevator Version

"I built a real-time shared grid in .NET and React where hundreds of concurrent users compete to claim cells over WebSockets. The interesting problems were concurrent writes — I used compare-and-swap via ConcurrentDictionary.TryUpdate — and keeping the React grid of 2500 cells from re-rendering on every event, which I solved with React.memo and surgical state updates. The architecture maps directly to Node + Socket.io. Happy to walk through any part of it."

---

## 6. Demo Video Script (2 minutes)

**[0:00 – 0:15] Opening shot**
Two browser windows side by side, same public URL. "This is a real-time shared grid. Both windows are connected to a live server right now."

**[0:15 – 0:40] Core capture demo**
Click several cells in the left window. Watch them appear in the right window. "I just clicked three cells in the left browser. You can see them appear in the right browser in under 200 milliseconds. Every connected client sees every capture in real time over WebSockets."

**[0:40 – 0:55] Identity and leaderboard**
Point out the player info panel. "Each user gets a server-assigned color and name. The leaderboard on the right updates live — right now I'm in first place with [N] cells."

**[0:55 – 1:15] Cooldown demonstration**
Click rapidly. Show the cooldown indicator. "If I try to click faster than the server allows, I get rejected — the cooldown is enforced server-side, not client-side, so it cannot be bypassed."

**[1:15 – 1:35] Reconnect simulation**
Open DevTools in the left window. Network tab → throttle to Offline for 5 seconds. Set back to Online. "I just simulated a network drop. Watch the grid re-sync — it fetches a fresh snapshot on reconnect. The state is correct."

**[1:35 – 1:50] Bonus feature highlight**
Show whichever bonus shipped — cursor presence, pan/zoom, or animated pulse. Brief verbal description.

**[1:50 – 2:00] Architecture callout**
"Backend: .NET 8 + SignalR. Frontend: React + TypeScript. In-memory ConcurrentDictionary for grid state with compare-and-swap for concurrency. Full design rationale in the docs folder on GitHub."

---

## 7. Interview Q&A

**Instructions:** write your own answer under each "My answer" placeholder. Use the coaching note to check if your answer covers the key points. Do not leave these blank before the CTO round.

---

### Fundamentals

**Q1. What is a WebSocket and how does it differ from HTTP?**

My answer (in my own words):

> *(write here)*

*Coaching note: HTTP is request-response — client initiates, server responds, connection closes or is reused for the next request. WebSocket starts as HTTP, upgrades via the `101 Switching Protocols` response, and then becomes a full-duplex persistent TCP channel. Either side can send at any time. No request needed to receive a message. Much less overhead per message — 2–14 bytes of framing vs. multi-hundred-byte HTTP headers. Mention that the handshake is HTTP so it works through firewalls and proxies.*

---

**Q2. What is the HTTP upgrade handshake?**

My answer (in my own words):

> *(write here)*

*Coaching note: client sends a regular GET with `Upgrade: websocket` and `Connection: Upgrade` headers plus a random `Sec-WebSocket-Key`. Server responds with `101 Switching Protocols` and a derived `Sec-WebSocket-Accept` header. After that, the connection speaks the WebSocket framing protocol. The key insight: it bootstraps off existing HTTP infrastructure so firewalls and proxies that allow HTTP/HTTPS also allow WebSockets.*

---

**Q3. Why not polling for this use case?**

My answer (in my own words):

> *(write here)*

*Coaching note: polling introduces artificial latency equal to the poll interval. For a shared grid where captures must appear to other users in under 200ms, polling every second means average 500ms delay. Polling every 100ms means 10 requests/second per user, which does not scale. The grid is event-driven — you want updates pushed immediately when they happen, not fetched on a timer.*

---

**Q4. What is SignalR and how does it differ from raw WebSockets?**

My answer (in my own words):

> *(write here)*

*Coaching note: raw WebSockets give you a pipe — you send and receive raw strings or bytes, you write all your own dispatch logic. SignalR wraps WebSockets with: (1) transport negotiation and fallback, (2) a hub abstraction where you call named methods instead of parsing raw messages, (3) group management, (4) automatic reconnect, (5) first-class ASP.NET Core integration with DI and middleware. The cost is an opinionated envelope format and a bit of negotiation latency. For almost all .NET real-time use cases, SignalR is the right choice.*

---

**Q5. What transports does SignalR support?**

My answer (in my own words):

> *(write here)*

*Coaching note: WebSockets (preferred), Server-Sent Events (server-to-client only, falls back to this if WS is unavailable), and Long Polling (worst case). SignalR tries them in order and picks the best one both sides support. In 2024, WebSockets work almost everywhere, so negotiation completes in milliseconds and you almost always get WebSockets.*

---

**Q6. What does ASP.NET Core's WebSocket layer give you vs. the raw TCP socket?**

My answer (in my own words):

> *(write here)*

*Coaching note: ASP.NET Core handles the HTTP upgrade, reads/writes WebSocket frames, manages connection lifecycle, integrates with middleware (auth, logging, CORS). You get a clean `WebSocket` abstraction without dealing with TCP buffers, TLS, or frame parsing. SignalR sits on top of this.*

---

**Q7. How does a SignalR hub differ from a controller?**

My answer (in my own words):

> *(write here)*

*Coaching note: a controller handles one HTTP request and returns a response. A hub maintains a persistent connection and can receive method invocations from the client at any time AND push events to the client at any time. A hub method is not request-response — it can push back immediately, push later, or push to other connections entirely. State on the hub class is per-request (transient) but the connection itself is long-lived.*

---

**Q8. What is HubContext and when do you use it?**

My answer (in my own words):

> *(write here)*

*Coaching note: `IHubContext<THub>` is injected into other services (not hubs) when you need to push events to clients from outside the hub class — for example, from a background service, a controller, or a message queue consumer. Inside the hub, you use `Clients` directly. Outside, you inject `IHubContext<GridHub>` and call `_hubContext.Clients.All.SendAsync(...)`. This is how you would push a server-triggered event (e.g., "grid reset at midnight") without waiting for a client to invoke a hub method.*

---

**Q9. What is the difference between Clients.All, Clients.Group, and Clients.Caller?**

My answer (in my own words):

> *(write here)*

*Coaching note: `Clients.All` — every connected client. `Clients.Group("name")` — every client in a named group (you add connections to groups via `Groups.AddToGroupAsync`). `Clients.Caller` — only the connection that invoked the current hub method. `Clients.Others` — everyone except the caller. The Node/Socket.io equivalents: `io.emit`, `io.to('room').emit`, `socket.emit`, `socket.broadcast.emit`.*

---

**Q10. What is Clients.Others and when would you use it instead of Clients.All?**

My answer (in my own words):

> *(write here)*

*Coaching note: `Clients.Others` sends to everyone except the originating connection. Use it when the originator has already applied the update locally (optimistic UI) and does not need the echo. The trade-off: the originator's optimistic state becomes permanent with no server confirmation path. `Clients.All` is safer because the originator receives the authoritative server state back and can reconcile. For this assignment, `Clients.All` is correct.*

---

### Concurrency and Correctness

**Q11. What happens when two users click the same cell at the same millisecond?**

My answer (in my own words):

> *(write here)*

*Coaching note: both `CaptureCell` handlers read the current `CellState`. Both read version N. Both attempt `TryUpdate(index, newState, currentWithVersionN)`. `TryUpdate` is atomic — it checks the current value against the comparison value and only swaps if they match. One wins (returns true), one loses (returns false). Winner broadcasts `CellCaptured` to all. Loser sends `CaptureRejected` to caller. Loser's optimistic UI state is rolled back. This is correct under all race conditions.*

---

**Q12. What is ConcurrentDictionary and how does it work internally?**

My answer (in my own words):

> *(write here)*

*Coaching note: `ConcurrentDictionary<K,V>` is a thread-safe dictionary that uses fine-grained striped locking internally — it divides the key space into segments, each with its own lock. Reads are often lock-free (using volatile reads). Writes acquire the segment lock for that key only. Operations on different keys rarely contend. TryGetValue, TryAdd, and indexed reads are safe from any number of threads simultaneously. Contrasted with a plain `Dictionary<K,V>` which is not thread-safe at all.*

---

**Q13. What is TryUpdate and how does CAS apply?**

My answer (in my own words):

> *(write here)*

*Coaching note: `TryUpdate(key, newValue, comparisonValue)` atomically checks whether the current value for `key` equals `comparisonValue` (using `Equals`), and if so, replaces it with `newValue`. Returns `true` if the swap happened. This is Compare-and-Swap: you read a value, compute an update, then swap only if the value has not changed since you read it. If another thread wrote in between, your comparison fails and you know to retry or fail. No locks, no blocking.*

---

**Q14. Why not pessimistic locking (lock/Monitor/Mutex) for cell access?**

My answer (in my own words):

> *(write here)*

*Coaching note: pessimistic locking blocks threads waiting to acquire the lock. For an in-memory operation that takes microseconds, blocking is pure waste. If you accidentally introduce an `await` inside a `lock` block, you can deadlock (can't `await` inside a `Monitor.Enter`). CAS via `TryUpdate` achieves the same atomicity guarantee without any blocking — one thread wins, others detect the failure and handle it explicitly. For high-throughput scenarios with many cells and many concurrent users, per-cell locks would serialize all writes on each cell unnecessarily.*

---

**Q15. What is the version field for in CellState?**

My answer (in my own words):

> *(write here)*

*Coaching note: the version is the comparison value for TryUpdate. Without it, you would compare the entire CellState — which works if the struct is equated by value, but a version integer is unambiguous and fast. More importantly, the version is what makes the CAS semantically meaningful: "I read version 7; I will only write if the cell is still at version 7." Any concurrent write that succeeded would have bumped to version 8, making my comparison fail. The version is the optimistic lock.*

---

**Q16. What is the failure mode if I drop CAS and just write directly?**

My answer (in my own words):

> *(write here)*

*Coaching note: without CAS, both concurrent writers succeed. The last write wins silently. Both clients see themselves as the owner momentarily. The grid state is technically consistent (the last write persists) but the losing client's optimistic state is wrong and there is no mechanism to correct it — they will believe they own the cell until the next broadcast tells them otherwise. This is last-write-wins behavior, which is acceptable for some use cases but provides no feedback to the losing client.*

---

**Q17. How do you prevent rapid-fire clicks from one user?**

My answer (in my own words):

> *(write here)*

*Coaching note: server-side per-user cooldown. In the hub method, before attempting CAS, check: `if (DateTime.UtcNow - lastCaptureTime[userId] < cooldownDuration) { send CaptureRejected with reason "cooldown"; return; }`. Store last capture time keyed by userId or connectionId in a ConcurrentDictionary. Update it on every successful capture. The cooldown resets only on success — a failed CAS does not reset the timer.*

---

**Q18. Where does cooldown state live and why server-side?**

My answer (in my own words):

> *(write here)*

*Coaching note: server-side in a ConcurrentDictionary keyed by connectionId or userId. Client-side throttle is not a security control — any code in the browser can be replaced by a WebSocket script that calls the hub directly, bypassing the client UI entirely. The server is the only location that can enforce game rules. For multi-instance: move to Redis `SET cooldown:{userId} 1 EX 2 NX` which is atomic and cross-instance.*

---

### Scaling

**Q19. What breaks with two backend instances?**

My answer (in my own words):

> *(write here)*

*Coaching note: two things break. First, in-memory state diverges: instance 1 has its own ConcurrentDictionary, instance 2 has its own. User A on instance 1 captures a cell; instance 2 never sees it. Second, broadcast fan-out is instance-local: SignalR's `Clients.All` only broadcasts to connections on the current instance. User B on instance 2 never receives the `CellCaptured` event. Both are fundamental — the fix requires a shared state store (Redis) and a cross-instance broadcast mechanism (SignalR Redis backplane).*

---

**Q20. What is the SignalR Redis backplane?**

My answer (in my own words):

> *(write here)*

*Coaching note: it is a pub/sub layer. When instance 1 calls `Clients.All.SendAsync("CellCaptured", ...)`, instead of broadcasting only to local connections, it publishes the message to a Redis channel. All instances subscribe to that channel and re-broadcast to their local connections. The result: every client on every instance receives the event. Add it with one NuGet package (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`) and one line of configuration. In Socket.io the equivalent is `@socket.io/redis-adapter`.*

---

**Q21. When would you move state out of memory entirely?**

My answer (in my own words):

> *(write here)*

*Coaching note: when you need more than one server instance (horizontal scaling), OR when you need state to survive restarts. Either requirement forces state into Redis (fast, supports atomic ops) or a database. Redis is the correct intermediate store for hot grid state. Postgres/MongoDB is correct for durable history and analytics.*

---

**Q22. What is the bottleneck at 10,000 concurrent users?**

My answer (in my own words):

> *(write here)*

*Coaching note: at 10k users, the broadcast fan-out (one event → 10k WebSocket writes) is the most likely bottleneck. SignalR handles this via connection multiplexing and async I/O, so 10k is manageable on a single server with enough RAM and CPU. The in-memory grid state (2500 cells) is not the bottleneck. The bottleneck is the number of active connections the OS and .NET threadpool can sustain simultaneously.*

---

**Q23. What changes for a 1000×1000 grid?**

My answer (in my own words):

> *(write here)*

*Coaching note: 1,000,000 cells. Full snapshot on connect is now ~50MB of JSON — unacceptable. Needs viewport-based lazy loading or a sequence-number-based diff. State store needs to move out of memory (too large for a single process). Frontend rendering must move to Canvas — 1M DOM elements is unusable. The broadcast stays the same (one event per capture) but the initial state delivery and frontend rendering both require architectural changes.*

---

**Q24. What is the rendering boundary on the frontend?**

My answer (in my own words):

> *(write here)*

*Coaching note: with Angular OnPush + trackBy and minimal @Input() passing, 2500–5000 DOM elements is smooth on modern hardware. Around 10,000 elements, layout cost starts to be noticeable on budget devices. Beyond ~20,000 elements, you need Canvas or virtualization. Canvas renders everything in one bitmap element — O(1) DOM complexity regardless of cell count — but requires manual hit detection for clicks and manual animation. Angular CDK virtual scroll works for linear lists, not 2D grids — Canvas is the real answer above ~10k cells.*

---

### Frontend and UX

**Q25. Why CSS grid not Canvas for 2500 cells?**

My answer (in my own words):

> *(write here)*

*Coaching note: at 2500 cells, CSS grid with Angular OnPush is correct — accessible, animatable with CSS transitions and class bindings, debuggable in DevTools, idiomatic Angular. Canvas would require manual hit detection for click coordinates, manual animation code, and significant complexity for zero performance benefit at this scale. Canvas is the right answer when you cross the 10k–20k cell boundary. Naming the boundary is what shows architectural awareness.*

---

**Q26. How does optimistic UI work in this project?**

My answer (in my own words):

> *(write here)*

*Coaching note: on click, `GridService.captureCell()` immediately updates the Signal with the user's color — no waiting for server. The OnPush CellComponent reacts to the signal change instantly. Then it invokes the hub method. If `CellCaptured` arrives (success), the server's authoritative state overwrites the optimistic value via another signal update — identical in the success case so the change is invisible. If `CaptureRejected` arrives (cooldown or race), the signal is reverted and a brief error CSS class is applied. The optimistic update makes the UX feel instant; the reconciliation ensures correctness.*

---

**Q27. What does Angular OnPush change detection do for grid performance?**

My answer (in my own words):

> *(write here)*

*Coaching note: `ChangeDetectionStrategy.OnPush` tells Angular to skip change detection on a component unless its `@Input()` reference changes, an event fires inside it, or an Observable/Signal it reads emits. Without it, a single `CellCaptured` signal update would trigger change detection on all 2500 `CellComponent` instances. With OnPush and surgical signal updates (`grid.update(g => { const n=[...g]; n[i]=newCell; return n; })`), only the component whose `@Input() cellState` reference changed re-renders. This is Angular's equivalent of `React.memo` — same principle, different API. The React equivalent answer: `React.memo` wraps a component so it skips re-render when props are reference-equal.*

---

**Q28. How do you handle reconnection from the user's perspective?**

My answer (in my own words):

> *(write here)*

*Coaching note: SignalR's automatic reconnect fires the `onreconnected` callback. In that callback, invoke `connection.invoke("GetSnapshot")` and replace the entire local grid state with the fresh snapshot. From the user's perspective: they may see a brief "reconnecting" indicator, then the grid snaps to the current state. Any cells that changed during the disconnect are corrected by the snapshot. The user does not see individual missed events — they see the current truth.*

---

### Deployment and Ops

**Q29. How do you make sure WebSocket works through your host?**

My answer (in my own words):

> *(write here)*

*Coaching note: most modern PaaS hosts (Render, Railway, Fly.io) support WebSocket connections out of the box. Key things to check: (1) the host does not strip the `Upgrade` header — most do not; (2) the host's load balancer supports sticky sessions (SignalR long-polling fallback requires that the same instance handles all requests for a connection — WebSocket mode does not, because a WebSocket connection is a single persistent TCP connection to one instance); (3) CORS is configured to allow the frontend origin with `AllowCredentials`. Test by checking the browser network tab for a 101 response and a "WS" connection type.*

---

**Q30. What would you monitor in production?**

My answer (in my own words):

> *(write here)*

*Coaching note: active WebSocket connection count (leading indicator of load), captures per second (game health metric), rejected captures per second (ratio of race rejections + cooldown rejections — high cooldown rejection rate means clients are being abusive), p99 latency from `CaptureCell` invocation to `CellCaptured` broadcast reaching clients, server memory (ConcurrentDictionary size), GC pressure (if you are allocating heavily on every capture).*

---

**Q31. What is the fallback if WebSocket is blocked?**

My answer (in my own words):

> *(write here)*

*Coaching note: SignalR automatically negotiates down to Server-Sent Events (server→client only) or Long Polling if WebSocket is unavailable. For an enterprise environment behind a restrictive proxy that strips WebSocket upgrade headers, Long Polling is the safe fallback — it works over standard HTTP. The user experience degrades (higher latency, more overhead) but the application remains functional. In production you would monitor which transport clients are using to detect proxy issues.*

---

### The Stack Question

**Q32. Why .NET when your stack is Node?**

My answer (in my own words):

> *(DO NOT write a template here — write your real answer. This is the question you must own completely. Below is a coaching note, not a script.)*

*Coaching note: this question will come in the CTO round. Your answer must convey three things: (1) the choice was deliberate, not a gap — you chose .NET because it was the fastest path to a correct, thoughtful solution in 72 hours, not because you could not figure out Node; (2) the architecture is language-agnostic — Hub = Namespace, Group = Room, TryUpdate = synchronous Map or Redis WATCH/MULTI, broadcast pattern is identical, the concepts transfer completely; (3) you are not hiding from the switch — you will be productive in Node within 2–3 weeks, the fundamentals are the same, the syntax is learnable. Do NOT say "I plan to learn Node." Say "I built this in .NET to deliver the best solution I could in three days. The architecture is identical on Node and I can walk you through exactly how it maps."*

---

### Reflective

**Q33. What is the biggest weakness of what you built?**

My answer (in my own words):

> *(Use the template below as a starting point — modify to match what you actually built.)*

The biggest structural weakness is in-memory state: if the server process restarts, the entire grid is wiped. For this assignment that is a deliberate and honest scope choice — adding persistence would have consumed time better spent on the real-time and concurrency work that the assignment is actually evaluating. The production fix is straightforward: use Redis as the state store, writing each capture synchronously via WATCH/MULTI/EXEC for CAS semantics; on startup, load grid state from Redis instead of initializing empty. This also enables horizontal scaling, since multiple instances share the same Redis-backed state and the SignalR Redis backplane handles cross-instance broadcast fan-out.

---

**Q34. If you had another week, what would you add?**

My answer (in my own words):

> *(write here)*

*Coaching note: three concrete answers, prioritized: (1) Redis state store + SignalR backplane — enables persistence and horizontal scaling, the most important production gap; (2) mobile-responsive layout with touch events — the current UX only works on desktop; (3) area-control gameplay rule — bonus points for capturing adjacent cells or completing rows, which makes the game genuinely interesting to play. Order matters — lead with the architectural upgrade, not the game feature.*

---

## 8. The Biggest Weakness — Fully Written Template

*(This is the one answer given to you fully written. Adapt it to be precisely true before you use it.)*

The biggest structural weakness is that the grid state lives entirely in process memory. A server restart wipes everything — every captured cell, every user's score, every active session. For this assignment, that is a deliberate scope decision: persisting state would have consumed most of the available time and diverted effort away from the real-time communication and concurrency work that the assignment is evaluating. I named this trade-off explicitly in my design document rather than leaving it as a hidden gap.

The production fix is well-defined. Move the `ConcurrentDictionary` to Redis: every `CaptureCell` call performs a Redis `WATCH/MULTI/EXEC` transaction for atomic CAS semantics equivalent to `TryUpdate`. On server startup, load grid state from Redis instead of initializing 2500 empty cells. On restart, the grid is fully restored. The SignalR Redis backplane then handles cross-instance broadcast fan-out, enabling horizontal scaling behind a load balancer. The cooldown store and user registry follow the same pattern — `SET key value EX seconds NX` for the cooldown, a Redis hash for user info. The application interface does not change; only the storage layer is swapped.
