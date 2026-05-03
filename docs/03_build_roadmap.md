# Build Roadmap: Thu → Sun

Read this file once before executing anything. Internalize the cuts before you hit the late-night sessions when decision-making degrades. The plan is aggressive by design — if it were comfortable, the cuts would not matter.

**Total available hours:** ~28–29 hrs across 4 days.
**Buffer:** approximately 2 hrs total (distributed across stages). Do not plan to use it — plan to not need it.

---

## Stage 0 — Thu Evening (~3.5 hrs, 8:30 PM – midnight)

**Goal:** two processes can talk to each other over a SignalR connection. Nothing more.

### Task list (in order):

**1. Read 01_concepts.md end-to-end (~25 min)**
No skimming. The WebSocket, concurrency, and scaling sections will be asked about directly in the CTO round. Build the model now.

**2. Fill 02_design_and_tradeoffs.md Parts B, C, D in your own words (~45 min)**
This is the most important block of the weekend. Do it before a single line of application code. If you do not finish it Thursday night, finish it Friday before writing any code. Do not negotiate with yourself on this.

**3. Scaffold both projects (~20 min)**
```bash
# From GRIDapp/
dotnet new webapi -n Server --no-openapi
cd Server
# SignalR is included in ASP.NET Core — no extra package needed
dotnet add package Microsoft.AspNetCore.SignalR   # if not already referenced

cd ..
npm install -g @angular/cli   # skip if already installed
ng new Client --routing=false --style=css --standalone
cd Client
npm install @microsoft/signalr
```

**4. Create GridHub with a Ping stub (~20 min)**
```csharp
// Server/Hubs/GridHub.cs
public class GridHub : Hub
{
    public async Task Ping(string message)
    {
        await Clients.Caller.SendAsync("Pong", $"Server echoed: {message}");
    }
}
```

In `Program.cs`:
```csharp
builder.Services.AddSignalR();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:4200")  // Angular dev server
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

app.UseCors();
app.MapHub<GridHub>("/hubs/grid");
```

**5. Wire the Angular client to connect and ping (~20 min)**
```typescript
// Client/src/app/services/signalr.service.ts
import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  readonly connection = new signalR.HubConnectionBuilder()
    .withUrl('http://localhost:5000/hubs/grid')
    .withAutomaticReconnect()
    .build();

  start() { return this.connection.start(); }
}
```

In `AppComponent.ngOnInit`, inject `SignalrService`, call `start()`, then invoke `Ping("hello")` and listen for `Pong` — log the response. See connection ID in console.

**6. Push initial commit (~10 min)**
```bash
git init
git add .
git commit -m "stage-0: scaffold + signalr ping working"
git remote add origin https://github.com/YOUR_USERNAME/gridapp
git push -u origin main
```

Write a barebones README at the repo root: project name, tech stack, link to `docs/` folder.

**Stage-0 success criteria:** `ng serve` running on port 4200, dotnet server running on port 5000, browser console shows connection ID and the echoed Pong message. Two tabs, one connection each. Push to GitHub. Sleep by 11:45 PM.

**If behind:** cut the GitHub push, do it Friday morning. Do not skip the Ping test — you need to confirm the WebSocket handshake works before building on top of it.

---

## Stage 1 — Fri Evening (~3.5 hrs, 8:30 PM – midnight)

**Goal:** core capture flow works. Click in one browser, see update in the other within 200ms.

### Task list (in order):

**1. Define models (~15 min)**
```csharp
// Server/Models/CellState.cs
public record CellState(
    int Index,
    string? OwnerId,
    string? OwnerColor,
    string? OwnerName,
    long Version,
    DateTime CapturedAt
);

// Server/Models/UserInfo.cs
public record UserInfo(
    string ConnectionId,
    string UserId,
    string DisplayName,
    string Color
);
```

