import { Component, OnInit, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { GridService } from './services/grid.service';
import { GridComponent } from './components/grid.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">

      <!-- TOP BAR -->
      <header class="topbar">
        <div class="logo">GRID<span>war</span></div>

        <div class="pills">
          <div class="pill green">
            <span class="pulse-dot"></span>
            {{ gs.onlineCount() }} online
          </div>
          <div class="pill blue">
            {{ capturedCount() }} / 2500 claimed
          </div>
          <div class="pill purple">
            {{ coveragePct().toFixed(1) }}% covered
          </div>
        </div>

        <button class="reset-btn"
          [class.confirm]="resetConfirm()"
          (click)="onReset()">
          {{ resetConfirm() ? 'Confirm reset?' : 'Reset grid' }}
        </button>

        @if (gs.myUser(); as me) {
          <div class="me-chip" [style.--c]="me.color">
            <span class="me-swatch" [style.background]="me.color"></span>
            <div>
              <div class="me-name">{{ me.displayName }}</div>
              <div class="me-sub">{{ myCellCount() }} cells</div>
            </div>
          </div>
        }
      </header>


      <!-- BODY -->
      <div class="body">

        <!-- GRID HERO -->
        <div class="grid-wrap">
          <app-grid />
          <div class="grid-label">50 × 50 · {{ 2500 - capturedCount() }} cells unclaimed</div>
        </div>

        <!-- PANEL -->
        <aside class="panel">

          <!-- Territory -->
          @if (gs.myUser(); as me) {
            <div class="card">
              <div class="card-head">YOUR TERRITORY</div>
              <div class="big-num" [style.color]="me.color">{{ myCellCount() }}</div>
              <div class="bar-track">
                <div class="bar-fill" [style.width.%]="(myCellCount()/2500)*100" [style.background]="me.color"></div>
              </div>
              <div class="sub-row">
                <span>{{ ((myCellCount()/2500)*100).toFixed(2) }}% of grid</span>
              </div>
            </div>
          }

          <!-- Leaderboard -->
          <div class="card">
            <div class="card-head">LEADERBOARD</div>
            @for (e of gs.leaderboard(); track e.name; let i = $index) {
              <div class="lb-row" [class.lb-first]="i === 0">
                <span class="lb-i">{{ i + 1 }}</span>
                <span class="lb-dot" [style.background]="e.color"></span>
                <div class="lb-mid">
                  <span class="lb-name">{{ e.name }}</span>
                  <div class="lb-track">
                    <div class="lb-bar" [style.width.%]="(e.cellCount/2500)*100" [style.background]="e.color"></div>
                  </div>
                </div>
                <span class="lb-n">{{ e.cellCount }}</span>
              </div>
            }
            @if (gs.leaderboard().length === 0) {
              <p class="hint">Click cells to start playing</p>
            }
          </div>

          <!-- Activity feed -->
          <div class="card">
            <div class="card-head">LIVE ACTIVITY</div>
            <div class="feed">
              @for (e of gs.activity(); track e.at) {
                <div class="feed-row">
                  <span class="feed-dot" [style.background]="e.color"></span>
                  <span class="feed-name" [style.color]="e.color">{{ e.playerName }}</span>
                  <span class="feed-cell">#{{ e.cellIndex }}</span>
                </div>
              }
              @if (gs.activity().length === 0) {
                <p class="hint">Waiting for first capture...</p>
              }
            </div>
          </div>

          <!-- Coverage ring -->
          <div class="card ring-card">
            <div class="card-head">GRID COVERAGE</div>
            <div class="ring-wrap">
              <svg viewBox="0 0 36 36">
                <path class="ring-bg" d="M18 2.0845 a15.9155 15.9155 0 0 1 0 31.831 a15.9155 15.9155 0 0 1 0-31.831"/>
                <path class="ring-fg"
                  [attr.stroke-dasharray]="coveragePct().toFixed(1) + ' 100'"
                  d="M18 2.0845 a15.9155 15.9155 0 0 1 0 31.831 a15.9155 15.9155 0 0 1 0-31.831"/>
              </svg>
              <div class="ring-pct">{{ coveragePct().toFixed(0) }}%</div>
            </div>
            <div class="hint">{{ capturedCount() }} of 2500 cells claimed</div>
          </div>

        </aside>
      </div>
    </div>
  `,
  styles: [`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host { display: block; }

    .app {
      min-height: 100vh;
      background: radial-gradient(ellipse at 20% 50%, #0d0d2a 0%, #050510 60%);
      color: #c8c8e8;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
    }

    /* ─── TOP BAR ─────────────────────────────── */
    .topbar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 24px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      backdrop-filter: blur(8px);
      flex-shrink: 0;
    }

    .logo {
      font-size: 1.3rem;
      font-weight: 900;
      letter-spacing: 2px;
      color: #fff;
      flex-shrink: 0;
    }
    .logo span { color: #7B68EE; }

    .pills { display: flex; gap: 8px; flex: 1; }

    .pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      padding: 4px 12px;
      border-radius: 20px;
      border: 1px solid;
      white-space: nowrap;
    }
    .pill.green  { color: #2ED573; border-color: rgba(46,213,115,0.3); background: rgba(46,213,115,0.06); }
    .pill.blue   { color: #74b9ff; border-color: rgba(116,185,255,0.3); background: rgba(116,185,255,0.06); }
    .pill.purple { color: #a29bfe; border-color: rgba(162,155,254,0.3); background: rgba(162,155,254,0.06); }

    .pulse-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #2ED573;
      box-shadow: 0 0 0 0 rgba(46,213,115,0.5);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 rgba(46,213,115,0.5); }
      70%  { box-shadow: 0 0 0 6px rgba(46,213,115,0); }
      100% { box-shadow: 0 0 0 0 rgba(46,213,115,0); }
    }

    .reset-btn {
      font-size: 0.72rem;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: #666;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .reset-btn:hover { border-color: rgba(255,100,100,0.4); color: #ff6b6b; background: rgba(255,100,100,0.07); }
    .reset-btn.confirm { border-color: #ff4757; color: #ff4757; background: rgba(255,71,87,0.12); animation: btn-pulse 0.4s ease; }
    @keyframes btn-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }

    .me-chip {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 14px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 30px;
      flex-shrink: 0;
    }
    .me-swatch { width: 26px; height: 26px; border-radius: 6px; box-shadow: 0 0 10px var(--c,#fff); }
    .me-name { font-size: 0.82rem; font-weight: 600; color: #e8e8ff; }
    .me-sub  { font-size: 0.68rem; color: #555; }

    /* ─── COOLDOWN STRIP ──────────────────────── */
    .cd-strip { height: 3px; background: #08081a; flex-shrink: 0; position: relative; overflow: hidden; }
    .cd-fill {
      position: absolute; top: 0; left: 0; bottom: 0; width: 0%;
      background: linear-gradient(90deg, #7B68EE, #FF6B81, #ECCC68);
    }
    .cd-fill.active {
      animation: cd-sweep 1.5s linear forwards;
    }
    @keyframes cd-sweep {
      0%   { width: 0%; opacity: 1; }
      85%  { width: 100%; opacity: 1; }
      100% { width: 100%; opacity: 0; }
    }

    /* ─── BODY ───────────────────────────────── */
    .body {
      display: flex;
      gap: 24px;
      padding: 20px 24px;
      flex: 1;
      align-items: flex-start;
      overflow-x: auto;
    }

    /* ─── GRID ───────────────────────────────── */
    .grid-wrap { flex-shrink: 0; }
    .grid-label {
      margin-top: 8px;
      font-size: 0.7rem;
      color: #333;
      letter-spacing: 1px;
      text-transform: uppercase;
      text-align: center;
    }

    /* ─── PANEL ──────────────────────────────── */
    .panel { width: 230px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }

    .card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px;
      padding: 16px;
    }

    .card-head {
      font-size: 0.65rem;
      letter-spacing: 1.5px;
      color: #444;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .big-num { font-size: 2.4rem; font-weight: 800; line-height: 1; margin-bottom: 10px; }

    .bar-track { height: 5px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
    .bar-fill  { height: 100%; border-radius: 3px; transition: width 0.5s ease; min-width: 2px; }

    .sub-row { font-size: 0.72rem; color: #444; }

    /* Leaderboard */
    .lb-row {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .lb-row:last-child { border-bottom: none; }
    .lb-first { }

    .lb-i    { font-size: 0.7rem; color: #333; width: 12px; flex-shrink: 0; }
    .lb-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .lb-mid  { flex: 1; min-width: 0; }
    .lb-name { font-size: 0.77rem; color: #bbb; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
    .lb-track { height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
    .lb-bar  { height: 100%; border-radius: 2px; transition: width 0.6s ease; min-width: 2px; }
    .lb-n    { font-size: 0.78rem; font-weight: 700; color: #666; width: 28px; text-align: right; flex-shrink: 0; }

    .hint { font-size: 0.72rem; color: #333; text-align: center; padding: 8px 0; }

    /* Activity feed */
    .feed { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow: hidden; }
    .feed-row {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.73rem; padding: 3px 0;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      animation: slide-in 0.2s ease;
    }
    .feed-row:last-child { border-bottom: none; }
    @keyframes slide-in {
      from { opacity: 0; transform: translateX(-6px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .feed-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .feed-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .feed-cell { color: #444; font-size: 0.68rem; flex-shrink: 0; }

    /* Coverage ring */
    .ring-card { text-align: center; }
    .ring-wrap { position: relative; width: 90px; margin: 0 auto 10px; }
    .ring-wrap svg { width: 90px; height: 90px; display: block; }
    .ring-bg { fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 2.5; }
    .ring-fg {
      fill: none; stroke: #7B68EE; stroke-width: 2.5;
      stroke-linecap: round;
      transform: rotate(-90deg); transform-origin: 50% 50%;
      transition: stroke-dasharray 0.6s ease;
    }
    .ring-pct {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; font-weight: 700; color: #e0e0ff;
    }
  `]
})
export class App implements OnInit {
  readonly gs = inject(GridService);

  // Direct signal references — no computed scan, O(1)
  readonly myCellCount   = this.gs.myCellCount;
  readonly capturedCount = this.gs.capturedCount;
  readonly coveragePct   = computed(() => (this.gs.capturedCount() / 2500) * 100);
  readonly resetConfirm  = signal(false);

  async ngOnInit() { await this.gs.start(); }

  onReset() {
    if (!this.resetConfirm()) {
      this.resetConfirm.set(true);
      setTimeout(() => this.resetConfirm.set(false), 3000);
    } else {
      this.resetConfirm.set(false);
      this.gs.resetGrid();
    }
  }
}
