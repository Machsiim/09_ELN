import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  MeasurementListItem,
  MeasurementService,
  MeasurementSearchParams
} from '../../services/measurement.service';

interface MeasurementSeriesGroup {
  seriesId: number;
  seriesName: string;
  measurementCount: number;
  latestMeasurementId: number;
  latestTemplateName: string;
  latestCreatedAt: string;
  templateNames: string[];
  authorNames: string[];
}

@Component({
  selector: 'app-measurements',
  imports: [CommonModule, ReactiveFormsModule, Header, Footer],
  templateUrl: './measurements.html',
  styleUrl: './measurements.scss'
})
export class Measurements implements OnInit {
  private readonly measurementService = inject(MeasurementService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly measurements = signal<MeasurementListItem[]>([]);
  readonly groupedMeasurements = signal<MeasurementSeriesGroup[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly lastSearchTerm = signal('');
  readonly hasActiveQuery = computed(() => this.lastSearchTerm().length > 0);
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly filterForm = this.fb.nonNullable.group({
    seriesId: [''],
    dateFrom: [''],
    dateTo: ['']
  });
  readonly filterPanelOpen = signal(false);

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.error.set(null);
      });
  }

  ngOnInit(): void {
    this.fetchMeasurements();
  }

  onSearch(): void {
    const term = this.searchControl.value.trim();
    this.lastSearchTerm.set(term);
    this.fetchMeasurements(term || undefined, this.buildFilterParams());
  }

  resetSearch(): void {
    const hadValue = this.searchControl.value.trim().length > 0;
    if (hadValue) {
      this.searchControl.setValue('');
    }

    if (hadValue || this.hasActiveQuery()) {
      this.lastSearchTerm.set('');
      this.fetchMeasurements(undefined, this.buildFilterParams());
    }
  }

  canResetSearch(): boolean {
    return this.searchControl.value.trim().length > 0 || this.hasActiveQuery();
  }

  toggleFilterPanel(): void {
    this.filterPanelOpen.set(!this.filterPanelOpen());
  }

  applyFilters(): void {
    const filters = this.buildFilterParams();
    this.fetchMeasurements(this.lastSearchTerm() || undefined, filters);
    this.filterPanelOpen.set(false);
  }

  resetFilters(): void {
    if (!this.hasActiveFilters()) {
      return;
    }
    this.filterForm.reset({
      seriesId: '',
      dateFrom: '',
      dateTo: ''
    });
    this.fetchMeasurements(this.lastSearchTerm() || undefined);
  }

  trackById(_: number, item: MeasurementSeriesGroup): number {
    return item.seriesId;
  }

  private fetchMeasurements(searchText?: string, filterParams?: MeasurementSearchParams): void {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const params: MeasurementSearchParams = {
      ...(filterParams ?? {}),
      ...(searchText ? { searchText } : {})
    };

    this.measurementService
      .searchMeasurements(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.measurements.set(data);
          const grouped = this.groupMeasurementsBySeries(data);
          this.groupedMeasurements.set(grouped);
          this.loading.set(false);
          this.success.set(
            grouped.length > 0
              ? `${grouped.length} Messserien entsprechen den aktiven Filtern.`
              : 'Keine Messserien entsprechen den aktiven Filtern.'
          );
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messungen konnten nicht geladen werden.');
        }
      });
  }

  private buildFilterParams(): MeasurementSearchParams {
    const raw = this.filterForm.getRawValue();
    const params: MeasurementSearchParams = {};

    if (raw.seriesId.trim().length > 0) {
      const parsed = Number(raw.seriesId);
      if (!Number.isNaN(parsed)) {
        params.seriesId = parsed;
      }
    }

    if (raw.dateFrom.trim().length > 0) {
      params.dateFrom = raw.dateFrom;
    }

    if (raw.dateTo.trim().length > 0) {
      params.dateTo = raw.dateTo;
    }

    return params;
  }

  hasActiveFilters(): boolean {
    const { seriesId, dateFrom, dateTo } = this.filterForm.getRawValue();
    return (
      seriesId.trim().length > 0 ||
      dateFrom.trim().length > 0 ||
      dateTo.trim().length > 0
    );
  }

  private groupMeasurementsBySeries(data: MeasurementListItem[]): MeasurementSeriesGroup[] {
    const map = new Map<number, MeasurementSeriesGroup & { templateSet: Set<string>; authorSet: Set<string> }>();

    data.forEach((measurement) => {
      const existing = map.get(measurement.seriesId);
      if (!existing) {
        map.set(measurement.seriesId, {
          seriesId: measurement.seriesId,
          seriesName: measurement.seriesName,
          measurementCount: 1,
          latestMeasurementId: measurement.id,
          latestTemplateName: measurement.templateName,
          latestCreatedAt: measurement.createdAt,
          templateNames: [measurement.templateName],
          authorNames: [measurement.createdByUsername],
          templateSet: new Set([measurement.templateName]),
          authorSet: new Set([measurement.createdByUsername])
        });
      } else {
        existing.measurementCount += 1;
        if (new Date(measurement.createdAt).getTime() > new Date(existing.latestCreatedAt).getTime()) {
          existing.latestMeasurementId = measurement.id;
          existing.latestTemplateName = measurement.templateName;
          existing.latestCreatedAt = measurement.createdAt;
        }
        if (!existing.templateSet.has(measurement.templateName)) {
          existing.templateSet.add(measurement.templateName);
          existing.templateNames = Array.from(existing.templateSet);
        }
        if (!existing.authorSet.has(measurement.createdByUsername)) {
          existing.authorSet.add(measurement.createdByUsername);
          existing.authorNames = Array.from(existing.authorSet);
        }
      }
    });

    return Array.from(map.values()).map(({ templateSet, authorSet, ...group }) => group);
  }
}
