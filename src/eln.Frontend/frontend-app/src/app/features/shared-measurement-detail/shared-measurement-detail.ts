import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { MediaAttachment } from '../../models/media-attachment';
import { AuthService } from '../../services/auth.service';
import {
  SharedMeasurementDto,
  SharedSeriesDto,
  SharedSeriesService
} from '../../services/shared-series.service';
import { MeasurementDetailHeader } from '../measurement-detail/components/measurement-detail-header/measurement-detail-header';
import { MeasurementDetailSections } from '../measurement-detail/components/measurement-detail-sections/measurement-detail-sections';
import {
  buildSections,
  extractMediaAttachments,
  formatMediaSummary,
  formatValue
} from '../measurement-detail/measurement-detail.utils';

@Component({
  selector: 'app-shared-measurement-detail',
  standalone: true,
  imports: [
    CommonModule,
    Header,
    Footer,
    MeasurementDetailHeader,
    MeasurementDetailSections
  ],
  templateUrl: './shared-measurement-detail.html',
  styleUrl: './shared-measurement-detail.scss'
})
export class SharedMeasurementDetail implements OnInit {
  private readonly sharedService = inject(SharedSeriesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly series = signal<SharedSeriesDto | null>(null);
  readonly measurement = signal<SharedMeasurementDto | null>(null);
  readonly token = signal('');
  readonly expandedMediaFields = signal<Set<string>>(new Set());

  readonly headerMeasurement = computed(() => {
    const series = this.series();
    const measurement = this.measurement();
    if (!series || !measurement) return null;
    return {
      id: measurement.id,
      seriesId: series.seriesId,
      templateName: measurement.templateName,
      createdByUsername: measurement.createdByUsername,
      createdAt: measurement.createdAt
    };
  });

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const token = String(params['token'] ?? '').trim();
        const measurementId = Number(params['measurementId']);
        if (!token || Number.isNaN(measurementId)) {
          this.error.set('Ungültiger Quick-Link.');
          return;
        }
        this.token.set(token);
        this.loadMeasurement(token, measurementId);
      });
  }

  goBack(): void {
    this.router.navigate(['/shared', this.token()]);
  }

  getSections() {
    return buildSections(this.measurement()?.data ?? {});
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

  isMediaField(_section: string, _rawKey: string, rawValue?: unknown): boolean {
    return extractMediaAttachments(rawValue) !== null;
  }

  toggleMediaPreview(section: string, field: string): void {
    const key = `${section}::${field}`;
    this.expandedMediaFields.update((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isMediaExpanded(section: string, field: string): boolean {
    return this.expandedMediaFields().has(`${section}::${field}`);
  }

  private loadMeasurement(token: string, measurementId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.sharedService.getSharedSeries(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (series) => {
          const measurement = series.measurements.find((item) => item.id === measurementId);
          this.series.set(series);
          this.measurement.set(measurement ?? null);
          this.loading.set(false);
          if (!measurement) {
            this.error.set('Die Messung ist in diesem Quick-Link nicht enthalten.');
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.error || err?.error?.message || 'Quick-Link konnte nicht geladen werden.');
        }
      });
  }
}
