import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { GridService } from './services/grid.service';
import { GridComponent } from './components/grid.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">
      <header class="header">
        <div class="brand">GRID<span>app</span></div>
        <div class="status">
          <span class="online-count">{{ gridService.onlineCount() }} online</span>
          @if (gridService.myUser(); as me) {
            <span class="identity" [style.border-color]="me.color">
              <span class="color-dot" [style.background]="me.color"></span>
              {{ me.displayName }}
            </span>
          }
        </div>
      </header>

      <main class="layout">
        <app-grid />

        <aside class="sidebar">
          <div class="leaderboard">
            <h3>Leaderboard</h3>
            @for (entry of gridService.leaderboard(); track entry.item1) {
              <div class="lb-row">
                <span class="lb-dot" [style.background]="entry.item2"></span>
                <span class="lb-name">{{ entry.item1 }}</span>
                <span class="lb-count">{{ entry.item3 }}</span>
              </div>
            }
            @if (gridService.leaderboard().length === 0) {
              <p class="empty">Click cells to start</p>
            }
          </div>

          @if (gridService.myUser(); as me) {
            <div class="my-stats">
              <div class="my-color" [style.background]="me.color"></div>
              <div>
                <div class="my-name">{{ me.displayName }}</div>
                <div class="my-cells">{{ myCellCount() }} cells owned</div>
              </div>
            </div>
          }
        </aside>
      </main>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .app {
      min-height: 100vh;
      background: #0f0f23;
      color: #e0e0e0;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: #16213e;
      border-bottom: 1px solid #0f3460;
    }

    .brand {
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: 2px;
      color: #e0e0e0;
    }
    .brand span { color: #3498db; }

    .status { display: flex; align-items: center; gap: 16px; }

    .online-count {
      font-size: 0.85rem;
      color: #2ecc71;
      background: rgba(46,204,113,0.1);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid rgba(46,204,113,0.3);
    }

    .identity {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid;
      background: rgba(255,255,255,0.05);
    }

    .color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .layout {
      display: flex;
      gap: 24px;
      padding: 24px;
      align-items: flex-start;
      justify-content: center;
    }

    .sidebar {
      width: 200px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .leaderboard {
      background: #16213e;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid #0f3460;
    }

    .leaderboard h3 {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
      margin-bottom: 12px;
    }

    .lb-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.85rem;
    }
    .lb-row:last-child { border-bottom: none; }

    .lb-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .lb-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lb-count { font-weight: 700; color: #3498db; }
    .empty { font-size: 0.8rem; color: #555; text-align: center; padding: 8px 0; }

    .my-stats {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #16213e;
      border-radius: 8px;
      padding: 14px;
      border: 1px solid #0f3460;
    }

    .my-color {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .my-name { font-size: 0.85rem; font-weight: 600; }
    .my-cells { font-size: 0.75rem; color: #888; margin-top: 2px; }
  `]
})
export class App implements OnInit {
  readonly gridService = inject(GridService);

  async ngOnInit() {
    await this.gridService.start();
  }

  myCellCount(): number {
    const me = this.gridService.myUser();
    if (!me) return 0;
    return this.gridService.grid().filter(c => c.ownerId === me.userId).length;
  }
}
