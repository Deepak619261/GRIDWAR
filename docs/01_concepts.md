# Concepts: Real-Time Grid Systems

Read this once, end-to-end, before writing a single line of code or filling in design decisions. The goal is a mental model you can defend under pressure — not memorized definitions, but genuine understanding of the tradeoffs.

---

## 1. Real-Time Delivery: Polling vs Long Polling vs SSE vs WebSockets

**HTTP Polling** — the client sends a GET request every N seconds asking "anything new?" The server responds immediately, whether or not there is new data. Simple to implement, works everywhere, costs you: N-second lag, wasted requests when nothing changed, server load scales with clients × polling frequency. Acceptable for dashboards that update every 30 seconds. Completely wrong for a shared grid where you need sub-200ms propagation.

**Long Polling** — the client sends a request, the server holds it open until it has data to send, then responds and the client immediately issues another request. Halves the lag compared to polling, eliminates empty responses. Still costs you: one TCP connection per pending request, hard to scale past a few thousand concurrent users, awkward to implement correctly with timeouts and retries. A workaround, not a solution.

**Server-Sent Events (SSE)** — a persistent HTTP connection where the server pushes text events to the client. The browser has a native `EventSource` API for it. It is unidirectional: server → client only. The client cannot send data over the same connection. For a grid where the client needs to send capture events to the server, SSE forces you into an awkward pattern: SSE for updates, REST POST for actions. Doable but asymmetric. SSE is the right call for read-heavy broadcast scenarios (live scores, news feeds) where clients never talk back.

