import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, OnChanges, SimpleChanges, signal
} from '@angular/core';
import { CellState } from '../models/grid.models';

@Component({
  selector: 'app-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cell"
      [class.owned]="!!cell.ownerId"
      [class.mine]="isMyCell"
      [class.pulse]="animating()"
      [style.background-color]="cell.ownerColor || null"
      [attr.title]="cell.ownerName || null"
      (click)="capture.emit()"
    ></div>
  `,
  styles: [`
    .cell {
      width: 14px;
      height: 14px;
      cursor: pointer;
      border-radius: 2px;
      background-color: #1e1e3a;
      position: relative;
      overflow: hidden;
    }

    .cell::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, rgba(255,255,255,0.06) 1px, transparent 1px);
      background-size: 7px 7px;
      pointer-events: none;
    }

    .cell:hover {
      filter: brightness(1.5);
      z-index: 2;
      box-shadow: 0 0 6px rgba(255,255,255,0.2);
    }

    .cell.owned::before { display: none; }

    .cell.mine {
      box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.7);
    }

    .cell.pulse::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: rgba(255,255,255,0.35);
      animation: ripple 0.4s ease-out forwards;
      pointer-events: none;
    }

    @keyframes ripple {
      from { opacity: 1; transform: scale(0.2); }
      to   { opacity: 0; transform: scale(2.5); }
    }
  `]
})
export class CellComponent implements OnChanges {
  @Input() cell!: CellState;
  @Input() isMyCell = false;
  @Output() capture = new EventEmitter<void>();

  readonly animating = signal(false);
  private _timer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges) {
    const change = changes['cell'];
    if (!change) return;
    const prev: CellState | undefined = change.previousValue;
    const curr: CellState = change.currentValue;
    if (curr?.ownerId && prev?.ownerId !== curr?.ownerId) {
      if (this._timer) clearTimeout(this._timer);
      this.animating.set(true);
      this._timer = setTimeout(() => this.animating.set(false), 420);
    }
  }
}