**2. GridService (~30 min)**
```csharp
// Server/Services/GridService.cs — register as Singleton in DI
public class GridService
{
    private const int GridSize = 2500; // 50 × 50
    private readonly ConcurrentDictionary<int, CellState> _grid;
    private readonly ConcurrentDictionary<string, UserInfo> _users = new();
    private readonly ConcurrentDictionary<string, DateTime> _cooldowns = new();
    private static readonly TimeSpan CooldownDuration = TimeSpan.FromSeconds(1.5);

    public GridService()
    {
        _grid = new ConcurrentDictionary<int, CellState>(
            Enumerable.Range(0, GridSize)
                      .Select(i => new KeyValuePair<int, CellState>(i, new CellState(i, null, null, null, 0, DateTime.MinValue)))
        );
    }

    public CellState[] GetSnapshot() => _grid.Values.OrderBy(c => c.Index).ToArray();

    public (bool Success, string? Reason, CellState? NewState) TryCapture(int index, string userId, string color, string name)
    {
        if (!_cooldowns.TryGetValue(userId, out var lastCapture) == false)
        {
            if (DateTime.UtcNow - lastCapture < CooldownDuration)
                return (false, "cooldown", null);
        }

        var current = _grid[index];
        var updated = current with
        {
            OwnerId = userId,
            OwnerColor = color,
            OwnerName = name,
            Version = current.Version + 1,
            CapturedAt = DateTime.UtcNow
        };

        if (_grid.TryUpdate(index, updated, current))
        {
            _cooldowns[userId] = DateTime.UtcNow;
            return (true, null, updated);
        }

        return (false, "race", null);
    }

    public void AddUser(UserInfo user) => _users[user.ConnectionId] = user;
    public void RemoveUser(string connectionId) => _users.TryRemove(connectionId, out _);
    public int OnlineCount => _users.Count;
    public UserInfo[] GetAllUsers() => _users.Values.ToArray();

    public (string Name, string Color, int CellCount)[] GetLeaderboard()
    {
        var owned = _grid.Values
            .Where(c => c.OwnerId != null)
            .GroupBy(c => new { c.OwnerId, c.OwnerName, c.OwnerColor })
            .Select(g => (g.Key.OwnerName ?? "?", g.Key.OwnerColor ?? "#fff", g.Count()))
            .OrderByDescending(x => x.Item3)
            .Take(5)
            .ToArray();
        return owned;
    }
}
```

Note: the cooldown check above has a logic bug — fix it properly in your code. The pattern is: read from dictionary, check if time elapsed < cooldown duration, reject if true, proceed and update if false.

**3. GridHub — full implementation (~45 min)**

```csharp
public class GridHub : Hub
{
    private static readonly string[] Colors = {
        "#e74c3c","#e67e22","#f1c40f","#2ecc71",
        "#1abc9c","#3498db","#9b59b6","#e91e63"
    };
    private static readonly string[] Adjectives = { "Fast", "Bold", "Keen", "Sharp" };
    private static readonly string[] Nouns = { "Falcon", "Wolf", "Hawk", "Bear" };
    private static readonly Random Rng = new();

    private readonly GridService _grid;

    public GridHub(GridService grid) => _grid = grid;

    public override async Task OnConnectedAsync()
    {
        var color = Colors[Rng.Next(Colors.Length)];
        var name = $"{Adjectives[Rng.Next(Adjectives.Length)]}{Nouns[Rng.Next(Nouns.Length)]}{Rng.Next(10, 99)}";
        var userId = Guid.NewGuid().ToString("N")[..8];
        var user = new UserInfo(Context.ConnectionId, userId, name, color);
        _grid.AddUser(user);

        // Send identity and snapshot only to the connecting client
        await Clients.Caller.SendAsync("Connected", user, _grid.GetSnapshot());
        // Notify everyone of new online count
        await Clients.All.SendAsync("OnlineCount", _grid.OnlineCount);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? ex)
    {
        _grid.RemoveUser(Context.ConnectionId);
        await Clients.All.SendAsync("OnlineCount", _grid.OnlineCount);
        await base.OnDisconnectedAsync(ex);
    }

    public async Task CaptureCell(int index)
    {
        // Retrieve user info for this connection
        var user = _grid.GetAllUsers().FirstOrDefault(u => u.ConnectionId == Context.ConnectionId);
        if (user is null) return;

        var (success, reason, newState) = _grid.TryCapture(index, user.UserId, user.Color, user.DisplayName);

        if (success && newState is not null)
        {
            await Clients.All.SendAsync("CellCaptured", newState);
            await Clients.All.SendAsync("Leaderboard", _grid.GetLeaderboard());
        }
        else
        {
            await Clients.Caller.SendAsync("CaptureRejected", new { index, reason });
        }
    }
}
```

