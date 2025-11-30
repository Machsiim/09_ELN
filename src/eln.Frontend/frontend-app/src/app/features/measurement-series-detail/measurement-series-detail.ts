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
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly seriesId = signal<number | null>(null);
  readonly seriesName = signal<string>('');
  readonly expandedRows = signal<Set<number>>(new Set());

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

  trackById(_: number, item: MeasurementResponseDto): number {
    return item.id;
  }

  goBack(): void {
    this.router.navigate(['/messungen']);
  }

  toggleRow(id: number): void {
    const expanded = this.expandedRows();
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    this.expandedRows.set(newExpanded);
  }

  isRowExpanded(id: number): boolean {
    return this.expandedRows().has(id);
  }

  getDataKeys(data: Record<string, Record<string, unknown>>): string[] {
    return Object.keys(data);
  }

  getFieldKeys(fields: Record<string, unknown>): string[] {
    return Object.keys(fields);
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
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
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messungen konnten nicht geladen werden.');
        }
      });
  }
}
