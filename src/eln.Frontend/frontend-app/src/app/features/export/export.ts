import { Component, OnInit, signal } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ExportService } from '../../services/export.service';
import { MeasurementSeriesService, MeasurementSeriesDto } from '../../services/measurement-series.service';
import { MeasurementService, MeasurementResponseDto } from '../../services/measurement.service';
import { firstValueFrom } from 'rxjs';

type ExportMode = 'series' | 'measurement';
type ExportFormat = 'excel' | 'csv';

@Component({
  selector: 'app-export',
  imports: [FormsModule, Header, Footer],
  templateUrl: './export.html',
  styleUrl: './export.scss',
})
export class Export implements OnInit {
  exportMode = signal<ExportMode>('series');
  exportFormat = signal<ExportFormat>('excel');

  series = signal<MeasurementSeriesDto[]>([]);
  selectedSeriesId = '';
  measurements = signal<MeasurementResponseDto[]>([]);
  selectedMeasurementId = '';

  isExporting = signal(false);
  exportSuccess = signal(false);
  exportError = signal<string | null>(null);

  constructor(
    private readonly router: Router,
    private readonly exportService: ExportService,
    private readonly seriesService: MeasurementSeriesService,
    private readonly measurementService: MeasurementService
  ) {}

  ngOnInit(): void {
    this.seriesService.getSeries().subscribe({
      next: (s) => this.series.set(s),
      error: () => this.series.set([])
    });
  }

  onModeChange(): void {
    this.selectedMeasurementId = '';
    this.measurements.set([]);
    this.exportSuccess.set(false);
    this.exportError.set(null);
    // Reset format to csv if switching to measurement (no excel for single measurement)
    if (this.exportMode() === 'measurement') {
      this.exportFormat.set('csv');
    }
  }

  onSeriesChange(): void {
    this.selectedMeasurementId = '';
    this.exportSuccess.set(false);
    this.exportError.set(null);
    if (this.exportMode() === 'measurement' && this.selectedSeriesId) {
      this.measurementService.getMeasurementsBySeriesId(Number(this.selectedSeriesId)).subscribe({
        next: (m) => this.measurements.set(m),
        error: () => this.measurements.set([])
      });
    }
  }

  canExport(): boolean {
    if (this.isExporting()) return false;
    if (this.exportMode() === 'series') {
      return this.selectedSeriesId !== '';
    }
    return this.selectedSeriesId !== '' && this.selectedMeasurementId !== '';
  }

  async onExport(): Promise<void> {
    if (!this.canExport()) return;

    this.isExporting.set(true);
    this.exportSuccess.set(false);
    this.exportError.set(null);

    try {
      let blob: Blob;
      let filename: string;

      if (this.exportMode() === 'series') {
        const seriesId = Number(this.selectedSeriesId);
        const seriesName = this.series().find(s => s.id === seriesId)?.name ?? 'Export';
        if (this.exportFormat() === 'excel') {
          blob = await firstValueFrom(this.exportService.exportSeriesAsExcel(seriesId));
          filename = `${seriesName}.xlsx`;
        } else {
          blob = await firstValueFrom(this.exportService.exportSeriesAsCsv(seriesId));
          filename = `${seriesName}.csv`;
        }
      } else {
        const measurementId = Number(this.selectedMeasurementId);
        blob = await firstValueFrom(this.exportService.exportMeasurementAsCsv(measurementId));
        filename = `Messung_${measurementId}.csv`;
      }

      this.downloadFile(blob, filename);
      this.exportSuccess.set(true);
    } catch {
      this.exportError.set('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally {
      this.isExporting.set(false);
    }
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  goToMessungen(): void {
    this.router.navigate(['/messungen']);
  }
}