**4. Angular GridService (~40 min)**

```typescript
// src/app/services/grid.service.ts
@Injectable({ providedIn: 'root' })
export class GridService {
  readonly grid = signal<CellState[]>([]);
  readonly myUser = signal<UserInfo | null>(null);
  readonly onlineCount = signal<number>(0);
  readonly leaderboard = signal<LeaderboardEntry[]>([]);

  constructor(private signalr: SignalrService) {
    const conn = signalr.connection;
    conn.on('Connected', (user, snapshot) => {
      this.myUser.set(user);
      this.grid.set(snapshot);
    });
    conn.on('CellCaptured', (cell: CellState) => {
      this.grid.update(g => { const n = [...g]; n[cell.index] = cell; return n; });
    });
    conn.on('CaptureRejected', ({ index, reason }) => { /* revert + set error flag */ });
    conn.on('OnlineCount', (n) => this.onlineCount.set(n));
    conn.on('Leaderboard', (entries) => this.leaderboard.set(entries));
  }

  captureCell(index: number) {
    // optimistic update
    const me = this.myUser();
    if (!me) return;
    this.grid.update(g => { const n = [...g]; n[index] = { ...n[index], ownerId: me.userId, ownerColor: me.color }; return n; });
    // invoke hub
    this.signalr.connection.invoke('CaptureCell', index);
  }
}
```

**5. Render a 50×50 grid with Angular (~20 min)**

CSS grid with `grid-template-columns: repeat(50, 1fr)`. In `GridComponent`, use `*ngFor="let cell of gridService.grid(); trackBy: trackByIndex"` and render `<app-cell [cellState]="cell" [isMyCell]="cell.ownerId === myUser()?.userId" (capture)="gridService.captureCell(cell.index)" />`. Set `ChangeDetectionStrategy.OnPush` on `CellComponent`.

**6. Manual test with two browser windows**

Open `http://localhost:4200` in two tabs. Click in one. Verify the other updates. Verify the online count shows 2. Verify leaderboard appears after a few captures.

**7. Push commit**
```bash
git add .
git commit -m "stage-1: core capture flow working, two-browser sync confirmed"
git push
```

**Stage-1 success criteria:** two browser windows, click in one, see update in the other in under 200ms, online count visible, leaderboard updates. Sleep by 11:45 PM.

**If behind:** skip leaderboard for now (it is a broadcast — add it Saturday). Do not skip the two-browser capture test. That is the core requirement.

---

## Stage 2 — Sat Full Day (~10–12 hrs)

**Goal:** polished UI, cooldown enforced, leaderboard live, reconnect handled, one bonus feature.

### Morning block (~4 hrs, 9 AM – 1 PM): UI Polish

- **Color palette:** 8–10 distinct, accessible, visually pleasing colors. Test them side-by-side at small cell size. Avoid colors that look identical at 20×20px (e.g., navy and dark teal).
- **Capture animation:** CSS `@keyframes` pulse/ripple on the cell when it changes owner. Use `transition` for color fade. Keep it under 300ms so it does not feel sluggish.
- **Hover state:** slight brightness increase or border highlight on hover. Shows the grid is interactive.
- **My-color indicator:** a small panel top-right showing your assigned color swatch + display name + cell count.
- **Online user count widget:** prominent, live-updating. "N players online."
- **Leaderboard panel:** top-5 by cells owned. Show color swatch + name + count. Updates on every `Leaderboard` event. Style it so it is readable at a glance.
- **Empty cell style:** a subtle grid line or slightly off-white background. Should look intentional, not unfinished.
- **Owned cell style:** solid fill of the owner's color. High contrast between different owners.

### Mid-afternoon block (~3 hrs, 1 PM – 4 PM): Cooldown + Server Fixes

