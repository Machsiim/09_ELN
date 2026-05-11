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
import { MeasurementService } from '../../services/measurement.service';

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

const ALL_TEMPLATES = '__ALL__';

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
  private readonly measurementService = inject(MeasurementService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = signal<ChartMode>('timeline');
  readonly fields = signal<VisualizableFieldDto[]>([]);
  readonly selectedFieldKey = signal<string | null>(null);
  readonly timeline = signal<TimelineDto | null>(null);
  readonly distribution = signal<DistributionDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Map: measurement-time-ms -> templateName (used for timeline filtering by template)
  readonly templateByTime = signal<Map<number, string>>(new Map());
  readonly selectedTemplate = signal<string>(ALL_TEMPLATES);

  /** Templates that show up in the visualization fields (drives both timeline + distribution dropdowns). */
  readonly availableTemplates = computed(() => {
    const set = new Set<string>();
    for (const f of this.fields()) {
      if (f.templateName) set.add(f.templateName);
    }
    return Array.from(set).sort();
  });

  // Distribution facet selection (independent dropdowns: template, section, card)
  readonly distTemplate = signal<string>(ALL_TEMPLATES);
  readonly distSection = signal<string>(ALL_TEMPLATES);
  readonly distCard = signal<string>(ALL_TEMPLATES);

  readonly allTemplatesValue = ALL_TEMPLATES;

  constructor() {
    effect(() => {
      const id = this.seriesId();
      if (id != null) {
        this.loadFields(id);
        this.loadMeasurementMeta(id);
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

  selectTemplate(value: string): void {
    this.selectedTemplate.set(value);
  }

  setDistTemplate(value: string): void {
    this.distTemplate.set(value);
    // Reset narrower facets when broader one changes
    this.distSection.set(ALL_TEMPLATES);
    this.distCard.set(ALL_TEMPLATES);
    this.ensureValidFieldSelection();
  }

  setDistSection(value: string): void {
    this.distSection.set(value);
    this.distCard.set(ALL_TEMPLATES);
    this.ensureValidFieldSelection();
  }

  setDistCard(value: string): void {
    this.distCard.set(value);
    this.ensureValidFieldSelection();
  }

  private ensureValidFieldSelection(): void {
    const matching = this.filteredFields();
    const current = this.selectedFieldKey();
    if (matching.length === 0) {
      this.selectedFieldKey.set(null);
      this.distribution.set(null);
      return;
    }
    if (!current || !matching.some((f) => this.fieldKey(f) === current)) {
      const newKey = this.fieldKey(matching[0]);
      this.selectedFieldKey.set(newKey);
      const id = this.seriesId();
      if (this.mode() === 'distribution' && id != null) {
        this.loadDistributionForKey(id, newKey);
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

  private loadMeasurementMeta(seriesId: number): void {
    // Used only to know which measurement (by createdAt) belongs to which template
    // for timeline filtering. Distribution filtering uses VisualizableFieldDto.templateName directly.
    this.measurementService.getMeasurementsBySeriesId(seriesId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const timeMap = new Map<number, string>();
          for (const m of items) {
            const ts = new Date(m.createdAt).getTime();
            if (!Number.isNaN(ts) && m.templateName) {
              timeMap.set(ts, m.templateName);
            }
          }
          this.templateByTime.set(timeMap);
        },
        error: () => {
          this.templateByTime.set(new Map());
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

  hasMultipleTemplates = computed(() => this.availableTemplates().length > 1);

  // ---------- Distribution: Filter helpers ----------

  /** Splits "Card - Field" key into [card, field] when applicable. */
  private splitFieldKey(key: string): { card: string | null; label: string } {
    const idx = key.indexOf(' - ');
    if (idx === -1) return { card: null, label: key };
    return { card: key.slice(0, idx), label: key.slice(idx + 3) };
  }

  /** Felder, die zum aktuell gewählten Template gehören (oder alle, wenn ALL). */
  private readonly fieldsForSelectedTemplate = computed<VisualizableFieldDto[]>(() => {
    const all = this.fields();
    const tpl = this.distTemplate();
    if (tpl === ALL_TEMPLATES) return all;
    return all.filter((f) => f.templateName === tpl);
  });

  readonly availableSections = computed(() => {
    const set = new Set<string>();
    for (const f of this.fieldsForSelectedTemplate()) {
      if (f.section) set.add(f.section);
    }
    return Array.from(set).sort();
  });

  readonly availableCards = computed(() => {
    const set = new Set<string>();
    const sectionFilter = this.distSection();
    for (const f of this.fieldsForSelectedTemplate()) {
      if (sectionFilter !== ALL_TEMPLATES && f.section !== sectionFilter) continue;
      const { card } = this.splitFieldKey(f.key);
      if (card) set.add(card);
    }
    return Array.from(set).sort();
  });

  /** Distribution-Felder gefiltert nach Template + Sektion + Karte. */
  readonly filteredFields = computed<VisualizableFieldDto[]>(() => {
    const section = this.distSection();
    const card = this.distCard();
    return this.fieldsForSelectedTemplate().filter((f) => {
      if (section !== ALL_TEMPLATES && f.section !== section) return false;
      if (card !== ALL_TEMPLATES) {
        const { card: fieldCard } = this.splitFieldKey(f.key);
        if (fieldCard !== card) return false;
      }
      return true;
    });
  });

  // ---------- Line chart (Timeline) ----------

  readonly lineData = computed<ChartData<'line'> | null>(() => {
    const data = this.timeline();
    if (!data || data.labels.length === 0 || data.datasets.length === 0) {
      return null;
    }

    const tplFilter = this.selectedTemplate();
    const tplMap = this.templateByTime();
    const useFilter = tplFilter !== ALL_TEMPLATES && tplMap.size > 0;

    // Indices der Messungen, die zum gewählten Template gehören (matched per epoch ms)
    const allowedIdx = useFilter
      ? new Set(
          data.labels
            .map((iso, idx) => {
              const ts = new Date(iso).getTime();
              return tplMap.get(ts) === tplFilter ? idx : -1;
            })
            .filter((i) => i >= 0)
        )
      : null;

    let labels = data.labels;
    let datasetsRaw = data.datasets;

    if (allowedIdx) {
      // Reduce labels to allowed indices and align datasets
      const keptIdx = Array.from(allowedIdx).sort((a, b) => a - b);
      labels = keptIdx.map((i) => data.labels[i]);
      datasetsRaw = data.datasets
        .map((ds) => ({
          ...ds,
          values: keptIdx.map((i) => ds.values[i])
        }))
        // Drop datasets that became fully empty
        .filter((ds) => ds.values.some((v) => v != null));
    }

    return {
      labels: labels.map((iso) => this.formatDateLabel(iso)),
      datasets: datasetsRaw.map((ds, idx) => {
        const color = PALETTE[idx % PALETTE.length];
        return {
          label: ds.section ? `${ds.section} – ${ds.field}` : ds.field,
          data: ds.values as (number | null)[],
          borderColor: color,
          backgroundColor: color + '33',
          tension: 0.25,
          spanGaps: false,
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
