# GRIDwar

A real-time multiplayer grid capture game. 50×50 canvas — click cells to claim territory and watch everyone else fight back live.

**Live:** https://gridwar-deepaks-projects-70214c28.vercel.app

---

## What it does

- 2500-cell grid shared across every connected user
- Click a cell to capture it — your color fills it instantly
- Every other player sees the update in real time
- Cells lock for 3 seconds after capture — no spamming the same tile
- Live leaderboard, activity feed, and coverage stats update on every capture

## Tech stack

| Layer | Choice |
|-------|--------|
| Backend | .NET 9 + ASP.NET Core SignalR |
| Frontend | Angular 20 (Signals, Canvas 2D) |
| Transport | WebSockets via SignalR |
| Hosting | Azure App Service (backend) + Vercel (frontend) |

## Architecture

**Real-time layer** — SignalR maintains a persistent WebSocket connection per client. On every capture the server broadcasts `CellCaptured`, `Leaderboard`, and `Activity` to all connected clients simultaneously.

**Conflict resolution** — `ConcurrentDictionary.TryUpdate` (Compare-And-Swap). If two users click the same cell at the same millisecond, one wins atomically. The loser gets a `CaptureRejected` message and their optimistic update rolls back cleanly.

**Rendering** — Single HTML5 `<canvas>` element running a 60fps `requestAnimationFrame` loop. Reads a shared mutable array directly — zero Angular component overhead for 2500 cells.

**Optimistic UI** — Cell color changes the moment you click, before the server confirms. Snaps back on rejection.

**Per-cell locks** — Each cell has a 3-second server-side lock after capture. Independent per cell — you can click rapidly across the board, just not spam the same tile.

**O(1) counters** — `capturedCount` and `myCellCount` tracked incrementally on every change, never scanning 2500 elements.

## Running locally

```bash
# Backend (.NET 9 required)
cd Server
dotnet run

# Frontend (Node 18+ required)
cd Client
npm install
npm start
```

Open `http://localhost:4200`. Open a second tab — both see each other in real time.

## Features

- Random color + generated name (e.g. `SwiftFalcon42`) assigned on connect
- Live leaderboard — top 5 players by cells owned
- Live activity feed — last 20 captures
- Coverage ring — donut chart showing % of grid claimed
- Ripple animation on every capture
- `not-allowed` cursor on cells locked in the last 3 seconds
- Reset button with two-step confirm
