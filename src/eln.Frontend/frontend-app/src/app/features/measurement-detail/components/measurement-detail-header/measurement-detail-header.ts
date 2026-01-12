import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MeasurementResponseDto } from '../../../../services/measurement.service';

@Component({
  selector: 'app-measurement-detail-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './measurement-detail-header.html',
  styleUrl: './measurement-detail-header.scss'
})
export class MeasurementDetailHeader {
  @Input() measurement: MeasurementResponseDto | null = null;
  @Input() isEditing = false;
  @Input() saveInProgress = false;

  @Output() back = new EventEmitter<void>();
  @Output() openHistory = new EventEmitter<void>();
  @Output() startEditing = new EventEmitter<void>();
  @Output() cancelEditing = new EventEmitter<void>();
  @Output() saveEdits = new EventEmitter<void>();
  @Output() confirmDelete = new EventEmitter<void>();
}
