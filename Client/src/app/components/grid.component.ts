import {
  Component, ElementRef, ViewChild,
  OnInit, OnDestroy, inject, ChangeDetectionStrategy, effect
} from '@angular/core';
import { GridService } from '../services/grid.service';

const COLS = 50;
const ROWS = 50;
const CELL = 13;
const GAP  = 2;
const STEP = CELL + GAP;
const PAD  = 10;
const SIZE = COLS * STEP + PAD * 2;

interface Ripple { cx: number; cy: number; t: number; color: string; }

@Component({
  selector: 'app-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #canvas
      (click)="onClick($event)"
      (mousemove)="onMove($event)"
      (mouseleave)="hoverIdx = -1"
    ></canvas>
  `,
  styles: [`
    canvas {
      display: block;
      border-radius: 8px;
      box-shadow: 0 0 60px rgba(123,104,238,0.2), 0 0 120px rgba(123,104,238,0.08);
    }
  `]
})
export class GridComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly gs = inject(GridService);
  private ctx!: CanvasRenderingContext2D;
  private frameId = 0;
  private ripples: Ripple[] = [];
  private recentCaptures = new Map<number, number>(); // index → capturedAt ms
  private lockedCells = new Map<number, number>();    // index → lockedUntil ms (3s)
  hoverIdx = -1;

  constructor() {
    // effect() MUST be in constructor (injection context)
    effect(() => {
      const cap = this.gs.lastCaptured();
      if (!cap) return;
      const col = cap.index % COLS;
      const row = Math.floor(cap.index / COLS);
      this.recentCaptures.set(cap.index, Date.now());
      this.lockedCells.set(cap.index, Date.now() + 3000);
      this.ripples.push({
        cx: PAD + col * STEP + CELL / 2,
        cy: PAD + row * STEP + CELL / 2,
        t: 0,
        color: cap.color,
      });
    });
  }

  ngOnInit() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width  = SIZE;
    canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    this.loop();
  }

  ngOnDestroy() { cancelAnimationFrame(this.frameId); }

  private loop() {
    this.frameId = requestAnimationFrame(() => this.loop());
    // Skip frame if nothing to draw
    if (!this.gs.getCells().length && !this.ripples.length) return;
    this.render();
  }

  private render() {
    const grid = this.gs.getCells(); // direct array ref, zero allocation, zero signal overhead
    if (!grid.length) return;

    const ctx  = this.ctx;
    const me   = this.gs.myUser();
    const now  = Date.now();

    // Canvas background — deep navy, visible grid line color
    ctx.fillStyle = '#08081a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (let i = 0; i < grid.length; i++) {
      const cell = grid[i];
      const col  = i % COLS;
      const row  = Math.floor(i / COLS);
      const x    = PAD + col * STEP;
      const y    = PAD + row * STEP;
      const isHover = i === this.hoverIdx;
      const isMine  = !!me && cell.ownerId === me.userId;

      if (cell.ownerColor) {
        // Owned cell
        ctx.fillStyle = cell.ownerColor;
        ctx.fillRect(x, y, CELL, CELL);

        // Glow flash on recent capture (first 600ms)
        const age = now - (this.recentCaptures.get(i) ?? Infinity);
        if (age < 600) {
          ctx.fillStyle = `rgba(255,255,255,${((1 - age / 600) * 0.45).toFixed(3)})`;
          ctx.fillRect(x, y, CELL, CELL);
        } else if (age < 601) {
          this.recentCaptures.delete(i);
        }

        // Hover brightens
        if (isHover) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x, y, CELL, CELL);
        }

        // My cell — white border
        if (isMine) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5);
        }
      } else {
        // Empty cell — clearly visible dark blue
        ctx.fillStyle = isHover ? '#2a2a55' : '#16163a';
        ctx.fillRect(x, y, CELL, CELL);
      }
    }

    // Ripples
    this.ripples = this.ripples.filter(r => r.t < 1);
    for (const r of this.ripples) {
      r.t += 0.05;
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, r.t * 32, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - r.t) * 0.9;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  onClick(e: MouseEvent) {
    const { col, row } = this.cellAt(e);
    if (col < 0) return;
    this.gs.captureCell(row * COLS + col);
  }

  onMove(e: MouseEvent) {
    const { col, row } = this.cellAt(e);
    this.hoverIdx = col < 0 ? -1 : row * COLS + col;
    const canvas = this.canvasRef.nativeElement;
    if (col < 0) { canvas.style.cursor = 'default'; return; }
    const idx = row * COLS + col;
    const locked = (this.lockedCells.get(idx) ?? 0) > Date.now();
    canvas.style.cursor = locked ? 'not-allowed' : 'pointer';
  }

  private cellAt(e: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const rx = e.clientX - rect.left - PAD;
    const ry = e.clientY - rect.top  - PAD;
    const col = Math.floor(rx / STEP);
    const row = Math.floor(ry / STEP);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return { col: -1, row: -1 };
    if (rx % STEP >= CELL || ry % STEP >= CELL) return { col: -1, row: -1 };
    return { col, row };
  }
}
