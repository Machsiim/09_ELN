import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
export interface MeasurementDetailHeaderData {
  id: number;
  seriesId: number;
  templateName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt?: string;
  updatedByUsername?: string;
}

@Component({
  selector: 'app-measurement-detail-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './measurement-detail-header.html',
  styleUrl: './measurement-detail-header.scss'
})
export class MeasurementDetailHeader {
  @Input() measurement: MeasurementDetailHeaderData | null = null;
  @Input() isEditing = false;
  @Input() saveInProgress = false;
  @Input() isSeriesLocked = false;
  @Input() isStaff = false;
  @Input() readOnly = false;

  @Output() back = new EventEmitter<void>();
  @Output() openHistory = new EventEmitter<void>();
  @Output() startEditing = new EventEmitter<void>();
  @Output() cancelEditing = new EventEmitter<void>();
  @Output() saveEdits = new EventEmitter<void>();
  @Output() confirmDelete = new EventEmitter<void>();
}
