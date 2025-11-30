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
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  MeasurementListItem,
  MeasurementService,
  MeasurementSearchParams
} from '../../services/measurement.service';
import { TemplateDto, TemplateService } from '../../services/template.service';

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
  private readonly templateService = inject(TemplateService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly measurements = signal<MeasurementListItem[]>([]);
  readonly groupedMeasurements = signal<MeasurementSeriesGroup[]>([]);
  readonly availableTemplates = signal<TemplateDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly lastSearchTerm = signal('');
  readonly hasActiveQuery = computed(() => this.lastSearchTerm().length > 0);
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly filterForm = this.fb.nonNullable.group({
    templateId: [''],
    dateFrom: [''],
    dateTo: ['']
  });
  readonly filterPanelOpen = signal(false);

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.error.set(null);
        const term = value.trim();
        if (term.length > 0 || this.lastSearchTerm().length > 0) {
          this.lastSearchTerm.set(term);
          this.fetchMeasurements(term || undefined, this.buildFilterParams());
        }
      });
  }

  ngOnInit(): void {
    this.fetchMeasurements();
    this.loadTemplates();
  }

  private loadTemplates(): void {
    this.templateService
      .getTemplates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (templates) => {
          this.availableTemplates.set(templates);
        },
        error: (err) => {
          console.error('Failed to load templates:', err);
        }
      });
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
      templateId: '',
      dateFrom: '',
      dateTo: ''
    });
    this.fetchMeasurements(this.lastSearchTerm() || undefined);
  }

  trackById(_: number, item: MeasurementSeriesGroup): number {
    return item.seriesId;
  }

  navigateToSeriesDetail(seriesId: number): void {
    this.router.navigate(['/messungen/serie', seriesId]);
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

    if (raw.templateId !== null && raw.templateId !== undefined && String(raw.templateId).trim().length > 0) {
      const parsed = Number(raw.templateId);
      if (!Number.isNaN(parsed)) {
        params.templateId = parsed;
      }
    }

    if (raw.dateFrom && raw.dateFrom.trim().length > 0) {
      params.dateFrom = `${raw.dateFrom}T00:00:00Z`;
    }

    if (raw.dateTo && raw.dateTo.trim().length > 0) {
      params.dateTo = `${raw.dateTo}T23:59:59Z`;
    }

    return params;
  }

  hasActiveFilters(): boolean {
    const { templateId, dateFrom, dateTo } = this.filterForm.getRawValue();
    return !!(
      (templateId !== null && templateId !== undefined && String(templateId).trim().length > 0) ||
      (dateFrom && dateFrom.trim().length > 0) ||
      (dateTo && dateTo.trim().length > 0)
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
