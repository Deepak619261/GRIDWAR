import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { GridService } from '../services/grid.service';
import { CellComponent } from './cell.component';

@Component({
  selector: 'app-grid',
  standalone: true,
  imports: [CellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid-container">
      @for (cell of gridService.grid(); track cell.index) {
        <app-cell
          [cell]="cell"
          [isMyCell]="cell.ownerId === gridService.myUser()?.userId"
          (capture)="gridService.captureCell(cell.index)"
        />
      }
    </div>
  `,
  styles: [`
    .grid-container {
      display: grid;
      grid-template-columns: repeat(50, 14px);
      grid-template-rows: repeat(50, 14px);
      gap: 2px;
      background: #1a1a2e;
      padding: 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }
  `]
})
export class GridComponent {
  readonly gridService = inject(GridService);
}
