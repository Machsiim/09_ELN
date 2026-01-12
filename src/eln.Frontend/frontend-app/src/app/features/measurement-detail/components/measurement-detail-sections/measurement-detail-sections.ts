import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MediaAttachment } from '../../../../models/media-attachment';
import { SectionEntry } from '../../measurement-detail.types';

@Component({
  selector: 'app-measurement-detail-sections',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './measurement-detail-sections.html',
  styleUrl: './measurement-detail-sections.scss'
})
export class MeasurementDetailSections {
  @Input() sections: SectionEntry[] = [];
  @Input() isEditing = false;
  @Input() saveInProgress = false;

  @Input() formatValue: (value: unknown) => string = () => '';
  @Input() formatMediaSummary: (value: unknown) => string = () => '';
  @Input() isMediaField: (section: string, rawKey: string, rawValue?: unknown) => boolean = () => false;
  @Input() getMediaAttachments: (value: unknown) => MediaAttachment[] | null = () => null;
  @Input() getEditableMediaAttachments: (section: string, rawKey: string) => MediaAttachment[] | null = () => null;
  @Input() isMediaExpanded: (section: string, rawKey: string) => boolean = () => false;
  @Input() getEditableValue: (section: string, rawKey: string) => string = () => '';

  @Output() toggleMediaPreview = new EventEmitter<{ section: string; field: string }>();
  @Output() openMediaDialog = new EventEmitter<{ section: string; field: string }>();
  @Output() updateFieldValue = new EventEmitter<{ section: string; field: string; value: string }>();
  @Output() removeEditableAttachment = new EventEmitter<{
    section: string;
    field: string;
    attachmentId: string;
  }>();

  onToggleMediaPreview(section: string, field: string): void {
    this.toggleMediaPreview.emit({ section, field });
  }

  onOpenMediaDialog(section: string, field: string): void {
    this.openMediaDialog.emit({ section, field });
  }

  onUpdateFieldValue(section: string, field: string, value: string): void {
    this.updateFieldValue.emit({ section, field, value });
  }

  onRemoveAttachment(section: string, field: string, attachmentId: string): void {
    this.removeEditableAttachment.emit({ section, field, attachmentId });
  }
}
