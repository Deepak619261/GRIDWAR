import { Injectable, signal } from '@angular/core';
import { SignalrService } from './signalr.service';
import { CellState, UserInfo, LeaderboardEntry } from '../models/grid.models';

@Injectable({ providedIn: 'root' })
export class GridService {
  readonly grid = signal<CellState[]>([]);
  readonly myUser = signal<UserInfo | null>(null);
  readonly onlineCount = signal<number>(0);
  readonly leaderboard = signal<LeaderboardEntry[]>([]);

  // tracks pre-optimistic state so we can revert on rejection
  private readonly _preOptimistic = new Map<number, CellState>();

  constructor(private signalr: SignalrService) {
    const conn = signalr.connection;

    conn.on('Connected', (user: UserInfo, snapshot: CellState[]) => {
      this.myUser.set(user);
      this.grid.set(snapshot);
    });

    conn.on('CellCaptured', (cell: CellState) => {
      this._preOptimistic.delete(cell.index);
      this.grid.update(g => {
        const next = [...g];
        next[cell.index] = cell;
        return next;
      });
    });

    conn.on('CaptureRejected', ({ index, reason }: { index: number; reason: string }) => {
      const prior = this._preOptimistic.get(index);
      if (prior) {
        this.grid.update(g => {
          const next = [...g];
          next[index] = prior;
          return next;
        });
        this._preOptimistic.delete(index);
      }
      console.warn(`[CaptureRejected] cell ${index}: ${reason}`);
    });

    conn.on('OnlineCount', (n: number) => this.onlineCount.set(n));
    conn.on('Leaderboard', (entries: LeaderboardEntry[]) => this.leaderboard.set(entries));
    conn.on('Snapshot', (snapshot: CellState[]) => this.grid.set(snapshot));
    conn.onreconnected(() => conn.invoke('GetSnapshot'));
  }

  captureCell(index: number) {
    const me = this.myUser();
    if (!me) return;

    const current = this.grid()[index];
    this._preOptimistic.set(index, current);

    this.grid.update(g => {
      const next = [...g];
      next[index] = { ...current, ownerId: me.userId, ownerColor: me.color, ownerName: me.displayName };
      return next;
    });

    this.signalr.connection.invoke('CaptureCell', index).catch(console.error);
  }

  start() { return this.signalr.start(); }
}
