import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MediaGridItem } from './media-grid.types';
import { formatDate, formatFileSize } from '../../utils/file-helpers';

@Component({
    selector: 'app-media-grid',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './media-grid.html',
    styleUrl: './media-grid.scss'
})
export class MediaGridComponent {
    @Input() items: MediaGridItem[] = [];
    @Input() editable = false;
    @Input() emptyText = 'Keine Medien vorhanden.';

    @Output() delete = new EventEmitter<MediaGridItem>();

    readonly selectedItem = signal<MediaGridItem | null>(null);

    readonly formatFileSize = formatFileSize;
    readonly formatDate = formatDate;

    openPreview(item: MediaGridItem): void {
        this.selectedItem.set(item);
    }

    closePreview(): void {
        this.selectedItem.set(null);
    }

    onDelete(item: MediaGridItem, event: Event): void {
        event.stopPropagation();
        this.delete.emit(item);
    }
}
