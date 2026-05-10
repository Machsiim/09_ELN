import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import {
  ActivityDto,
  ActivityService,
  ActivityType
} from '../../services/activity.service';

const TYPE_OPTIONS: { value: '' | ActivityType; label: string }[] = [
  { value: '', label: 'Alle Typen' },
  { value: 'MeasurementCreated', label: 'Messung erstellt' },
  { value: 'MeasurementUpdated', label: 'Messung aktualisiert' },
  { value: 'MeasurementDeleted', label: 'Messung gelöscht' },
  { value: 'SeriesCreated', label: 'Serie erstellt' },
  { value: 'TemplateCreated', label: 'Template erstellt' }
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, Header, Footer],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  private readonly activityService = inject(ActivityService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly activities = signal<ActivityDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly totalPages = signal(1);
  readonly typeFilter = signal<'' | ActivityType>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly typeOptions = TYPE_OPTIONS;

  readonly hasPrev = computed(() => this.page() > 1);
  readonly hasNext = computed(() => this.page() < this.totalPages());
  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.page() * this.pageSize(), this.total())
  );

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    const type = this.typeFilter();
    this.activityService
      .getActivities({
        page: this.page(),
        pageSize: this.pageSize(),
        type: type || undefined
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.activities.set(result.items);
          this.total.set(result.total);
          this.totalPages.set(Math.max(1, result.totalPages));
          this.loading.set(false);
        },
        error: () => {
          this.activities.set([]);
          this.total.set(0);
          this.totalPages.set(1);
          this.loading.set(false);
          this.error.set('Aktivitäten konnten nicht geladen werden.');
        }
      });
  }

  onTypeChange(value: string): void {
    this.typeFilter.set(value as '' | ActivityType);
    this.page.set(1);
    this.load();
  }

  prev(): void {
    if (this.hasPrev()) {
      this.page.set(this.page() - 1);
      this.load();
    }
  }

  next(): void {
    if (this.hasNext()) {
      this.page.set(this.page() + 1);
      this.load();
    }
  }

  refresh(): void {
    this.load();
  }

  labelFor(type: ActivityType): string {
    switch (type) {
      case 'MeasurementCreated': return 'Messung erstellt';
      case 'MeasurementUpdated': return 'Messung aktualisiert';
      case 'MeasurementDeleted': return 'Messung gelöscht';
      case 'SeriesCreated': return 'Serie erstellt';
      case 'TemplateCreated': return 'Template erstellt';
      default: return type;
    }
  }

  goToTarget(activity: ActivityDto): void {
    if (activity.seriesId) {
      this.router.navigate(['/messungen/serie', activity.seriesId]);
    }
  }
}
