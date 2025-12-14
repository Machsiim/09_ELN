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
import { MeasurementResponseDto, MeasurementService } from '../../services/measurement.service';

interface SectionEntry {
  name: string;
  cards: CardEntry[];
}

interface CardEntry {
  name: string;
  fields: FieldEntry[];
}

interface FieldEntry {
  key: string;
  value: unknown;
  rawKey: string;
}

@Component({
  selector: 'app-measurement-detail',
  standalone: true,
  imports: [CommonModule, Header, Footer],
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
          if (this.isEditing()) {
            this.editableData.set(this.cloneData(result.data));
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messung konnte nicht geladen werden.');
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
    if (!source) {
      return [];
    }

    const sections: SectionEntry[] = [];

    for (const [sectionName, fields] of Object.entries(source)) {
      const cards = new Map<string, CardEntry>();

      for (const [rawKey, value] of Object.entries(fields)) {
        const separatorIndex = rawKey.indexOf(' - ');
        const cardName = separatorIndex > -1 ? rawKey.slice(0, separatorIndex) : 'Allgemein';
        const fieldLabel = separatorIndex > -1 ? rawKey.slice(separatorIndex + 3) : rawKey;

        if (!cards.has(cardName)) {
          cards.set(cardName, { name: cardName, fields: [] });
        }

        cards.get(cardName)!.fields.push({ key: fieldLabel, value, rawKey });
      }

      sections.push({
        name: sectionName,
        cards: Array.from(cards.values())
      });
    }

    return sections;
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
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
    if (original === null || original === undefined) {
      return input;
    }
    if (typeof original === 'number') {
      const parsed = Number(input);
      return Number.isNaN(parsed) ? input : parsed;
    }
    if (typeof original === 'boolean') {
      return input.toLowerCase() === 'true';
    }
    return input;
  }

  private cloneData(data: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
    return JSON.parse(JSON.stringify(data));
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
}
