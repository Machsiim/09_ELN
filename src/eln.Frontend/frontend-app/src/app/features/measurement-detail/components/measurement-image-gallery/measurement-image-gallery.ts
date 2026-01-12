import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { ImageResponseDto, ImageService } from '../../../../services/image.service';
import { MediaAttachment } from '../../../../models/media-attachment';
import { MediaGridComponent } from '../../../../components/media-grid/media-grid';
import { MediaGridItem } from '../../../../components/media-grid/media-grid.types';
import { dataURLtoFile } from '../../../../utils/file-helpers';

@Component({
    selector: 'app-measurement-image-gallery',
    standalone: true,
    imports: [CommonModule, MatIconModule, MediaGridComponent],
    templateUrl: './measurement-image-gallery.html',
    styleUrl: './measurement-image-gallery.scss'
})
export class MeasurementImageGallery implements OnChanges {
    @Input() measurementId: number | null = null;
    @Input() readOnly = false;
    @Input() isEditing = false;
    @Output() openAddDialog = new EventEmitter<void>();

    private readonly imageService = inject(ImageService);
    private readonly destroyRef = inject(DestroyRef);

    readonly images = signal<ImageResponseDto[]>([]);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly uploading = signal(false);
    readonly pendingUploads = signal<File[]>([]);
    readonly pendingDeletes = signal<Set<number>>(new Set());

    readonly gridItems = computed<MediaGridItem[]>(() => {
        const deletes = this.pendingDeletes();
        return [
            ...this.images().filter(img => !deletes.has(img.id)).map(img => ({
                id: img.id,
                name: img.originalFileName,
                src: this.imageService.getImageUrl(img.id),
                size: img.fileSize,
                date: img.uploadedAt,
                user: img.uploadedByUsername,
                originalFile: img
            })),
            ...this.pendingUploads().map(file => ({
                id: file.name + file.lastModified,
                name: file.name,
                src: URL.createObjectURL(file),
                size: file.size,
                originalFile: file
            }))
        ];
    });

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['measurementId'] && this.measurementId) {
            this.loadImages(this.measurementId);
            this.reset();
        }
    }

    private loadImages(id: number): void {
        this.loading.set(true);
        this.error.set(null);
        this.imageService.getImagesForMeasurement(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (imgs) => { this.images.set(imgs); this.loading.set(false); },
                error: () => { this.error.set('Fehler beim Laden.'); this.loading.set(false); }
            });
    }

    openFileUpload = () => this.openAddDialog.emit();

    addPendingAssets(attachments: MediaAttachment[]): void {
        const files = attachments.map(att => dataURLtoFile(att.dataUrl, att.name))
            .filter((f): f is File => f !== null);
        this.pendingUploads.update(curr => [...curr, ...files]);
    }

    removePendingUpload(file: File): void {
        this.pendingUploads.update(curr => curr.filter(f => f !== file));
    }

    deleteImage(image: ImageResponseDto): void {
        if (this.isEditing) this.pendingDeletes.update(curr => new Set(curr).add(image.id));
    }

    onGridDelete(item: MediaGridItem): void {
        item.originalFile instanceof File
            ? this.removePendingUpload(item.originalFile)
            : this.deleteImage(item.originalFile as ImageResponseDto);
    }

    save(): Observable<void> {
        if (!this.measurementId) return of(void 0);
        const uploads = this.pendingUploads();
        const deletes = Array.from(this.pendingDeletes());

        const tasks: Observable<any>[] = [
            ...uploads.map(f => this.imageService.uploadImage(this.measurementId!, f)),
            ...deletes.map(id => this.imageService.deleteImage(id))
        ];

        if (!tasks.length) return of(void 0);

        this.uploading.set(true);
        return forkJoin(tasks).pipe(
            tap(() => {
                this.uploading.set(false);
                this.reset();
                this.loadImages(this.measurementId!);
            }),
            map(() => void 0)
        );
    }

    reset(): void {
        this.pendingUploads.set([]);
        this.pendingDeletes.set(new Set());
    }
}
