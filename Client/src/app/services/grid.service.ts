import { Injectable, signal } from '@angular/core';
import { SignalrService } from './signalr.service';
import { CellState, UserInfo, LeaderboardEntry } from '../models/grid.models';

@Injectable({ providedIn: 'root' })
export class GridService {
  readonly grid = signal<CellState[]>([]);
  readonly myUser = signal<UserInfo | null>(null);
  readonly onlineCount = signal<number>(0);
  readonly leaderboard = signal<LeaderboardEntry[]>([]);

  constructor(private signalr: SignalrService) {
    const conn = signalr.connection;

    conn.on('Connected', (user: UserInfo, snapshot: CellState[]) => {
      this.myUser.set(user);
      this.grid.set(snapshot);
    });

    conn.on('CellCaptured', (cell: CellState) => {
      this.grid.update(g => {
        const next = [...g];
        next[cell.index] = cell;
        return next;
      });
    });

    conn.on('CaptureRejected', ({ index, reason }: { index: number; reason: string }) => {
      // revert optimistic update
      this.grid.update(g => {
        const next = [...g];
        // snapshot will re-sync on next event; mark as null owner to show rejection
        return next;
      });
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

    // optimistic update
    this.grid.update(g => {
      const next = [...g];
      next[index] = { ...next[index], ownerId: me.userId, ownerColor: me.color, ownerName: me.displayName };
      return next;
    });

    this.signalr.connection.invoke('CaptureCell', index).catch(console.error);
  }

  start() { return this.signalr.start(); }
}
