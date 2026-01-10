import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  MeasurementResponseDto,
  MeasurementService,
  MeasurementHistoryEntry
} from '../../services/measurement.service';
import { MediaAttachment } from '../../models/media-attachment';
import { MeasurementDetailHeader } from './components/measurement-detail-header/measurement-detail-header';
import { MeasurementDetailSections } from './components/measurement-detail-sections/measurement-detail-sections';
import { MeasurementHistoryDialog } from './components/measurement-history-dialog/measurement-history-dialog';
import { MeasurementMediaDialog } from './components/measurement-media-dialog/measurement-media-dialog';
import { SectionEntry } from './measurement-detail.types';
import {
  buildSections,
  castValue,
  extractMediaAttachments,
  formatMediaSummary,
  formatValue
} from './measurement-detail.utils';

@Component({
  selector: 'app-measurement-detail',
  standalone: true,
  imports: [
    CommonModule,
    Header,
    Footer,
    MeasurementDetailHeader,
    MeasurementDetailSections,
    MeasurementHistoryDialog,
    MeasurementMediaDialog
  ],
  templateUrl: './measurement-detail.html',
  styleUrl: './measurement-detail.scss'
})
export class MeasurementDetail implements OnInit {
  private readonly measurementService = inject(MeasurementService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly measurement = signal<MeasurementResponseDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleteInProgress = signal(false);
  readonly deleteConfirmVisible = signal(false);
  readonly toastMessage = signal<string | null>(null);
  readonly isEditing = signal(false);
  readonly saveInProgress = signal(false);
  readonly editableData = signal<Record<string, Record<string, unknown>> | null>(null);
  readonly cancelEditVisible = signal(false);
  readonly historyVisible = signal(false);
  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);
  readonly historyEntries = signal<MeasurementHistoryEntry[]>([]);
  readonly expandedMediaFields = signal<Set<string>>(new Set());
  readonly mediaDialogOpen = signal(false);
  readonly mediaDialogContext = signal<{ section: string; field: string } | null>(null);
  readonly pendingMediaAttachments = signal<MediaAttachment[]>([]);

