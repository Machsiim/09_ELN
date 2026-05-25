import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
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
import { Pagination } from '../../components/pagination/pagination';
import {
  MeasurementSeriesGroupDto,
  MeasurementSeriesService,
  SeriesGroupParams
} from '../../services/measurement-series.service';
import { TemplateDto, TemplateService } from '../../services/template.service';

@Component({
  selector: 'app-measurements',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, Header, Footer, Pagination],
  templateUrl: './measurements.html',
  styleUrl: './measurements.scss'
})
export class Measurements implements OnInit {
  private readonly seriesService = inject(MeasurementSeriesService);
  private readonly templateService = inject(TemplateService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pagedSeries = signal<MeasurementSeriesGroupDto[]>([]);
  readonly availableTemplates = signal<TemplateDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly lastSearchTerm = signal('');
  readonly hasActiveQuery = computed(() => this.lastSearchTerm().length > 0);

  // Pagination (serverseitig)
  readonly pageSize = signal(10);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(1);

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
          this.page.set(1);
          this.fetchSeries();
        }
      });
  }

  ngOnInit(): void {
    this.fetchSeries();
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
      this.page.set(1);
      this.fetchSeries();
    }
  }

  canResetSearch(): boolean {
    return this.searchControl.value.trim().length > 0 || this.hasActiveQuery();
  }

  toggleFilterPanel(): void {
    this.filterPanelOpen.set(!this.filterPanelOpen());
  }

  applyFilters(): void {
    this.page.set(1);
    this.fetchSeries();
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
    this.page.set(1);
    this.fetchSeries();
  }

  trackById(_: number, item: MeasurementSeriesGroupDto): number {
    return item.seriesId;
  }

  onPageChange(newPage: number): void {
    this.page.set(newPage);
    this.fetchSeries();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    this.fetchSeries();
  }

  navigateToSeriesDetail(seriesId: number): void {
    this.router.navigate(['/messungen/serie', seriesId]);
  }

  private fetchSeries(): void {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const params: SeriesGroupParams = {
      page: this.page(),
      pageSize: this.pageSize(),
      ...this.buildFilterParams(),
      ...(this.lastSearchTerm() ? { searchText: this.lastSearchTerm() } : {})
    };

    this.seriesService
      .getSeriesGroups(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.pagedSeries.set(result.items);
          this.total.set(result.total);
          this.totalPages.set(Math.max(1, result.totalPages));
          this.loading.set(false);
          this.success.set(
            result.total > 0
              ? `${result.total} Messserien entsprechen den aktiven Filtern.`
              : 'Keine Messserien entsprechen den aktiven Filtern.'
          );
        },
        error: () => {
          this.pagedSeries.set([]);
          this.total.set(0);
          this.totalPages.set(1);
          this.loading.set(false);
          this.error.set('Messserien konnten nicht geladen werden.');
        }
      });
  }

  private buildFilterParams(): Partial<SeriesGroupParams> {
    const raw = this.filterForm.getRawValue();
    const params: Partial<SeriesGroupParams> = {};

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
}
