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
import { firstValueFrom } from 'rxjs';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  MeasurementResponseDto,
  MeasurementService
} from '../../services/measurement.service';

@Component({
  selector: 'app-measurement-series-detail',
  imports: [CommonModule, Header, Footer],
  templateUrl: './measurement-series-detail.html',
  styleUrl: './measurement-series-detail.scss'
})
export class MeasurementSeriesDetail implements OnInit {
  private readonly measurementService = inject(MeasurementService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly measurements = signal<MeasurementResponseDto[]>([]);
  readonly filteredMeasurements = signal<MeasurementResponseDto[]>([]);
  readonly searchQuery = signal<string>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly seriesId = signal<number | null>(null);
  readonly seriesName = signal<string>('');
  readonly selectedMeasurementIds = signal<Set<number>>(new Set());
  readonly deleteInProgress = signal(false);
  readonly confirmVisible = signal(false);
  readonly confirmMessage = signal<string>('');
  readonly pendingDeletionIds = signal<number[]>([]);
  readonly successMessage = signal<string | null>(null);
  private successTimeout: number | null = null;

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = Number(params['id']);
        if (!Number.isNaN(id)) {
          this.seriesId.set(id);
          this.fetchMeasurements(id);
        } else {
          this.error.set('Ungültige Serien-ID');
        }
      });
  }

  isSelected(measurementId: number): boolean {
    return this.selectedMeasurementIds().has(measurementId);
  }

  hasSelection(): boolean {
    return this.selectedMeasurementIds().size > 0;
  }

  canEdit(): boolean {
    return this.selectedMeasurementIds().size === 1;
  }

  toggleSelection(measurementId: number, checked: boolean): void {
    const current = new Set(this.selectedMeasurementIds());
    if (checked) {
      current.add(measurementId);
    } else {
      current.delete(measurementId);
    }
    this.selectedMeasurementIds.set(current);
  }

  requestDeletion(): void {
    if (!this.hasSelection() || this.deleteInProgress()) {
      return;
    }

    const ids = Array.from(this.selectedMeasurementIds());
    const confirmationMessage =
      ids.length === 1
        ? `Sind Sie sicher, dass Sie die Messung #${ids[0]} löschen wollen?`
        : `Sind Sie sicher, dass Sie die Messungen ${ids.map(id => `#${id}`).join(', ')} löschen wollen?`;

    this.pendingDeletionIds.set(ids);
    this.confirmMessage.set(`${confirmationMessage} Diese Aktion kann nicht widerrufen werden.`);
    this.confirmVisible.set(true);
  }

  cancelDeletion(): void {
    if (this.deleteInProgress()) return;
    this.confirmVisible.set(false);
    this.pendingDeletionIds.set([]);
  }

  async confirmDeletion(): Promise<void> {
    if (this.deleteInProgress() || this.pendingDeletionIds().length === 0) {
      return;
    }

    const ids = this.pendingDeletionIds();
    this.deleteInProgress.set(true);
    this.error.set(null);

    try {
      await Promise.all(
        ids.map(id => firstValueFrom(this.measurementService.deleteMeasurement(id)))
      );

      const remaining = this.measurements().filter(m => !ids.includes(m.id));
      this.measurements.set(remaining);
      this.selectedMeasurementIds.set(new Set());

      if (this.searchQuery().trim()) {
        this.filterMeasurements();
      } else {
        this.filteredMeasurements.set(remaining);
      }
      this.confirmVisible.set(false);
      this.pendingDeletionIds.set([]);
      this.showSuccess(ids.length === 1
        ? `Messung #${ids[0]} wurde gelöscht.`
        : `${ids.length} Messungen wurden gelöscht.`);
    } catch (err) {
      console.error('Failed to delete measurements', err);
      this.error.set('Ausgewählte Messungen konnten nicht gelöscht werden.');
    } finally {
      this.deleteInProgress.set(false);
    }
  }

  private showSuccess(message: string): void {
    this.successMessage.set(message);
    if (this.successTimeout) {
      window.clearTimeout(this.successTimeout);
    }
    this.successTimeout = window.setTimeout(() => {
      this.successMessage.set(null);
      this.successTimeout = null;
    }, 4000);
  }

  trackById(_: number, item: MeasurementResponseDto): number {
    return item.id;
  }

  goBack(): void {
    this.router.navigate(['/messungen']);
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    console.log('Search query changed:', value);
    this.searchQuery.set(value);
    this.filterMeasurements();
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.filterMeasurements();
  }

  private filterMeasurements(): void {
    const query = this.searchQuery().toLowerCase().trim();
    const allMeasurements = this.measurements();

    console.log('Filtering measurements:', {
      query,
      totalMeasurements: allMeasurements.length
    });

    if (!query) {
      this.filteredMeasurements.set(allMeasurements);
      console.log('No query, showing all measurements');
      return;
    }

    const filtered = allMeasurements.filter(measurement => {
      // Search in measurement ID
      if (measurement.id.toString().includes(query)) {
        return true;
      }

      // Search in template name
      if (measurement.templateName.toLowerCase().includes(query)) {
        return true;
      }

      // Search in username
      if (measurement.createdByUsername.toLowerCase().includes(query)) {
        return true;
      }

      // Search in date
      const dateStr = new Date(measurement.createdAt).toLocaleDateString('de-DE');
      if (dateStr.includes(query)) {
        return true;
      }

      // Search in measurement data values
      for (const sectionName of Object.keys(measurement.data)) {
        const section = measurement.data[sectionName];
        for (const fieldName of Object.keys(section)) {
          const value = section[fieldName];
          const valueStr = String(value).toLowerCase();
          if (valueStr.includes(query)) {
            return true;
          }
          // Also search in field names
          if (fieldName.toLowerCase().includes(query)) {
            return true;
          }
        }
        // Also search in section names
        if (sectionName.toLowerCase().includes(query)) {
          return true;
        }
      }

      return false;
    });

    console.log('Filtered results:', filtered.length);
    this.filteredMeasurements.set(filtered);
  }

  getAllColumns(): string[] {
    // Use all measurements to get all possible columns, not just filtered ones
    const measurements = this.measurements();
    if (measurements.length === 0) return [];

    const columnsSet = new Set<string>();

    measurements.forEach(measurement => {
      Object.keys(measurement.data).forEach(sectionName => {
        const section = measurement.data[sectionName];
        Object.keys(section).forEach(fieldName => {
          columnsSet.add(`${sectionName} - ${fieldName}`);
        });
      });
    });

    return Array.from(columnsSet).sort();
  }

  getValueForColumn(measurement: MeasurementResponseDto, column: string): string {
    const [sectionName, fieldName] = column.split(' - ');

    if (!sectionName || !fieldName) return '-';

    const section = measurement.data[sectionName];
    if (!section) return '-';

    const value = section[fieldName];

    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private fetchMeasurements(seriesId: number): void {
    this.loading.set(true);
    this.error.set(null);

    // First, get the list of measurements (without full data)
    this.measurementService
      .searchMeasurements({ seriesId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async (listItems) => {
          if (listItems.length === 0) {
            this.measurements.set([]);
            this.filteredMeasurements.set([]);
            this.loading.set(false);
            return;
          }

          // Set series name from first item
          this.seriesName.set(listItems[0].seriesName);

          // Fetch full data for each measurement
          const fullMeasurements: MeasurementResponseDto[] = [];

          for (const item of listItems) {
            try {
              const fullData = await firstValueFrom(
                this.measurementService.getMeasurementById(item.id)
              );
              fullMeasurements.push(fullData);
            } catch (error) {
              console.error(`Failed to load measurement ${item.id}:`, error);
            }
          }

          this.measurements.set(fullMeasurements);
          this.filteredMeasurements.set(fullMeasurements);
          this.selectedMeasurementIds.set(new Set());
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messungen konnten nicht geladen werden.');
        }
      });
  }
}
