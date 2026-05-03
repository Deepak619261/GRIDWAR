import { Injectable, signal } from '@angular/core';
import { SignalrService } from './signalr.service';
import { CellState, UserInfo, LeaderboardEntry, ActivityEvent } from '../models/grid.models';

const COOLDOWN_MS = 200; // client debounce only — real lock is per-cell on server

interface OptimisticEntry { prior: CellState; capturedDelta: number; myDelta: number; }

@Injectable({ providedIn: 'root' })
export class GridService {
  // Mutable array — canvas reads this directly at 60fps, zero allocation per capture
  private readonly _cells: CellState[] = [];

  // Version counter — increments on any cell change, reactive consumers track this
  readonly gridVersion = signal(0);

  // Incremental counters — updated in O(1) as cells change, never filter 2500 elements
  readonly capturedCount = signal(0);
  readonly myCellCount   = signal(0);

  readonly myUser        = signal<UserInfo | null>(null);
  readonly onlineCount   = signal<number>(0);
  readonly leaderboard   = signal<LeaderboardEntry[]>([]);
  readonly activity      = signal<ActivityEvent[]>([]);
  readonly cooldownActive = signal(false);
  readonly lastCaptured  = signal<{ index: number; color: string } | null>(null);

  private _lastCapture = 0;
  private readonly _optimistic = new Map<number, OptimisticEntry>();

  // Canvas reads this — O(1), no allocation, no signal overhead
  getCells(): readonly CellState[] { return this._cells; }

  constructor(public signalr: SignalrService) {
    const conn = signalr.connection;

    conn.on('Connected', (user: UserInfo, snapshot: CellState[], activity: ActivityEvent[]) => {
      this.myUser.set(user);
      this._cells.length = 0;
      let captured = 0;
      for (const c of snapshot) { this._cells.push(c); if (c.ownerId) captured++; }
      this.capturedCount.set(captured);
      this.myCellCount.set(0);
      this.gridVersion.update(v => v + 1);
      this.activity.set([...activity].reverse());
    });

    conn.on('CellCaptured', (cell: CellState) => {
      const prior = this._optimistic.get(cell.index)?.prior ?? this._cells[cell.index];
      const entry = this._optimistic.get(cell.index);
      this._optimistic.delete(cell.index);

      const me = this.myUser();
      // Compute delta from prior (pre-optimistic) → server state
      const serverCapDelta = (!prior?.ownerId && cell.ownerId) ? 1 : (prior?.ownerId && !cell.ownerId) ? -1 : 0;
      const serverMyDelta  = me
        ? ((!prior?.ownerId || prior.ownerId !== me.userId) && cell.ownerId === me.userId ? 1 : 0)
          - ((prior?.ownerId === me.userId && cell.ownerId !== me.userId) ? 1 : 0)
        : 0;

      // Undo the optimistic delta we already applied, apply server delta instead
      const capAdjust = serverCapDelta - (entry?.capturedDelta ?? 0);
      const myAdjust  = serverMyDelta  - (entry?.myDelta ?? 0);
      if (capAdjust !== 0) this.capturedCount.update(n => Math.max(0, n + capAdjust));
      if (myAdjust  !== 0) this.myCellCount.update(n => Math.max(0, n + myAdjust));

      this._cells[cell.index] = cell;
      this.lastCaptured.set({ index: cell.index, color: cell.ownerColor ?? '#fff' });
      this.gridVersion.update(v => v + 1);
    });

    conn.on('CaptureRejected', ({ index }: { index: number }) => {
      const entry = this._optimistic.get(index);
      if (!entry) return;
      this._cells[index] = entry.prior;
      if (entry.capturedDelta) this.capturedCount.update(n => Math.max(0, n - entry.capturedDelta));
      if (entry.myDelta)       this.myCellCount.update(n => Math.max(0, n - entry.myDelta));
      this.gridVersion.update(v => v + 1);
      this._optimistic.delete(index);
    });

    conn.on('OnlineCount', (n: number) => this.onlineCount.set(n));
    conn.on('Leaderboard', (e: LeaderboardEntry[]) => this.leaderboard.set(e));
    conn.on('Activity', (events: ActivityEvent[]) => this.activity.set([...events].reverse()));
    conn.on('GridReset', (snapshot: CellState[]) => {
      this._cells.length = 0;
      for (const c of snapshot) this._cells.push(c);
      this.capturedCount.set(0);
      this.myCellCount.set(0);
      this.gridVersion.update(v => v + 1);
    });
    conn.on('Snapshot', (snapshot: CellState[]) => {
      let captured = 0;
      for (const c of snapshot) { this._cells[c.index] = c; if (c.ownerId) captured++; }
      this.capturedCount.set(captured);
      this.gridVersion.update(v => v + 1);
    });
    conn.onreconnected(() => conn.invoke('GetSnapshot'));
  }

  captureCell(index: number) {
    const me = this.myUser();
    if (!me) return;
    const now = Date.now();
    if (now - this._lastCapture < COOLDOWN_MS) return;
    this._lastCapture = now;
    this.cooldownActive.set(true);
    setTimeout(() => this.cooldownActive.set(false), COOLDOWN_MS);

    const prior = this._cells[index];
    const capturedDelta = !prior.ownerId ? 1 : 0;
    const myDelta       = prior.ownerId !== me.userId ? 1 : 0;

    this._optimistic.set(index, { prior, capturedDelta, myDelta });

    // Mutate in place — zero allocation
    this._cells[index] = { ...prior, ownerId: me.userId, ownerColor: me.color, ownerName: me.displayName };
    if (capturedDelta) this.capturedCount.update(n => n + capturedDelta);
    if (myDelta)       this.myCellCount.update(n => n + myDelta);
    this.gridVersion.update(v => v + 1);

    this.signalr.connection.invoke('CaptureCell', index).catch(console.error);
  }

  resetGrid() {
    this.signalr.connection.invoke('ResetGrid').catch(console.error);
  }

  start() { return this.signalr.start(); }
}
