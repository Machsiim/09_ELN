import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartOptions, registerables } from 'chart.js';
import {
  DistributionDto,
  TimelineDto,
  VisualizableFieldDto,
  VisualizationService
} from '../../services/visualization.service';

Chart.register(...registerables);

type ChartMode = 'timeline' | 'distribution';

const PALETTE = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#9333ea',
  '#ea580c'
];

@Component({
  selector: 'app-series-charts',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './series-charts.html',
  styleUrl: './series-charts.scss'
})
export class SeriesCharts {
  readonly seriesId = input.required<number>();

  private readonly visualization = inject(VisualizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = signal<ChartMode>('timeline');
  readonly fields = signal<VisualizableFieldDto[]>([]);
  readonly selectedFieldKey = signal<string | null>(null);
  readonly timeline = signal<TimelineDto | null>(null);
  readonly distribution = signal<DistributionDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.seriesId();
      if (id != null) {
        this.loadFields(id);
      }
    });

    effect(() => {
      const id = this.seriesId();
      const m = this.mode();
      if (id == null) return;
      if (m === 'timeline') {
        this.loadTimeline(id);
      } else {
        const key = this.selectedFieldKey();
        if (key) {
          this.loadDistributionForKey(id, key);
        }
      }
    });
  }

  setMode(m: ChartMode): void {
    this.mode.set(m);
  }

  selectField(key: string): void {
    this.selectedFieldKey.set(key);
    if (this.mode() === 'distribution') {
      const id = this.seriesId();
      if (id != null) {
        this.loadDistributionForKey(id, key);
      }
    }
  }

  private loadFields(seriesId: number): void {
    this.visualization.getFields(seriesId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fields) => {
          this.fields.set(fields ?? []);
          if (!this.selectedFieldKey() && fields && fields.length > 0) {
            this.selectedFieldKey.set(this.fieldKey(fields[0]));
          }
        },
        error: () => {
          this.fields.set([]);
        }
      });
  }

  private loadTimeline(seriesId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.visualization.getTimeline(seriesId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.timeline.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.timeline.set(null);
          this.loading.set(false);
          this.error.set(err?.error?.error ?? 'Zeitverlauf konnte nicht geladen werden.');
        }
      });
  }

  private loadDistributionForKey(seriesId: number, key: string): void {
    const field = this.fields().find((f) => this.fieldKey(f) === key);
    if (!field) return;
    this.loading.set(true);
    this.error.set(null);
    this.visualization.getDistribution(seriesId, field.key, field.section)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.distribution.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.distribution.set(null);
          this.loading.set(false);
          this.error.set(err?.error?.error ?? 'Verteilung konnte nicht geladen werden.');
        }
      });
  }

  fieldKey(f: VisualizableFieldDto): string {
    return `${f.section}::${f.key}`;
  }

  fieldDisplay(f: VisualizableFieldDto): string {
    return f.section ? `${f.section} – ${f.label || f.key}` : (f.label || f.key);
  }

  // ---------- Line chart (Timeline) ----------

  readonly lineData = computed<ChartData<'line'> | null>(() => {
    const data = this.timeline();
    if (!data || data.labels.length === 0 || data.datasets.length === 0) {
      return null;
    }

    return {
      labels: data.labels.map((iso) => this.formatDateLabel(iso)),
      datasets: data.datasets.map((ds, idx) => {
        const color = PALETTE[idx % PALETTE.length];
        return {
          label: ds.section ? `${ds.section} – ${ds.field}` : ds.field,
          data: ds.values as (number | null)[],
          borderColor: color,
          backgroundColor: color + '33',
          tension: 0.25,
          spanGaps: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false
        };
      })
    };
  });

  readonly lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 12,
          font: { size: 12 }
        }
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        padding: 10,
        cornerRadius: 6
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#64748b',
          maxRotation: 0,
          autoSkipPadding: 16
        }
      },
      y: {
        grid: { color: '#e2e8f0' },
        ticks: { color: '#64748b' }
      }
    }
  };

  // ---------- Bar chart (Distribution) ----------

  readonly barData = computed<ChartData<'bar'> | null>(() => {
    const data = this.distribution();
    if (!data || data.buckets.length === 0) {
      return null;
    }

    return {
      labels: data.buckets.map(
        (b) => `${this.formatNumber(b.min)} – ${this.formatNumber(b.max)}`
      ),
      datasets: [
        {
          label: data.section ? `${data.section} – ${data.field}` : data.field,
          data: data.buckets.map((b) => b.count),
          backgroundColor: '#2563eb',
          hoverBackgroundColor: '#1d4ed8',
          borderRadius: 4,
          maxBarThickness: 60
        }
      ]
    };
  });

  readonly barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          title: (items) => `Bereich: ${items[0].label}`,
          label: (item) => `Anzahl: ${item.parsed.y}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#64748b',
          maxRotation: 30,
          minRotation: 0,
          autoSkipPadding: 8
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: '#e2e8f0' },
        ticks: {
          color: '#64748b',
          precision: 0
        }
      }
    }
  };

  readonly distributionStats = computed(() => {
    const data = this.distribution();
    if (!data || data.values.length === 0) {
      return null;
    }
    const values = data.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      count: values.length,
      min: this.formatNumber(min),
      max: this.formatNumber(max),
      avg: this.formatNumber(avg)
    };
  });

  // ---------- helpers ----------

  private formatNumber(v: number): string {
    if (!Number.isFinite(v)) return '-';
    const abs = Math.abs(v);
    if (abs !== 0 && (abs < 0.01 || abs >= 10000)) {
      return v.toExponential(2);
    }
    return (Math.round(v * 100) / 100).toString();
  }

  private formatDateLabel(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}. ${hh}:${mi}`;
  }
}