- Review and fix the `TryCapture` cooldown logic (the skeleton above has a placeholder bug — make sure it actually reads the dictionary correctly).
- Client-side: when `CaptureRejected` with reason `"cooldown"` arrives, show a visual indicator — a cooldown bar, a brief disabled cursor, a pulsing overlay on the cell. The user should understand they clicked too fast.
- When `CaptureRejected` with reason `"race"` arrives, briefly flash the cell red/shake it to indicate a failed claim.
- Add an explicit `GetSnapshot` hub method for reconnect:
```csharp
public async Task GetSnapshot()
{
    await Clients.Caller.SendAsync("Snapshot", _grid.GetSnapshot());
}
```
- In the SignalR JS client's `onreconnected` callback, invoke `GetSnapshot` and replace local grid state.

### Late afternoon block (~2 hrs, 4 PM – 6 PM): Reconnection + User Disconnect

- Test reconnection: open DevTools → Network → throttle to "Offline" for 5 seconds → set back to online. Verify the grid re-syncs.
- User disconnect: when a user closes their tab, `OnDisconnectedAsync` fires and broadcasts the new online count. Verify the count decrements.
- Consider: what happens to cells owned by a disconnected user? For this assignment, they stay owned — a disconnected user's color persists. This is fine and the correct scope call. Say so in trade-offs.

### Evening block (~2 hrs, 7 PM – 9 PM): One Bonus Feature

Pick exactly one. Do not start two. Stop at 9 PM regardless of completion state.

**Option 1 — Animated capture pulse (easiest, most visual impact):**
CSS `@keyframes` ripple animation triggered when a cell's owner changes. A white ring expands from the cell center and fades. ~30 lines of CSS, 10 lines of React (track "justCaptured" state per cell, clear after animation).

**Option 2 — Pan/zoom on the grid (medium effort, impressive):**
Wrap the grid in a container div. Track `scale` and `translate` in React state. Handle `wheel` for zoom (pinch-to-zoom on trackpad works via wheel with ctrlKey). Handle `mousedown` + `mousemove` for drag panning. Apply via CSS `transform: scale(X) translate(Y, Z)`. ~60 lines of React + CSS. Needs careful handling of click coordinates after transform.

**Option 3 — Other-user cursor presence (medium effort, very impressive for a real-time demo):**
Broadcast mouse position from each client at ~10 events/second (throttle with `Date.now()` checks). Server relays to `Clients.Others`. Client renders small colored dots at the reported positions. ~50 lines client, ~15 lines server. Needs throttling on both sides to avoid flooding.

**Stage-2 success criteria:** polished UI with animations, leaderboard live, cooldown enforced server-side, reconnect restores grid, one bonus started and working. Push commit. Sleep by 11 PM.

**If behind at Sat 6 PM:** cut the bonus entirely. A polished core with no bonus beats an unpolished core with a broken bonus. Cut immediately and stop negotiating.

---

## Stage 3 — Sun Morning (~4 hrs, 9 AM – 1 PM): Deploy

**Goal:** a public URL that works from a phone on a different network.

### Backend deployment — Render (recommended)

1. Push to GitHub (already done).
2. Create account at render.com. New Web Service → connect GitHub repo.
3. Root directory: `Server`. Build command: `dotnet publish -c Release -o out`. Start command: `dotnet out/Server.dll`.
4. Environment: set `ASPNETCORE_ENVIRONMENT=Production` and `ASPNETCORE_URLS=http://0.0.0.0:$PORT`.
5. Render assigns a URL like `https://gridapp-server.onrender.com`. Note it.
6. Add the Vercel frontend URL to the CORS `WithOrigins` list in `Program.cs` before pushing. Update and redeploy.