**WebSockets** — a full-duplex, persistent TCP connection established via an HTTP upgrade handshake. After the handshake, both sides can send frames at any time, in any direction, with minimal overhead (2–14 bytes of framing per message vs HTTP's multi-hundred-byte headers). This is the right answer for a shared grid. Every user needs to both receive updates (grid state changes) and send commands (capture a cell). WebSockets give you that over a single connection.

**Why WebSocket wins here:** bidirectional communication, sub-10ms latency in practice, minimal per-message overhead, and native support in every modern browser and server framework. The cost — maintaining persistent connections, handling disconnects, slightly more complex infrastructure — is exactly what SignalR manages for you.

---

## 2. WebSocket Protocol Basics

The WebSocket protocol starts as HTTP. The client sends a regular HTTP GET with two special headers: `Upgrade: websocket` and `Connection: Upgrade`. The server responds with `101 Switching Protocols` and from that point on the TCP connection speaks the WebSocket framing protocol, not HTTP. No more request/response cycles — both sides send frames whenever they have something to say.

A WebSocket **frame** is a small binary envelope: opcode (is this text, binary, ping, pong, close?), masking bit, payload length (variable width), optional mask key, and payload. Text frames carry UTF-8, binary frames carry raw bytes. You rarely think about frames directly — SignalR and the browser's WebSocket API handle framing for you.

**Ping/pong** is the keep-alive mechanism. Either side can send a ping frame; the other must respond with a pong. This detects dead connections that the OS has not yet noticed (e.g., a phone that lost WiFi mid-session). SignalR sends pings automatically.

**Disconnect behavior:** a clean disconnect sends a Close frame with a status code. An unclean disconnect (power loss, network drop) leaves the server holding a half-open connection until a ping times out. This is why you need explicit timeout handling and why SignalR's automatic reconnect logic matters — your client will silently die without it.

---

## 3. SignalR: What It Adds on Top of WebSockets

Raw WebSockets give you a pipe. SignalR gives you a structured messaging system built on top of that pipe, with fallbacks for when WebSockets are not available. Specifically:

**Transport negotiation:** SignalR tries WebSockets first, falls back to Server-Sent Events, falls back to long polling. In 2024 almost all environments support WebSockets, so negotiation completes in milliseconds. The value is that you do not have to write the fallback yourself.

**Hub abstraction:** instead of sending raw text frames, you define a `Hub` class with methods. The client calls those methods by name; SignalR routes the call, deserializes arguments, invokes the method, and handles the response. Think of it as an RPC layer over WebSocket.

**Group management:** SignalR has first-class support for groups (sets of connections). `Groups.AddToGroupAsync(connectionId, groupName)` and `Clients.Group(groupName).SendAsync(...)` let you fan out to subsets. For a grid, you would put all users into one group ("grid") and broadcast there instead of to `Clients.All` — functionally identical for a single grid, but the pattern scales to multi-room scenarios.

**Automatic reconnect:** the .NET SignalR client and the JavaScript client both support configurable retry policies. When a connection drops, the client attempts reconnection and fires lifecycle callbacks so you can re-fetch state.

### SignalR → Node + Socket.io Mapping Table

| SignalR (.NET) | Socket.io (Node) | Notes |
|---|---|---|
| `Hub` class | `io.of('/namespace')` | Hub = Namespace. Multiple hubs = multiple namespaces. |
| `Groups.AddToGroupAsync` | `socket.join('room')` | Group = Room. Identical concept. |
| `Clients.All.SendAsync(...)` | `io.emit(...)` | Broadcast to every connected client. |
| `Clients.Caller.SendAsync(...)` | `socket.emit(...)` | Send only to the originating connection. |
| `Clients.Others.SendAsync(...)` | `socket.broadcast.emit(...)` | Everyone except the originator. |
| `Clients.Group("x").SendAsync(...)` | `io.to('room').emit(...)` | Broadcast to a specific room. |
| Automatic reconnect via `HubConnectionBuilder.WithAutomaticReconnect()` | `io(url, { reconnection: true, reconnectionAttempts: 5 })` | Socket.io reconnects by default. |
| Transport fallback (WS → SSE → LongPolling) | `transports: ['websocket', 'polling']` | Socket.io tries WebSocket first, falls back to polling. |
| `ConcurrentDictionary<K,V>` for shared state | `Map` + explicit mutex or single-threaded reasoning | See section 5. |

---

## 4. Shared Mutable State and Concurrency

Here is the core problem: user A and user B both see cell 42 as empty. They both click it at the same millisecond. Both connections send `CaptureCell(42)` to the server. Both handlers run concurrently. Without any coordination, both reads see empty, both writes succeed, and whoever wrote last wins — but neither user was told the other was about to write. This is a classic race condition.

Three strategies for handling it:

### (a) Optimistic Last-Write-Wins
No coordination. Server accepts every capture, broadcasts the winner, ignores the loser implicitly. The last writer's update propagates and the earlier one is silently overwritten. Simple to implement. Correct for a game where "capture" means "most recent click wins." The failure mode: both users briefly see themselves as the owner before the broadcast reconciles state. In practice, at <200ms latency, users rarely notice. This is a valid choice.

### (b) Versioned CAS — Compare-and-Swap via TryUpdate
Every cell carries a `Version` counter. When a handler reads a cell, it also reads the version. It only writes if the version is still what it read — `TryUpdate(key, newValue, comparisonValue)` does this atomically in .NET. If two handlers race, one wins the TryUpdate and the other gets `false` back. The loser sends a rejection to the caller. The winner broadcasts the update. This is correct and explicit: exactly one writer wins, the other is told why they lost. This is the right choice for a competitive capture game. It costs you one rejection message per lost race, which is rare at human click speeds.

### (c) Pessimistic Per-Cell Lock
Acquire a `lock` or `SemaphoreSlim` on the cell before reading. Release after writing. Guarantees serialized access. The problem: locks block. If 100 users click 100 different cells simultaneously, each lock is independent and there is no contention — fine. But if a slow operation holds the lock (a DB write, an async await), you are blocking other threads on that cell unnecessarily. For an in-memory operation that takes microseconds, the lock is technically safe but philosophically wrong: you are preventing concurrency for a problem that CAS handles with no blocking. For production, pessimistic locking on thousands of cells is an antipattern. Do not use it here.

**For a capture game: CAS via TryUpdate is correct.** It handles races explicitly, never blocks, and gives you a rejection path to tell the losing client what happened.

---

## 5. ConcurrentDictionary and TryUpdate

`ConcurrentDictionary<TKey, TValue>` is .NET's lock-free thread-safe dictionary. It uses fine-grained striped locking internally so reads and writes on different keys rarely contend. For most operations (`TryGetValue`, `TryAdd`, `[key] = value`) it is safe to call from multiple threads without any outer synchronization.

`TryUpdate(key, newValue, comparisonValue)` is the CAS operation. It atomically checks whether the current value equals `comparisonValue`, and if so, replaces it with `newValue`. Returns `true` if the swap happened, `false` if the current value did not match (meaning someone else wrote first). This is the exact primitive you need for conflict resolution.

```csharp
// Read current state
var current = _grid[index];

// Attempt to capture — only succeeds if no one else has written since we read
var updated = current with { OwnerId = userId, OwnerColor = color, Version = current.Version + 1 };
bool won = _grid.TryUpdate(index, updated, current);
```

If `won` is false, the caller lost the race. Send them `CaptureRejected`. If `won` is true, broadcast `CellCaptured` to all clients.

**The Node nuance:** JavaScript is single-threaded — there is no true parallelism on a single Node process. A simple synchronous read-modify-write on a `Map` is safe *as long as there is no `await` between the read and the write*. The moment you introduce `await db.findOne(...)` between reading and writing, the event loop can process another incoming message in between, and you have a race. The safe Node patterns are: (1) keep capture logic fully synchronous with no awaits (fine for in-memory), (2) use an explicit mutex library (e.g., `async-mutex`), (3) use Redis `WATCH/MULTI/EXEC` for distributed CAS. In-memory + no await = safe. Anything else needs explicit serialization.

---

## 6. Broadcasting Strategies

After a capture succeeds, you need to tell all connected clients. Two patterns:

**Pattern A — Broadcast to All (including originator):** server validates, then calls `Clients.All.SendAsync("CellCaptured", cellState)`. The originator gets the canonical server state back as confirmation. This is one message. The client receives the broadcast and uses it to reconcile optimistic local state. Clean and simple.

**Pattern B — Ack to Caller + Broadcast to Others:** server sends `Clients.Caller.SendAsync("CaptureAcknowledged", ...)` and then `Clients.Others.SendAsync("CellCaptured", ...)`. Two messages, slightly more complex client logic. The advantage: you can send different payloads to the originator (e.g., including a capture timestamp or score delta) vs. other clients. For this assignment, the payloads are identical so this complexity buys nothing.

**Use Pattern A.** One broadcast, less code, same result. The originator receiving their own event back is how optimistic UI gets confirmed — they apply state speculatively on click, then replace it with the server's authoritative broadcast when it arrives.

`Clients.Others` is useful when the originator has already applied the update locally and does not need the echo. But that saves one tiny message at the cost of making the client's optimistic state permanent with no server confirmation path. Pattern A is safer.

---

## 7. Initial State Delivery

When a new user connects, they need the current grid. Three options:

**Full snapshot in `OnConnectedAsync`:** serialize all 2500 cells (50×50) and send them to `Clients.Caller` immediately on connection. For 2500 cells with ~50 bytes of state each, this is ~125KB of JSON — well within WebSocket frame limits, fast to transmit on any reasonable connection, trivial to implement. Use this.

**REST endpoint + WebSocket diffs:** client fetches `GET /api/grid` via HTTP on page load, then connects to the hub and receives only delta events. Architecturally cleaner separation of concerns, easier to cache the snapshot at a CDN. The complexity cost: you need to handle the gap between when the snapshot was fetched and when the WebSocket connection is established — any events fired during that window are lost. You need a sequence number on both the snapshot and events to detect and fill the gap. For 2500 cells and a three-day assignment, this is overengineering.

**Snapshot + sequence number hybrid:** snapshot carries a monotonically increasing `SequenceNumber`. Hub events carry the same counter. Client buffers events received before the snapshot is applied and replays any with a higher sequence number. Correct, scalable, complex. Production-grade. Not for this assignment.

**Use full snapshot in `OnConnectedAsync`.** Name the alternatives and their tradeoffs in your submission. That is what shows architectural thinking without overbuilding.

**When does full snapshot stop scaling?** At ~10,000 cells (500×200 grid), a full snapshot approaches 500KB of JSON per connection event. At that size, you want chunked delivery or REST+diff. At 1,000,000 cells, you absolutely need viewport-based lazy loading.

---

## 8. Reconnection and State Reconciliation

A user's WiFi drops for 5 seconds. The SignalR client fires the `onreconnected` callback when it re-establishes. During those 5 seconds, the user missed N capture events. Their local grid is stale.

Three options:

**Full re-snapshot on reconnect (use this):** in the `onreconnected` callback, invoke a hub method `GetGridSnapshot()` and replace local state entirely. Simple, always correct, slightly wasteful — you send 2500 cells even if only 3 changed. For a three-day assignment, this is the right call. Mention the alternatives.

**Sequence-number-based catch-up:** server maintains an event log with sequence numbers. Client sends its last-known sequence number on reconnect; server replays only the delta. Efficient, correct, significantly more code. Worth mentioning as "what I'd add in production."

**Per-connection event log:** server buffers events per connection-id and replays on reconnect. Works for short disconnects, wastes memory for long ones. Overkill.

---

## 9. Backpressure and Abuse Prevention

Nothing stops a determined user from writing a script that sends `CaptureCell` 1000 times per second. Client-side throttle is not sufficient — any code running in the browser can be bypassed by a motivated attacker calling the WebSocket protocol directly.

**Server-side per-user cooldown** is the correct answer. Maintain a `ConcurrentDictionary<string, DateTime>` keyed by connection-id (or session-id) mapping to the timestamp of the user's last successful capture. In `CaptureCell`, reject immediately if `DateTime.UtcNow - lastCapture < cooldownDuration`. No database, no external dependency, O(1) lookup.

**For a single server**, in-memory storage is fine. The connection-id is ephemeral — it resets on reconnect — which is acceptable; the user gets a fresh cooldown after a disconnect.

**For multiple servers**, in-memory cooldown state is per-instance. User A connects to instance 1, instance 2 has no record of their cooldown. They can bypass the limit by reconnecting to instance 2. The fix: move cooldown state to Redis. `SET cooldown:{userId} 1 EX 2 NX` — set with a 2-second TTL, only if not already set (`NX`). Returns `OK` if allowed, `nil` if on cooldown. Atomic, cross-instance, no race condition.

For this assignment, in-memory is fine and you should say so explicitly. The Redis path is your answer when the interviewer asks "how would you handle this at scale?"

---

## 10. Frontend Rendering at Scale

A 50×50 grid = 2500 `<div>` elements. Angular can handle this comfortably with proper change detection configuration. Rules:

1. **`ChangeDetectionStrategy.OnPush` on every `CellComponent`** — Angular only re-runs change detection on this component when its `@Input()` reference changes, an event fires inside it, or an Observable/Signal it subscribes to emits. Without this, a single `CellCaptured` event triggers change detection on all 2500 cells.
2. **`trackBy` in `*ngFor`** — `trackBy: trackByIndex` tells Angular to reuse existing DOM elements when the array updates rather than destroy and recreate them. Never rely on index-based tracking for a grid where cells are updated in place — use the cell's `index` property as the identity key.
3. **Pass only what the cell needs via `@Input()`** — do not pass the entire grid array to each cell. Pass `cellState: CellState` and `isMyCell: boolean` only. Narrow inputs = fewer reference changes = fewer re-renders.
4. **Update state correctly with Signals** — use `signal<CellState[]>(initialGrid)` in `GridService`. When a `CellCaptured` event arrives, update only the changed index: `this.grid.update(prev => { const next = [...prev]; next[event.index] = event.cellState; return next; })`. Angular's signal graph propagates the change only to components that read the affected signal slice.

**The boundary where CSS grid stops working:** around 10,000 cells, DOM layout cost becomes noticeable on budget devices. At 100,000 cells, CSS grid is unusable — you need either `<canvas>` (render everything in one bitmap, track hit regions manually) or Angular CDK virtual scroll (though CDK virtual scroll is designed for linear lists, not 2D grids — Canvas is the real answer above 10k). For this assignment, 2500 cells with OnPush is fine. Say explicitly in your trade-offs that you know the boundary.

---

## 11. Optimistic UI Updates

**Pessimistic (wait for server):** user clicks → nothing happens visually → server processes → broadcast arrives → cell updates. Lag is visible. Feels slow. Wrong choice for a game.

**Optimistic with rollback:** user clicks → cell immediately shows their color locally → server processes → if broadcast confirms, keep it → if rejection arrives (lost race, cooldown, etc.), revert to previous state. This is the right choice. Feels instant, handles failure correctly.

**Optimistic with no rollback:** user clicks → cell shows their color → never check if server agreed. Wrong. State diverges silently. Do not do this.

**Implementation:** on click, immediately call `this.grid.update(...)` in `GridService` to color the cell speculatively — the Signal update propagates instantly to the `CellComponent` via OnPush. When `CellCaptured` arrives from the server, apply the authoritative state via another Signal update. If `CaptureRejected` arrives, revert the cell's state in the signal and set a brief `isError` flag to trigger the visual feedback (red flash, shake animation via CSS class binding). Since `CellCaptured` is broadcast to all including the originator (Pattern A from section 6), the originator's optimistic state is overwritten by the server's canonical state — which is the same data in the success case, so the visual result is seamless.

---

## 12. Scaling Beyond One Server

Your current architecture: one process, in-memory state, all connections to the same instance. This works for one server. Two servers break everything.

**What breaks:** user A is on instance 1, user B is on instance 2. User A captures cell 42. Instance 1 updates its local `ConcurrentDictionary` and broadcasts to all connections *on instance 1*. User B, connected to instance 2, never receives the event. Instance 2's grid diverges from instance 1's. The application is incorrect.

**Fix 1 — SignalR Redis Backplane:** add a Redis pub/sub layer. When instance 1 broadcasts, it publishes to Redis. Instance 2 subscribes to the same Redis channel and re-broadcasts to its local connections. All clients on all instances see the event. One NuGet package: `Microsoft.AspNetCore.SignalR.StackExchangeRedis`. One line: `AddSignalR().AddStackExchangeRedis(connectionString)`. The in-memory grid state still diverges — you also need to move grid state to Redis. But the backplane fixes broadcast fan-out.

**Fix 2 — Redis as the single source of truth:** move `ConcurrentDictionary` to Redis. Every `CaptureCell` call reads from and writes to Redis (using `WATCH/MULTI/EXEC` for CAS). The backplane handles broadcast. Both instances read the same state. This is the production architecture. More latency per write (network round-trip to Redis vs. memory access), more complexity, fully correct.

**The interview gold answer:** "My current design is one-instance; I'd add the SignalR Redis backplane for broadcast fan-out and store grid state in Redis with WATCH/MULTI/EXEC for CAS. The cooldown store moves to Redis with SET NX EX. That gets you horizontal scaling with no state divergence."

In Node/Socket.io: the equivalent is Socket.io's Redis adapter (`socket.io-redis` or `@socket.io/redis-adapter`). Same concept, same Redis. Grid state uses the same Redis commands.

---

## 13. Persistence: Should the Grid Survive a Server Restart?

**For this assignment: no.** In-memory state, intentionally ephemeral. Say so explicitly in your design decisions and submission. This is an honest, defensible scope choice — not a gap.

**For production:** two options.
- **Redis with write-behind:** every capture writes to Redis synchronously (because you need it for multi-instance) and queues an async write to Postgres for analytics and durability. Fast writes, eventual durability.
- **Postgres as source of truth:** every capture is a DB write. Slower (milliseconds vs. microseconds), fully durable, queryable for leaderboards and analytics. Acceptable for low-frequency captures; problematic for rapid-fire bursts.

**Your "what I'd add next" answer:** "Persist grid state to Redis on every write. On startup, load from Redis instead of initializing empty. This survives restarts and is the prerequisite for horizontal scaling."

---

## Self-Check (answer each in 30 seconds)

1. A user clicks a cell. Walk me through every step from the click event in the browser to all other clients seeing the update, naming each layer of the stack.
2. Two users click cell 42 at the same millisecond. Your server runs `TryUpdate` for both. Exactly one succeeds. What does the server send to each user, and what does the client do when it receives each message?
3. A user's network drops for 8 seconds and then reconnects. What happens on the server, what happens on the client, and how does the user's grid return to a correct state?
4. You deploy a second backend instance behind a load balancer. Name two specific things that break immediately and name the fix for each.
5. Your current CSS grid handles 2500 cells. A new requirement says 250,000 cells. What changes in the frontend architecture and why?