  private toastTimeout: number | null = null;

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = Number(params['measurementId']);
      if (Number.isNaN(id)) {
        this.error.set('Ungültige Messungs-ID');
        return;
      }
      this.fetchMeasurement(id);
    });
  }

  private fetchMeasurement(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.measurementService
      .getMeasurementById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.measurement.set(result);
          this.expandedMediaFields.set(new Set());
          if (this.isEditing()) {
            this.editableData.set(this.cloneData(result.data));
          }
          this.loading.set(false);
          this.fetchLatestUpdate(id, result);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messung konnte nicht geladen werden.');
        }
      });
  }

  private fetchLatestUpdate(id: number, measurement: MeasurementResponseDto): void {
    this.measurementService
      .getMeasurementHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (history) => {
          const latestUpdate = history
            .filter(h => h.changeType === 'Updated')
            .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())[0];

          if (latestUpdate) {
            this.measurement.set({
              ...measurement,
              updatedAt: latestUpdate.changedAt,
              updatedByUsername: latestUpdate.changedByUsername
            });
          }
        },
        error: () => {
          // Silently fail - update info is not critical
        }
      });
  }

  goBack(): void {
    const measurement = this.measurement();
    if (!measurement) {
      this.router.navigate(['/messungen']);
      return;
    }
    this.router.navigate([`/messungen/serie/${measurement.seriesId}`]);
  }

  confirmDelete(): void {
    if (!this.deleteInProgress()) {
      this.deleteConfirmVisible.set(true);
    }
  }

  closeDeleteModal(): void {
    if (this.deleteInProgress()) return;
    this.deleteConfirmVisible.set(false);
  }

  deleteMeasurement(): void {
    const measurement = this.measurement();
    if (!measurement || this.deleteInProgress()) {
      return;
    }

    this.deleteInProgress.set(true);
    this.measurementService
      .deleteMeasurement(measurement.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteInProgress.set(false);
          this.deleteConfirmVisible.set(false);
          this.showToast('Messung wurde gelöscht.');
          setTimeout(() => {
            this.router.navigate([`/messungen/serie/${measurement.seriesId}`]);
          }, 300);
        },
        error: () => {
          this.deleteInProgress.set(false);
          this.error.set('Messung konnte nicht gelöscht werden.');
        }
      });
  }

  startEditing(): void {
    const measurement = this.measurement();
    if (!measurement) return;
    this.editableData.set(this.cloneData(measurement.data));
    this.isEditing.set(true);
    this.error.set(null);
  }


  cancelEditing(): void {
    if (this.saveInProgress()) {
      return;
    }
    this.cancelEditVisible.set(true);
  }

  closeCancelModal(): void {
    this.cancelEditVisible.set(false);
  }

  confirmCancelEditing(): void {
    this.isEditing.set(false);
    this.editableData.set(null);
    this.saveInProgress.set(false);
    this.cancelEditVisible.set(false);
  }

  updateFieldValue(sectionName: string, rawKey: string, value: string): void {
    const current = this.editableData();
    if (!current || !current[sectionName]) return;

    const nextSection = { ...current[sectionName] };
    const originalValue = this.measurement()?.data[sectionName]?.[rawKey];
    nextSection[rawKey] = this.castValue(value, originalValue);

    this.editableData.set({
      ...current,
      [sectionName]: nextSection
    });
  }

  saveEdits(): void {
    const measurement = this.measurement();
    const data = this.editableData();
    if (!measurement || !data || this.saveInProgress()) {
      return;
    }

    this.saveInProgress.set(true);
    this.error.set(null);
    this.measurementService
      .updateMeasurement(measurement.id, { data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saveInProgress.set(false);
          this.measurement.set(updated);
          this.editableData.set(null);
          this.isEditing.set(false);
          this.showToast('Messung wurde aktualisiert.');
          this.fetchLatestUpdate(measurement.id, updated);
        },
        error: () => {
          this.saveInProgress.set(false);
          this.error.set('Messung konnte nicht aktualisiert werden.');
        }
      });
  }

  getSections(dataSource?: Record<string, Record<string, unknown>> | null): SectionEntry[] {
    const measurement = this.measurement();
    const source = dataSource ?? measurement?.data;
    return buildSections(source);
  }

  formatValue(value: unknown): string {
    return formatValue(value);
  }

  getMediaAttachments(value: unknown): MediaAttachment[] | null {
    return extractMediaAttachments(value);
  }

  getEditableMediaAttachments(sectionName: string, rawKey: string): MediaAttachment[] | null {
    const data = this.editableData();
    const value = data?.[sectionName]?.[rawKey];
    return extractMediaAttachments(value);
  }

  toggleMediaPreview(sectionName: string, rawKey: string): void {
    const key = this.buildMediaFieldKey(sectionName, rawKey);
    this.expandedMediaFields.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  isMediaExpanded(sectionName: string, rawKey: string): boolean {
    const key = this.buildMediaFieldKey(sectionName, rawKey);
    return this.expandedMediaFields().has(key);
  }

  isMediaField(sectionOrType: string, rawKey?: string, rawValue?: unknown): boolean {
    if (rawKey === undefined) {
      return sectionOrType === 'media';
    }
    const measurement = this.measurement();
    const baseValue = measurement?.data?.[sectionOrType]?.[rawKey] ?? rawValue;
    const editableValue = this.editableData()?.[sectionOrType]?.[rawKey];
    return extractMediaAttachments(baseValue) !== null || extractMediaAttachments(editableValue) !== null;
  }

  private buildMediaFieldKey(sectionName: string, rawKey: string): string {
    return `${sectionName}::${rawKey}`;
  }

  openMediaDialog(sectionName: string, rawKey: string): void {
    this.mediaDialogContext.set({ section: sectionName, field: rawKey });
    this.pendingMediaAttachments.set([]);
    this.mediaDialogOpen.set(true);
  }

  closeMediaDialog(): void {
    this.mediaDialogOpen.set(false);
    this.mediaDialogContext.set(null);
    this.pendingMediaAttachments.set([]);
  }

  onDialogAttachmentsChange(attachments: MediaAttachment[]): void {
    this.pendingMediaAttachments.set(attachments ?? []);
  }

  saveDialogAttachments(): void {
    const context = this.mediaDialogContext();
    const attachments = this.pendingMediaAttachments();
    if (!context || attachments.length === 0) {
      this.closeMediaDialog();
      return;
    }

    const current = this.editableData();
    if (!current || !current[context.section]) {
      this.closeMediaDialog();
      return;
    }

    const existing = this.getEditableMediaAttachments(context.section, context.field) ?? [];
    const updatedSection = {
      ...current[context.section],
      [context.field]: [...existing, ...attachments]
    };

    this.editableData.set({
      ...current,
      [context.section]: updatedSection
    });
    this.expandedMediaFields.update((set) => {
      const clone = new Set(set);
      clone.add(this.buildMediaFieldKey(context.section, context.field));
      return clone;
    });
    this.closeMediaDialog();
  }

  getEditableValue(sectionName: string, rawKey: string): string {
    const data = this.editableData();
    const value = data?.[sectionName]?.[rawKey];
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private castValue(input: string, original: unknown): unknown {
    return castValue(input, original);
  }

  private cloneData(data: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
    return JSON.parse(JSON.stringify(data));
  }

  removeEditableAttachment(sectionName: string, rawKey: string, attachmentId: string): void {
    const current = this.editableData();
    if (!current || !current[sectionName]) return;

    const attachments = this.getEditableMediaAttachments(sectionName, rawKey);
    if (!attachments) {
      return;
    }

    const filtered = attachments.filter((attachment) => attachment.id !== attachmentId);
    const nextSection = { ...current[sectionName], [rawKey]: filtered };

    this.editableData.set({
      ...current,
      [sectionName]: nextSection
    });
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastMessage.set(null);
      this.toastTimeout = null;
    }, 4000);
  }

  openHistory(): void {
    const measurement = this.measurement();
    if (!measurement) {
      return;
    }
    this.historyVisible.set(true);
    this.historyLoading.set(true);
    this.historyError.set(null);
    this.measurementService
      .getMeasurementHistory(measurement.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (entries) => {
          this.historyEntries.set(entries);
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyLoading.set(false);
          this.historyError.set('Der Änderungsverlauf konnte nicht geladen werden.');
        }
      });
  }

  closeHistory(): void {
    this.historyVisible.set(false);
  }

  isMediaChange(fieldName: string, value?: unknown): boolean {
    if (!value) {
      return false;
    }
    return extractMediaAttachments(value) !== null;
  }

  formatMediaSummary(value: unknown): string {
    return formatMediaSummary(value);
  }
}
