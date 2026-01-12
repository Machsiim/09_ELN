import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MeasurementHistoryEntry } from '../../../../services/measurement.service';

@Component({
  selector: 'app-measurement-history-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './measurement-history-dialog.html',
  styleUrl: './measurement-history-dialog.scss'
})
export class MeasurementHistoryDialog {
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() entries: MeasurementHistoryEntry[] = [];
  @Input() isMediaChange: (fieldName: string, value?: unknown) => boolean = () => false;
  @Input() formatMediaSummary: (value: unknown) => string = () => '';

  @Output() close = new EventEmitter<void>();
}
