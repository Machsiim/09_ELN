import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
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

  readonly recentActivities = signal<ActivityDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRecentActivities();
  }

  private loadRecentActivities(): void {
    this.loading.set(true);
    this.error.set(null);
    this.activityService
      .getActivities({ page: 1, pageSize: 3 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.recentActivities.set(result.items);
          this.loading.set(false);
        },
        error: () => {
          this.recentActivities.set([]);
          this.loading.set(false);
          this.error.set('Aktivitäten konnten nicht geladen werden.');
        }
      });
  }

  openActivities(): void {
    this.router.navigate(['/dashboard/activities']);
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
}
