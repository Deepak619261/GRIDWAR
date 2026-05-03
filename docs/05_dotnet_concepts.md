# .NET Concepts — Learned While Building GRIDapp

This file covers the .NET internals you encounter directly while building this project. Every section connects to a specific piece of code you will write. Read each section before you write that code. The concepts here map to your Week 7 .NET Depth study block and will be asked about in interviews at Zeta, Chargebee, and any company that sees .NET on your resume.

---

## 1. async/await — What Actually Happens

### The surface

You write `async Task CaptureCell(int index)` in your hub. You `await` a `SendAsync` call. The method appears to run top-to-bottom. This is a lie the compiler tells you.

### The state machine

When the compiler sees `async`, it rewrites your entire method into a struct that implements `IAsyncStateMachine`. Your `await` points become state transitions. Each time you `await` something:

1. The runtime checks: is the awaitable already completed?
2. If yes — continue synchronously. No thread switch, no overhead.
3. If no — register a continuation (a callback) to run when the awaitable completes, then **return the thread to the thread pool**.

This is the key insight: `await` does not block a thread. It suspends the method and frees the thread to do other work. When the I/O completes, a thread pool thread picks up the continuation and runs the rest of your method from the next state.

```csharp
// What you write
public async Task CaptureCell(int index)
{
    var result = _grid.TryCapture(index, userId, color);  // sync, fast
    if (result.Success)
        await Clients.All.SendAsync("CellCaptured", result.Cell); // I/O — releases thread here
}

// What actually happens (simplified pseudocode)
// State 0: execute sync work, start SendAsync, register continuation, return
// State 1: continuation fires when SendAsync completes, method is done
```

### Task vs ValueTask

`Task` is a reference type — it allocates on the heap every time. For async methods that complete synchronously most of the time (hot path operations, cache hits), this allocation is waste.

`ValueTask` is a struct — when the operation completes synchronously (which is the common case for in-memory operations like reading a ConcurrentDictionary), it avoids the heap allocation entirely. When it is truly async, it falls back to `Task`-like behavior.

**For this project:** hub methods return `Task`, which is correct — they almost always have actual I/O (the `SendAsync` over WebSocket). If you had a method that only accesses in-memory state and almost never awaits, you would consider `ValueTask`.

**Interview rule:** use `Task` by default. Use `ValueTask` when profiling shows allocation pressure on a hot-path async method that often completes synchronously.

### ConfigureAwait(false)

When an `await` completes, where does the continuation run? In ASP.NET Core (and SignalR), there is no synchronization context — the continuation runs on any available thread pool thread. So `ConfigureAwait(false)` is a no-op in ASP.NET Core.

