import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import {
  MeasurementSeriesTable,
  SeriesTableMeasurement
} from '../../components/measurement-series-table/measurement-series-table';
import { SeriesCharts } from '../../components/series-charts/series-charts';
import { AuthService } from '../../services/auth.service';
import { SharedSeriesDto, SharedSeriesService } from '../../services/shared-series.service';

@Component({
  selector: 'app-shared-series',
  standalone: true,
  imports: [CommonModule, Header, Footer, SeriesCharts, MeasurementSeriesTable],
  templateUrl: './shared-series.html',
  styleUrl: './shared-series.scss'
})
export class SharedSeries implements OnInit {
  private readonly sharedService = inject(SharedSeriesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly requiresLogin = signal(false);
  readonly series = signal<SharedSeriesDto | null>(null);
  readonly token = signal('');

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const token = String(params['token'] ?? '').trim();
        if (!token) {
          this.error.set('Ungültiger Quick-Link.');
          return;
        }
        this.token.set(token);
        this.fetchSharedSeries(token);
      });
  }

  goToLogin(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  openMeasurement(measurement: SeriesTableMeasurement): void {
    this.router.navigate(['/shared', this.token(), 'measurement', measurement.id]);
  }

  private fetchSharedSeries(token: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.requiresLogin.set(false);
    this.sharedService
      .getSharedSeries(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.series.set(result);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          const backendMessage = this.getBackendErrorMessage(err);
          if (!this.authService.isAuthenticated() && this.isAccessDeniedMessage(backendMessage)) {
            this.requiresLogin.set(true);
            this.error.set(
              'Dieser Quick-Link ist nur für bestimmte Personen freigegeben. Bitte melden Sie sich mit dem freigegebenen Konto an.'
            );
            return;
          }
          this.error.set(backendMessage || 'Quick-Link konnte nicht geladen werden.');
        }
      });
  }

  private isAccessDeniedMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes("don't have access") ||
      normalized.includes('access') ||
      normalized.includes('forbidden') ||
      normalized.includes('nicht berechtigt') ||
      normalized.includes('keine berechtigung');
  }

  private getBackendErrorMessage(err: unknown): string {
    const error = (err as { error?: unknown })?.error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'error' in error) {
      return String((error as { error?: unknown }).error ?? '');
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message ?? '');
    }
    return '';
  }
}
