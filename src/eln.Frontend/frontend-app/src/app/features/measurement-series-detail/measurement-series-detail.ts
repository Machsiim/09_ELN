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
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messungen konnten nicht geladen werden.');
        }
      });
  }
}
