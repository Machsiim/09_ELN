import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MediaAttachment } from '../../../../models/media-attachment';
import { MediaUploadField } from '../../../../components/media-upload-field/media-upload-field';

@Component({
  selector: 'app-measurement-media-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUploadField],
  templateUrl: './measurement-media-dialog.html',
  styleUrl: './measurement-media-dialog.scss'
})
export class MeasurementMediaDialog {
  @Input() attachments: MediaAttachment[] = [];

  @Output() attachmentsChange = new EventEmitter<MediaAttachment[]>();
  @Output() save = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
}
