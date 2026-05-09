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
import { MeasurementDetailSections } from '../measurement-detail/components/measurement-detail-sections/measurement-detail-sections';
import {
  SharedMeasurementDto,
  SharedSeriesDto,
  SharedSeriesService
} from '../../services/shared-series.service';
import { MediaAttachment } from '../../models/media-attachment';
import { SectionEntry } from '../measurement-detail/measurement-detail.types';
import {
  buildSections,
  extractMediaAttachments,
  formatMediaSummary,
  formatValue
} from '../measurement-detail/measurement-detail.utils';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-shared-series',
  standalone: true,
  imports: [CommonModule, Header, Footer, MeasurementDetailSections],
  templateUrl: './shared-series.html',
  styleUrl: './shared-series.scss'
})
export class SharedSeries implements OnInit {
  private readonly sharedService = inject(SharedSeriesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly requiresLogin = signal(false);
  readonly series = signal<SharedSeriesDto | null>(null);
  readonly expandedMediaFields = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const token = String(params['token'] ?? '').trim();
        if (!token) {
          this.error.set('Ungültiger Quick-Link.');
          return;
        }
        this.fetchSharedSeries(token);
      });
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
          const backendMessage = err.error?.error || '';
          if (!this.authService.isAuthenticated() && this.isAccessDeniedMessage(backendMessage)) {
            this.requiresLogin.set(true);
            this.error.set('Dieser Quick-Link ist nur fuer bestimmte Personen freigegeben. Bitte melden Sie sich mit dem freigegebenen Konto an.');
            return;
          }
          this.error.set(backendMessage || 'Quick-Link konnte nicht geladen werden.');
        }
      });
  }

  goToLogin(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  getSections(measurement: SharedMeasurementDto): SectionEntry[] {
    return buildSections(measurement.data);
  }

  formatValue(value: unknown): string {
    return formatValue(value);
  }

  formatMediaSummary(value: unknown): string {
    return formatMediaSummary(value);
  }

  getMediaAttachments(value: unknown): MediaAttachment[] | null {
    return extractMediaAttachments(value);
  }

  isMediaField(section: string, rawKey: string, rawValue?: unknown): boolean {
    return extractMediaAttachments(rawValue) !== null;
  }

  toggleMediaPreview(measurementId: number, section: string, field: string): void {
    const key = this.buildMediaFieldKey(measurementId, section, field);
    this.expandedMediaFields.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  isMediaExpanded(measurementId: number, section: string, field: string): boolean {
    return this.expandedMediaFields().has(this.buildMediaFieldKey(measurementId, section, field));
  }

  private buildMediaFieldKey(measurementId: number, section: string, field: string): string {
    return `${measurementId}::${section}::${field}`;
  }

  private isAccessDeniedMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes("don't have access") || normalized.includes('access') || normalized.includes('forbidden');
  }
}
