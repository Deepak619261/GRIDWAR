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
      aspect-ratio: 1;
      cursor: pointer;
      border-radius: 1px;
      transition: background-color 0.15s ease, transform 0.1s ease;
    }
    .cell:hover {
      filter: brightness(1.3);
      transform: scale(1.15);
      z-index: 1;
      position: relative;
    }
    .cell.mine {
      box-shadow: 0 0 0 1px rgba(255,255,255,0.6);
    }
  `]
})
export class CellComponent {
  @Input() cell!: CellState;
  @Input() isMyCell = false;
  @Output() capture = new EventEmitter<void>();
}
