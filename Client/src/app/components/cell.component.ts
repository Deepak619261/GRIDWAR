import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
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
      [style.background-color]="cell.ownerColor || '#2d2d4e'"
      [title]="cell.ownerName || 'unclaimed'"
      (click)="capture.emit()"
    ></div>
  `,
  styles: [`
    .cell {
      width: 14px;
      height: 14px;
      cursor: pointer;
      border-radius: 2px;
      transition: transform 0.08s ease, filter 0.08s ease;
    }
    .cell:hover {
      filter: brightness(1.4);
      transform: scale(1.2);
      z-index: 1;
      position: relative;
    }
    .cell.mine {
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5);
    }
  `]
})
export class CellComponent {
  @Input() cell!: CellState;
  @Input() isMyCell = false;
  @Output() capture = new EventEmitter<void>();
}