**Alternative: Railway** — if Render gives you trouble, Railway supports .NET Docker-based deploys. Dockerfile:
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/out .
ENTRYPOINT ["dotnet", "Server.dll"]
```

### Frontend deployment — Vercel

1. In `Client/src/lib/signalr.ts`, replace the hardcoded `localhost` URL with:
```typescript
const hubUrl = import.meta.env.VITE_HUB_URL ?? "http://localhost:5000/hubs/grid";
```
2. In Vite: add `VITE_HUB_URL` to environment. Locally: `.env.local`. On Vercel: set as environment variable pointing to the Render URL.
3. Push Client to GitHub (or as a subdirectory). Connect to Vercel. Framework preset: Vite. Root directory: `Client`. Build command: `npm run build`. Output directory: `dist`.
4. Vercel assigns a URL like `https://gridapp.vercel.app`. Note it.

### Cross-network test

Open the Vercel URL on your phone (mobile data, not the same WiFi). Open it on your laptop (WiFi). Click cells on the phone and see them on the laptop. This is the proof. Do not submit without doing this test.

**If deploy is fighting you at 12:30 PM:** switch host (Render → Railway or vice versa). Do not keep debugging the same error past 15 minutes. If both fail, use `ngrok` to tunnel your local server as a last resort — it is not ideal but it is a live URL.

**Stage-3 success criteria:** public URL works from two different networks, two-user real-time sync confirmed over the internet. Stop adding features after this. Push final commit.

---

## Stage 4 — Sun Afternoon (~3 hrs, 1 PM – 4 PM): Polish the Submission

**Goal:** every submission artifact is ready to send.

**1. Write the public README** (~45 min)
Use the template in `04_interview_pack.md`. Fill in the actual deployed URLs. Add the ASCII architecture diagram. Three-paragraph "how real-time works" section. "Run locally" instructions. "What I'd add next."

**2. Record the demo video** (~30 min)
Use Loom (free, generates a URL instantly) or OBS. Two-minute target. Shot list in `04_interview_pack.md`. Ugly is fine — a real demo on a real public URL is infinitely better than a polished fake. Upload to Loom or YouTube unlisted.

**3. Fill the submission form** (~30 min)
Use the pre-written answers in `04_interview_pack.md` as a starting point. Adapt them to what you actually built (not what you planned). Be honest. The "what trade-offs did you make" answer is where you show architectural thinking.

**4. Rehearse the 3-minute pitch** (~30 min)
Read the pitch script in `04_interview_pack.md` once. Then put it away and say it out loud without notes. Do it twice. The second time will be smoother. This is the CTO interview opener — own it.

**5. Fill in Q&A placeholders** (~30 min)
In `04_interview_pack.md`, write your own answers to the 30 questions. You do not need to finish all of them today — prioritize the concurrency and scaling sections. Those are the most likely to come up in the CTO round.

---

## Stage 5 — Sun 4 PM–6 PM: Submit

- Final git commit and push: `git commit -m "submission: final state"` → `git push`
- Verify the public URL from a private/incognito browser window. Verify it works.
- Submit the form. Screenshot the confirmation.
- Send the application email to hr@inboxkit.com: application paragraph + CV.
- Done.

---

## Scope-Cut Decision Tree

Use this ruthlessly. Read it now, before you need it at 2 AM.

```
Sat noon — is the core capture flow broken?
  YES → drop leaderboard, drop cooldown, drop ALL bonuses.
        Fix the core. Stage-1 success = minimum viable submission.
  NO  → continue with Stage 2.

Sat 6 PM — is cooldown not working?
  YES → cut cooldown. Ship without it.
        Write one honest line in trade-offs: "Cooldown is designed but not deployed —
        the mechanism is in GridService; I ran out of time to wire it end-to-end."
  NO  → continue.

Sat 9 PM — is the Stage-2 bonus only half done?
  YES → stop. Push what exists. Move on.
        Half a bonus is the same as no bonus in a submission.
  NO  → continue.

Sun 12:30 PM — is deploy not working after 45 min of debugging?
  YES → switch host. Render → Railway. Or Railway → Render. Or ngrok as last resort.
        Do NOT keep debugging the same error. Deploy is non-negotiable.
  NO  → continue.

Sun 3 PM — is the demo video not recorded?
  YES → record it now on your phone, pointed at your laptop screen.
        Audio is more important than visuals. Describe what you built while showing it.
  NO  → continue.

Sun 6 PM — whatever state it is in, submit.
  A deployed ugly version > a polished local version.
  Always.
```
