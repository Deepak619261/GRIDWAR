# GRIDwar

Real-time multiplayer grid capture game. 50×50 canvas grid — click cells to claim territory, watch other players fight back live.

## Stack

| Layer | Tech |
|-------|------|
| Backend | .NET 9 + ASP.NET Core SignalR |
| Frontend | Angular 20 + Canvas 2D |
| Transport | WebSocket (SignalR full-duplex) |

## Architecture highlights

- **Canvas rendering** — single `<canvas>` element, 60fps `requestAnimationFrame` loop. Zero Angular DOM overhead for 2500 cells.
- **Optimistic UI** — cell color changes instantly on click; reverted if server rejects.
- **CAS conflict resolution** — `ConcurrentDictionary.TryUpdate` atomically resolves simultaneous captures. Loser gets `CaptureRejected` and their optimistic update rolls back.
- **Per-cell lock (3s)** — any cell can only be captured once every 3 seconds. Different cells are completely independent — you can click rapidly across the board.
- **O(1) counters** — `capturedCount` and `myCellCount` tracked incrementally, never scanned.
- **Angular Signals** throughout — `OnPush` everywhere, `effect()` drives ripple animations.

## Running locally

```bash
# Backend
cd Server
dotnet run

# Frontend (separate terminal)
cd Client
npm install
npm start
```

Open `http://localhost:4200`. Open a second tab — both see each other in real time.

## Deployment

- **Backend** → Render (Docker, port 10000)
- **Frontend** → Vercel (set `HUB_URL` env var to the Render service URL + `/hubs/grid`)