In older ASP.NET (non-Core), there was a synchronization context that marshalled continuations back to the original request context. `ConfigureAwait(false)` opted out of that, preventing deadlocks and improving throughput. **In library code** (code that does not depend on HttpContext or SignalR's connection context), always use `ConfigureAwait(false)` because the library might be called from a context that has a synchronization context (e.g., a WinForms app).

**For this project:** you are in ASP.NET Core. `ConfigureAwait(false)` is optional but harmless. Add it to library/service code as a habit.

### The deadlock pattern (the most common interview question)

```csharp
// THIS DEADLOCKS in older ASP.NET (not Core, but know it for interviews)
public string GetData()
{
    return GetDataAsync().Result; // .Result blocks the current thread
}

public async Task<string> GetDataAsync()
{
    await Task.Delay(1);           // tries to resume on the original thread
    return "data";                 // but original thread is blocked by .Result above
}
// Result: deadlock. The blocked thread is waiting for the Task,
// but the Task continuation needs the blocked thread to run.
```

**The fix:** never call `.Result` or `.Wait()` on a Task in synchronous code that might have a synchronization context. Either go async all the way, or use `ConfigureAwait(false)` on the awaitable so the continuation does not try to marshal back. In ASP.NET Core there is no sync context, so this deadlock does not occur in practice — but know the explanation.

### async void — why it is dangerous

`async void` is only valid for event handlers. You must never use it in application code. The reason: exceptions thrown inside `async void` methods are not captured by the caller. They propagate to the SynchronizationContext and typically crash the application. There is also no way to await an `async void` method — the caller cannot wait for it to finish or catch its exceptions.

```csharp
// WRONG — caller has no way to observe the exception
public async void Fire() { await Task.Delay(100); throw new Exception("oops"); }

// CORRECT — caller awaits Task and can catch exceptions
public async Task Fire() { await Task.Delay(100); throw new Exception("caught"); }
```

In SignalR hub methods, always return `Task` or `Task<T>`, never `void`.

### CancellationToken

`CancellationToken` is how you propagate a cancellation signal through async call chains. In ASP.NET Core, the framework creates a token that is cancelled when the HTTP request is aborted. SignalR hub methods can accept a `CancellationToken` parameter that is cancelled when the client disconnects.

```csharp
public async Task LongRunningOperation(CancellationToken cancellationToken)
{
    for (int i = 0; i < 1000; i++)
    {
        cancellationToken.ThrowIfCancellationRequested(); // cooperative check
        await DoWorkAsync(cancellationToken); // pass token down
    }
}
```

**For this project:** your `CaptureCell` method is fast (in-memory + WebSocket send), so you do not need explicit cancellation checks. But for any background work or loops, pass the token through.

**Node/Socket.io equivalent:** `AbortController` + `signal` passed to fetch calls. Same concept — a signal that can be cancelled upstream and checked downstream.

---

## 2. Dependency Injection in ASP.NET Core

### What DI is and why

DI (Dependency Injection) is a pattern where an object declares what it needs (via constructor parameters), and a container builds and provides those dependencies. ASP.NET Core has a built-in DI container registered in `Program.cs`.

Without DI, `GridHub` would `new GridService()` directly. Every hub instance gets its own service instance. No shared state. The grid would be different per connection. DI with a singleton lifetime fixes this.

### The three lifetimes

| Lifetime | Created | Destroyed | Use when |
|---|---|---|---|
| **Transient** | Every time requested | When scope ends | Lightweight, stateless services. Each consumer gets a fresh instance. |
| **Scoped** | Once per HTTP request (or per SignalR connection) | Request/connection ends | Services that should be shared within a single request but not across requests. DbContext is the canonical example. |
| **Singleton** | Once for the app lifetime | App shuts down | Shared state across all requests and connections. Your `GridService` is singleton. |

```csharp
// Program.cs
builder.Services.AddSingleton<GridService>();    // one instance, shared by all hubs
builder.Services.AddScoped<UserSessionService>(); // one per connection
builder.Services.AddTransient<SomeStatelessUtil>(); // new every time
```

### How SignalR hubs interact with DI

A hub instance is created per connection, per method invocation (transient by nature). The hub itself is never registered in DI — SignalR manages its lifecycle. But the services the hub depends on are resolved from DI. If `GridService` is singleton, all hub instances share the same `GridService`. This is exactly what you want: one grid, many connections.

```csharp
public class GridHub : Hub
{
    private readonly GridService _grid;

    // GridService is injected from the DI container — it is the SAME instance for every hub invocation
    public GridHub(GridService grid) => _grid = grid;
}
```

### Captive dependency — the most common DI bug

A captive dependency is when a longer-lived service holds a reference to a shorter-lived service. The classic case: a singleton holds a reference to a scoped service.

```csharp
// WRONG
builder.Services.AddSingleton<GridService>();
builder.Services.AddScoped<SomeDbContext>();

public class GridService
{
    private readonly SomeDbContext _db; // singleton captures scoped service

    public GridService(SomeDbContext db) => _db = db; // db is ONE instance for app lifetime
    // Problem: SomeDbContext is not thread-safe, and its state accumulates forever
    // EF Core DbContext is designed to be short-lived — never inject into singleton
}
```

**The fix — `IServiceScopeFactory`:** if a singleton genuinely needs to create a short-lived service, inject `IServiceScopeFactory` instead and create a scope explicitly.

```csharp
public class GridService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public GridService(IServiceScopeFactory factory) => _scopeFactory = factory;

    public async Task SomeBackgroundWork()
    {
        using var scope = _scopeFactory.CreateScope(); // create a fresh scope
        var db = scope.ServiceProvider.GetRequiredService<SomeDbContext>(); // short-lived
        await db.DoSomethingAsync();
    } // scope disposed here, db disposed here
}
```

**For this project:** `GridService` is singleton with no scoped dependencies — no captive dependency risk. But know this cold for interviews; it trips up most mid-level candidates.

### Scoped services in background services

`IHostedService` / `BackgroundService` runs as singleton. If it needs a scoped service (e.g., DbContext), it must use `IServiceScopeFactory`. This is the same pattern as above. Any `BackgroundService` that accesses a database without `IServiceScopeFactory` has a bug waiting to happen.

**Node/Socket.io equivalent:** there is no equivalent built-in DI system in Node. Dependencies are typically managed by module-level singletons (exported from a module) or passed explicitly. Libraries like `awilix` or `tsyringe` provide DI containers. The lifetime concepts are the same but not enforced by the framework.

---

## 3. ASP.NET Core Middleware Pipeline

### What it is

In ASP.NET Core, an HTTP request passes through a linear chain of middleware components. Each component can: (a) process the request, (b) call the next middleware, or (c) short-circuit the chain and return a response. The order of middleware registration in `Program.cs` is the order of execution.

```
Request → Middleware A → Middleware B → Middleware C → Endpoint handler
Response ← Middleware A ← Middleware B ← Middleware C ←
```

Each middleware runs code, calls `next()`, and then runs more code on the way back. This is why order matters.

### The middleware order that matters for this project

```csharp
// Program.cs — ORDER IS NOT ARBITRARY
app.UseRouting();       // 1. Match request to a route (required first)
app.UseCors();          // 2. CORS must come BEFORE auth — otherwise auth rejects preflight
app.UseAuthentication(); // 3. Identity who the user is
app.UseAuthorization(); // 4. Check if they are allowed
app.MapHub<GridHub>("/hubs/grid"); // 5. Endpoint
```

**Why CORS before auth:** a browser CORS preflight is an OPTIONS request with no credentials. If auth middleware runs first and sees an unauthenticated request, it rejects it before CORS middleware can add the `Access-Control-Allow-Origin` header. The browser sees a 401 instead of a CORS OK, and blocks the actual request. Always `UseCors()` before `UseAuthentication()`.

### Writing custom middleware

```csharp
// Minimal inline middleware
app.Use(async (context, next) =>
{
    // Code here runs BEFORE the next middleware (on the way IN)
    Console.WriteLine($"Request: {context.Request.Path}");

    await next(context); // call the next middleware

    // Code here runs AFTER the next middleware (on the way OUT / response)
    Console.WriteLine($"Response: {context.Response.StatusCode}");
});
```

**For this project:** you do not write custom middleware — SignalR handles the WebSocket upgrade. But the pipeline matters for CORS configuration, and middleware order is a common interview question.

### Options pattern

ASP.NET Core's recommended way to load configuration:

```csharp
// appsettings.json
{ "Grid": { "Width": 50, "Height": 50, "CooldownSeconds": 1.5 } }

// Model
public class GridOptions { public int Width { get; set; } public int Height { get; set; } public double CooldownSeconds { get; set; } }

// Program.cs
builder.Services.Configure<GridOptions>(builder.Configuration.GetSection("Grid"));

// Service — inject IOptions<GridOptions>
public class GridService
{
    private readonly GridOptions _options;
    public GridService(IOptions<GridOptions> opts) => _options = opts.Value;
}
```

`IOptions<T>` — singleton, value read once at startup.
`IOptionsSnapshot<T>` — scoped, re-reads on each scope (per-request config changes).
`IOptionsMonitor<T>` — singleton with a change notification callback.

**Node/Socket.io equivalent:** `process.env` or a config module that reads from environment. No equivalent pattern — Node does not enforce a configuration abstraction, so teams implement it ad-hoc.

---

## 4. Lock vs SemaphoreSlim — Async-Compatible Locking

### Why you cannot await inside a lock

```csharp
lock (_obj)
{
    await Task.Delay(100); // COMPILE ERROR in C#
    // C# forbids this because Monitor (which lock uses) is thread-affine.
    // The thread that enters Monitor.Enter must be the same thread that calls Monitor.Exit.
    // An await can resume on a different thread pool thread. This would be undefined behavior.
}
```

This is not just a warning — it is a compile error. If you need to await inside a critical section, you need `SemaphoreSlim`.

### SemaphoreSlim for async-compatible locking

```csharp
private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1); // acts as a mutex

public async Task CriticalSectionAsync()
{
    await _semaphore.WaitAsync(); // async-compatible — does not block a thread while waiting
    try
    {
        await DoSomeAsyncWork(); // you can await here safely
    }
    finally
    {
        _semaphore.Release(); // always release, even on exception
    }
}
```

A `SemaphoreSlim(1, 1)` acts as a binary mutex — at most one waiter holds it at a time. Unlike `lock`, `WaitAsync()` does not block the calling thread when the semaphore is contended — it awaits asynchronously, releasing the thread.

### When to use each

| Primitive | Use when |
|---|---|
| `lock` | Fast synchronous critical sections with no awaits inside. In-memory reads/writes. |
| `SemaphoreSlim` | Any critical section that needs to await inside. File I/O, DB calls, external APIs. |
| `ConcurrentDictionary` | Concurrent reads and writes to a dictionary — no explicit locking needed. |
| `Interlocked` | Single atomic integer/long operations (increment, compare-exchange). |

**For this project:** `ConcurrentDictionary.TryUpdate` handles concurrency for cell state. You do not need `SemaphoreSlim` anywhere. But this is a top-5 .NET interview question at Zeta and similar companies.

**Node/Socket.io equivalent:** since Node is single-threaded, synchronous code does not need locks. For async operations, use the `async-mutex` library or serialize access by chaining Promises explicitly.

---

## 5. ConcurrentDictionary — Deeper Internals

*(Section 5 of `01_concepts.md` covers CAS. This section covers the data structure itself.)*

### How it works under the hood

`ConcurrentDictionary<K,V>` divides the key space into **segments** (by default, `Environment.ProcessorCount` segments). Each segment has its own `lock`. When you access a key, the runtime hashes the key, determines which segment it belongs to, and acquires only that segment's lock.

This means:
- Operations on different keys that hash to different segments run in parallel — no contention.
- Operations on the same key or different keys in the same segment serialize — one waits.
- In practice, with a good hash distribution across many keys, concurrent operations rarely contend.

### Operations and their thread-safety guarantees

| Operation | Thread-safe | Notes |
|---|---|---|
| `TryGetValue` | Yes | Returns a snapshot of the value at that instant |
| `TryAdd` | Yes | Only adds if key does not exist |
| `TryUpdate(k, newV, compV)` | Yes | CAS — only updates if current value equals compV |
| `TryRemove` | Yes | Only removes if key exists |
| `[key] = value` | Yes | Overwrites unconditionally |
| `GetOrAdd` | Yes* | The value factory may be called multiple times under contention — side effects are unsafe |
| `AddOrUpdate` | Yes* | Same caveat — value factory may run multiple times |

**The GetOrAdd caveat:** `GetOrAdd(key, factory)` is not atomic. Between the check (key missing) and the add, another thread can add the key. The factory runs on the losing thread and its result is discarded. The returned value is always whatever is in the dictionary — but if your factory has side effects (creating a DB record, starting a service), those effects happen twice. For value creation without side effects (constructing an object), `GetOrAdd` is fine.

### When NOT to use ConcurrentDictionary

If you need to perform multiple operations atomically — read a value, compute a new value, write it back, AND also update a separate data structure — `ConcurrentDictionary` does not help you. Each individual operation is atomic; a sequence of them is not. For that, you need a full lock around all the operations, or you need to redesign using CAS on a single piece of state.

```csharp
// NOT atomic — a race exists between read and the two writes
var current = _grid[index];
_grid[index] = current with { ... };   // write 1
_leaderboard[userId] = newCount;        // write 2 — another thread can read stale state between write 1 and write 2
```

For this project, the leaderboard is computed on-demand from the grid rather than maintained as a separate structure — this avoids the two-write atomicity problem entirely.

---

## 6. Task Parallel Library — WhenAll and WhenAny

### Task.WhenAll

Starts multiple async operations and awaits them all completing. All run concurrently.

```csharp
// SEQUENTIAL — total time = T1 + T2 + T3
await DoFirstThing();
await DoSecondThing();
await DoThirdThing();

// PARALLEL — total time = max(T1, T2, T3)
await Task.WhenAll(DoFirstThing(), DoSecondThing(), DoThirdThing());
```

**For this project:** if you need to broadcast to multiple groups simultaneously (e.g., grid snapshot AND online count AND leaderboard on connect), you can fan them out with `Task.WhenAll`.

```csharp
await Task.WhenAll(
    Clients.Caller.SendAsync("Connected", user, snapshot),
    Clients.All.SendAsync("OnlineCount", _grid.OnlineCount)
);
```

### Task.WhenAny

Returns when the first task completes. Useful for timeouts.

```csharp
var operationTask = DoSomethingAsync();
var timeoutTask = Task.Delay(TimeSpan.FromSeconds(5));

var completed = await Task.WhenAny(operationTask, timeoutTask);
if (completed == timeoutTask)
    throw new TimeoutException("Operation timed out");
```

**Node equivalent:** `Promise.all` = `Task.WhenAll`. `Promise.race` = `Task.WhenAny`. Identical concept.

---

## 7. Hub Lifecycle and Context

### How SignalR manages hub instances

SignalR creates a **new hub instance for every method invocation**, not per connection. This is important: do not store connection-specific state in hub instance fields — it will not persist across invocations.

```csharp
public class GridHub : Hub
{
    private string _userId; // WRONG — this is lost after the method returns
                            // next invocation creates a new GridHub instance

    private readonly GridService _grid; // CORRECT — injected, lives in DI container
}
```

Connection-specific state belongs in `GridService` (keyed by `Context.ConnectionId`) or in SignalR's `Items` dictionary (`Context.Items`).

### Context.ConnectionId

`Context.ConnectionId` is a string GUID unique to each WebSocket connection. It changes on every reconnect. Use it to key per-connection data (cooldown timestamps, user info). When a client disconnects and reconnects, they get a new `ConnectionId` — their old cooldown entry is orphaned in the dictionary (harmless but worth knowing).

### OnConnectedAsync and OnDisconnectedAsync

These are lifecycle hooks on the hub. They run once per connection event, not per method invocation.

```csharp
public override async Task OnConnectedAsync()
{
    // Runs ONCE when a client connects (WebSocket upgrade completes)
    // Safe to initialize per-connection state here
    await base.OnConnectedAsync(); // always call base
}

public override async Task OnDisconnectedAsync(Exception? exception)
{
    // exception is null for a clean disconnect, non-null for a network error
    // Clean up per-connection state here
    await base.OnDisconnectedAsync(exception); // always call base
}
```

**Node/Socket.io equivalent:** `io.on('connection', socket => { ... })` for connect. `socket.on('disconnect', (reason) => { ... })` for disconnect. `reason` is a string like `"transport close"` or `"server namespace disconnect"`.

---

## 8. IQueryable vs IEnumerable (Interview Essential)

This is not used in this project (no database) but it appears in almost every .NET interview. Know it cold.

### The difference

`IEnumerable<T>` — processes data **in memory**. Operations like `.Where()`, `.Select()`, `.OrderBy()` run as C# code after all data is loaded from the source.

`IQueryable<T>` — builds an **expression tree** that is translated to SQL (via EF Core or LINQ to SQL) and executed at the data source. The filter happens in the database, not in memory.

```csharp
// IEnumerable — loads ALL users from DB, THEN filters in C#
IEnumerable<User> users = _db.Users.ToList(); // DB: SELECT * FROM Users (all rows)
var admins = users.Where(u => u.IsAdmin);      // C#: filter in memory

// IQueryable — translates Where to SQL, filters at DB
IQueryable<User> users = _db.Users;            // no DB call yet
var admins = users.Where(u => u.IsAdmin);      // still no DB call — building expression tree
var result = admins.ToList();                  // DB: SELECT * FROM Users WHERE IsAdmin = 1
```

**The performance implication:** if your table has 1,000,000 users and 10 are admins, `IEnumerable` loads 1,000,000 rows into memory and filters 999,990. `IQueryable` sends 10 rows from the database.

**The common bug:** calling `.AsEnumerable()` or `.ToList()` in the middle of a LINQ chain before all filters are applied. Everything after that line runs in memory.

```csharp
// BUG — ToList() materializes before Where
var admins = _db.Users.ToList().Where(u => u.IsAdmin); // loads all users first!

// CORRECT — Where translates to SQL
var admins = _db.Users.Where(u => u.IsAdmin).ToList(); // loads only admins
```

**Node equivalent:** ORMs like Prisma or TypeORM return Promises that resolve to arrays — the filtering always happens either in the query (if you use ORM filter syntax) or in JavaScript (if you `.filter()` an array). There is no lazy expression tree concept in Node ORMs; you must be explicit about what runs in the DB vs. in application code.

---

## 9. Memory and Performance — Span<T> and StringBuilder

### StringBuilder

String concatenation in C# creates a new string object every time (strings are immutable). In a loop that builds a string, this means `n` allocations and `O(n²)` copy operations.

```csharp
// O(n²) allocations — each += allocates a new string
string result = "";
for (int i = 0; i < 1000; i++) result += i.ToString();

// O(n) — StringBuilder uses an internal buffer, one allocation at the end
var sb = new StringBuilder();
for (int i = 0; i < 1000; i++) sb.Append(i);
string result = sb.ToString(); // one allocation
```

**For this project:** you are building JSON payloads serialized by `System.Text.Json` — the serializer handles this. You would use `StringBuilder` if building SQL strings (do not do this; use parameterized queries) or constructing log messages in a hot loop.

### Span<T>

`Span<T>` is a stack-allocated view over a contiguous block of memory — an array, a stack allocation, or unmanaged memory. It is never heap-allocated. Operations on `Span<T>` have zero overhead — no bounds check overhead beyond normal array access, no allocation.

```csharp
// Array slice WITHOUT allocation
int[] array = new int[] { 1, 2, 3, 4, 5 };
Span<int> slice = array.AsSpan(1, 3); // view of [2, 3, 4] — no copy, no allocation

// String parsing WITHOUT allocation
ReadOnlySpan<char> text = "hello world".AsSpan();
int spaceIndex = text.IndexOf(' ');
ReadOnlySpan<char> first = text[..spaceIndex]; // "hello" — no new string allocated
```

**When it matters:** high-throughput parsing (HTTP headers, binary protocols, CSV), hot path string processing, buffer manipulation. `Span<T>` cannot be stored in a heap object (class field) — it is stack-only. Use `Memory<T>` for async scenarios where `Span<T>` cannot cross `await` points.

**For this project:** `System.Text.Json` internally uses `Span<T>` and `Memory<T>` for zero-copy serialization. You do not write `Span<T>` code directly, but understanding it is a differentiator in .NET interviews.

**Node equivalent:** `Buffer` and `TypedArray` slices in Node are conceptually similar (views over a shared `ArrayBuffer`), though the memory model is different.

---

## 10. Program.cs and the Minimal API Model

### How ASP.NET Core starts

`Program.cs` in .NET 6+ uses the "minimal hosting" model — no `Startup.cs`, no separate `Configure` and `ConfigureServices`. Everything is in one file:

```csharp
// Phase 1 — Build phase: register services
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();
builder.Services.AddSingleton<GridService>();
builder.Services.AddCors(options => ...);

// Phase 2 — App phase: configure middleware and endpoints
var app = builder.Build(); // DI container is LOCKED after this line
app.UseCors();
app.UseRouting();
app.MapHub<GridHub>("/hubs/grid");
app.Run(); // blocking — starts the Kestrel server
```

Key constraint: you cannot register services after `builder.Build()`. The container is compiled and immutable after that point. Trying to add services to `app.Services` fails.

### Minimal APIs

ASP.NET Core also supports defining endpoints directly in `Program.cs` without controllers:

```csharp
app.MapGet("/health", () => Results.Ok(new { Status = "healthy" }));
app.MapPost("/api/grid/reset", async (GridService grid) =>
{
    grid.Reset();
    return Results.Ok();
});
```

**For this project:** you use hub endpoints (`MapHub`), not REST endpoints. But you might add a `GET /api/grid` snapshot endpoint for the REST+WebSocket alternative delivery pattern. Minimal APIs are the modern way to do this in .NET 8.

**Node/Express equivalent:** `app.get('/health', (req, res) => res.json({ status: 'healthy' }))`. Functionally identical. Minimal APIs exist because ASP.NET MVC controllers felt heavy for simple endpoints.

---

## 11. How Kestrel Handles Concurrent Connections

### The thread model

Kestrel (ASP.NET Core's built-in web server) uses a small fixed pool of I/O threads driven by the .NET `ThreadPool` and `libuv` (or IOCP on Windows). It does not create one thread per connection — that model fails at thousands of concurrent connections.

Instead, Kestrel uses **async I/O**: when data arrives on a socket, an I/O completion callback fires on a thread pool thread, processes the data (runs your middleware and hub code), then returns the thread. While your code awaits (e.g., awaiting `SendAsync`), the thread is freed to handle other connections.

This is why `async/await` is non-negotiable in ASP.NET Core. A hub method that blocks synchronously (Thread.Sleep, a synchronous DB call) holds a thread pool thread and prevents it from serving other connections. At 1000 concurrent connections, blocking even briefly creates a queue and introduces latency.

**Concretely for this project:** when you call `await Clients.All.SendAsync(...)` with 500 connected clients, SignalR does not block 500 threads. It fires 500 async write operations and awaits all of them. Those writes proceed concurrently on I/O threads while your hub method's continuation waits. This is how .NET handles thousands of WebSocket connections on a single server.

**Node/Socket.io equivalent:** Node's event loop is the same model — single-threaded event loop + async I/O callbacks. The key difference is that Node's event loop is literally single-threaded (one core), while .NET's thread pool uses multiple threads. .NET can run CPU-bound work in parallel; Node cannot without worker threads.

---

## Self-Check — .NET Round (answer each in 30 seconds)

1. You write `GetDataAsync().Result` in an ASP.NET Core controller. Your colleague says this might deadlock. Are they right, and why or why not?
2. You inject a scoped `DbContext` into a singleton service. What is the bug called, what goes wrong in practice, and how do you fix it?
3. A hub method needs to await a database call inside a critical section. You start with `lock`. The code does not compile. What do you use instead and why?
4. Your `ConcurrentDictionary.GetOrAdd(key, factory)` is being called from multiple threads. The factory creates a new file on disk. The file is being created twice intermittently. Explain why and how you fix it.
5. A teammate changes `IQueryable<User>` to `IEnumerable<User>` in a repository method. Your application is suddenly slow. Why, and how do you prove it?
