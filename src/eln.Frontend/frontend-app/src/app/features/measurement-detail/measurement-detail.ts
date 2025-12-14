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
import { MeasurementResponseDto, MeasurementService } from '../../services/measurement.service';

interface SectionEntry {
  name: string;
  cards: CardEntry[];
}

interface CardEntry {
  name: string;
  fields: { key: string; value: unknown }[];
}

@Component({
  selector: 'app-measurement-detail',
  standalone: true,
  imports: [CommonModule, Header, Footer],
  templateUrl: './measurement-detail.html',
  styleUrl: './measurement-detail.scss'
})
export class MeasurementDetail implements OnInit {
  private readonly measurementService = inject(MeasurementService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly measurement = signal<MeasurementResponseDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleteInProgress = signal(false);
  readonly deleteConfirmVisible = signal(false);

  ngOnInit(): void {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = Number(params['measurementId']);
      if (Number.isNaN(id)) {
        this.error.set('Ungültige Messungs-ID');
        return;
      }
      this.fetchMeasurement(id);
    });
  }

  private fetchMeasurement(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.measurementService
      .getMeasurementById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.measurement.set(result);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Messung konnte nicht geladen werden.');
        }
      });
  }

  goBack(): void {
    const measurement = this.measurement();
    if (!measurement) {
      this.router.navigate(['/messungen']);
      return;
    }
    this.router.navigate([`/messungen/serie/${measurement.seriesId}`]);
  }

  confirmDelete(): void {
    if (!this.deleteInProgress()) {
      this.deleteConfirmVisible.set(true);
    }
  }

  closeDeleteModal(): void {
    if (this.deleteInProgress()) return;
    this.deleteConfirmVisible.set(false);
  }

  deleteMeasurement(): void {
    const measurement = this.measurement();
    if (!measurement || this.deleteInProgress()) {
      return;
    }

    this.deleteInProgress.set(true);
    this.measurementService
      .deleteMeasurement(measurement.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteInProgress.set(false);
          this.deleteConfirmVisible.set(false);
          this.router.navigate([`/messungen/serie/${measurement.seriesId}`]);
        },
        error: () => {
          this.deleteInProgress.set(false);
          this.error.set('Messung konnte nicht gelöscht werden.');
        }
      });
  }

  getSections(): SectionEntry[] {
    const measurement = this.measurement();
    if (!measurement) {
      return [];
    }

    const sections: SectionEntry[] = [];

    for (const [sectionName, fields] of Object.entries(measurement.data)) {
      const cards = new Map<string, CardEntry>();

      for (const [rawKey, value] of Object.entries(fields)) {
        const separatorIndex = rawKey.indexOf(' - ');
        const cardName = separatorIndex > -1 ? rawKey.slice(0, separatorIndex) : 'Allgemein';
        const fieldLabel = separatorIndex > -1 ? rawKey.slice(separatorIndex + 3) : rawKey;

        if (!cards.has(cardName)) {
          cards.set(cardName, { name: cardName, fields: [] });
        }

        cards.get(cardName)!.fields.push({ key: fieldLabel, value });
      }

      sections.push({
        name: sectionName,
        cards: Array.from(cards.values())
      });
    }

    return sections;
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
}
