import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { TemplateSchema } from '../../models/template-schema';
import { MeasurementService, CreateMeasurementPayload } from '../../services/measurement.service';
import {
  MeasurementSeriesDto,
  MeasurementSeriesService
} from '../../services/measurement-series.service';
@Component({
  selector: 'app-create-measurement',
  imports: [CommonModule, ReactiveFormsModule, Header, Footer],
  templateUrl: './create-measurement.html',
  styleUrl: './create-measurement.scss'
})
export class CreateMeasurement implements OnInit {
  private readonly templateService = inject(TemplateService);
  private readonly measurementService = inject(MeasurementService);
  private readonly seriesService = inject(MeasurementSeriesService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly templates = signal<TemplateDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedTemplateId = signal<number | null>(null);
  readonly activeSchema = signal<TemplateSchema | null>(null);
  readonly measurementSeries = signal<MeasurementSeriesDto[]>([]);
  readonly seriesLoading = signal(false);
  readonly seriesError = signal<string | null>(null);
  readonly selectedSeriesId = signal<number | null>(null);
  readonly showSeriesForm = signal(false);
  readonly createSeriesLoading = signal(false);
  readonly createSeriesError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly toastMessage = signal<string | null>(null);
  private toastTimeout: number | null = null;

  measurementForm: FormGroup | null = null;
  private controlMap = new Map<string, { section: string; card: string; field: string }>();
  readonly seriesForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['']
  });

  ngOnInit(): void {
    this.fetchTemplates();
    this.fetchMeasurementSeries();
  }

  fetchTemplates(): void {
    this.loading.set(true);
    this.error.set(null);

    this.templateService
      .getTemplates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (templates) => {
          this.templates.set(templates);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Templates konnten nicht geladen werden.');
        }
      });
  }

  fetchMeasurementSeries(): void {
    this.seriesLoading.set(true);
    this.seriesError.set(null);

    this.seriesService
      .getSeries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (series) => {
          this.measurementSeries.set(series);
          if (series.length > 0) {
            this.selectedSeriesId.set(series[0].id);
            this.showSeriesForm.set(false);
          } else {
            this.showSeriesForm.set(true);
          }
          this.seriesLoading.set(false);
        },
        error: () => {
          this.seriesLoading.set(false);
          this.seriesError.set('Messreihen konnten nicht geladen werden.');
        }
      });
  }

  startCreateSeries(): void {
    this.showSeriesForm.set(true);
    this.createSeriesError.set(null);
  }

  cancelCreateSeries(): void {
    this.seriesForm.reset({ name: '', description: '' });
    this.showSeriesForm.set(false);
    this.createSeriesError.set(null);
  }

  submitSeries(): void {
    this.createSeriesError.set(null);

    if (this.seriesForm.invalid) {
      this.seriesForm.markAllAsTouched();
      return;
    }

    this.createSeriesLoading.set(true);
    const payload = this.seriesForm.getRawValue();

    this.seriesService
      .createSeries(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (series) => {
          this.createSeriesLoading.set(false);
          this.measurementSeries.update((current) => [series, ...current]);
          this.selectedSeriesId.set(series.id);
          this.seriesForm.reset({ name: '', description: '' });
          this.showSeriesForm.set(false);
          this.showToast(`Messreihe "${series.name}" wurde angelegt.`);
        },
        error: () => {
          this.createSeriesLoading.set(false);
          this.createSeriesError.set('Messreihe konnte nicht erstellt werden.');
        }
      });
  }

  onTemplateChange(rawId: string): void {
    if (!rawId) {
      this.selectedTemplateId.set(null);
      this.activeSchema.set(null);
      this.measurementForm = null;
      this.controlMap.clear();
      return;
    }

    const templateId = Number(rawId);
    const template = this.templates().find((t) => t.id === templateId);

    if (!template) {
      this.error.set('Ausgewähltes Template wurde nicht gefunden.');
      return;
    }

    try {
      const schema = this.parseSchema(template.schema);
      this.selectedTemplateId.set(templateId);
      this.activeSchema.set(schema);
      this.buildForm(schema);
      this.error.set(null);
    } catch {
      this.error.set('Template konnte nicht geladen werden.');
      this.activeSchema.set(null);
      this.measurementForm = null;
    }
  }

  onSeriesChange(rawId: string): void {
    if (!rawId) {
      this.selectedSeriesId.set(null);
      return;
    }

    const parsed = Number(rawId);
    this.selectedSeriesId.set(Number.isNaN(parsed) ? null : parsed);
  }

  onSubmit(): void {
    this.submitError.set(null);

    if (!this.measurementForm) {
      this.submitError.set('Bitte wähle zuerst ein Template mit Feldern aus.');
      return;
    }

    if (this.measurementForm.invalid) {
      this.measurementForm.markAllAsTouched();
      this.submitError.set('Bitte alle benötigten Felder ausfüllen.');
      return;
    }

    if (!this.selectedTemplateId()) {
      this.submitError.set('Template-Auswahl fehlt.');
      return;
    }

    if (!this.selectedSeriesId()) {
      this.submitError.set('Wähle eine Messreihe aus.');
      return;
    }

    const payload: CreateMeasurementPayload = {
      seriesId: this.selectedSeriesId()!,
      templateId: this.selectedTemplateId()!,
      data: this.buildMeasurementData()
    };

    this.submitting.set(true);

    this.measurementService
      .createMeasurement(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.showToast(`Messung #${response.id} wurde gespeichert.`);
          this.measurementForm?.reset();
        },
        error: () => {
          this.submitting.set(false);
          this.submitError.set('Messung konnte nicht gespeichert werden.');
        }
      });
  }

  trackById(_: number, item: { id?: string | number }): string | number | undefined {
    return item.id ?? _;
  }

  getControlName(sectionId: string, cardId: string, fieldId?: string, label?: string): string {
    const normalizedSection = sectionId || 'section';
    const normalizedCard = cardId || 'card';
    if (fieldId && fieldId.trim().length > 0) {
      return fieldId;
    }

    const sanitizedLabel = (label ?? 'field').toLowerCase().replace(/\s+/g, '-');
    return `${normalizedSection}-${normalizedCard}-${sanitizedLabel}`;
  }

  private buildForm(schema: TemplateSchema): void {
    const controls: Record<string, unknown> = {};
    this.controlMap.clear();

    schema.sections?.forEach((section) => {
      section.cards?.forEach((card) => {
        card.fields?.forEach((field) => {
          const controlName = this.getControlName(section.id, card.id, field.id, field.label);
          const validators = field.type === 'number' ? [Validators.pattern(/^-?\d+(\.\d+)?$/)] : [];
          controls[controlName] = this.fb.control('', validators);
          const sectionKey = section.title?.trim() || 'Sektion';
          const cardKey = card.title?.trim() || 'Bereich';
          const fieldKey = field.label?.trim() || 'Feld';
          this.controlMap.set(controlName, { section: sectionKey, card: cardKey, field: fieldKey });
        });
      });
    });

    const controlKeys = Object.keys(controls);
    this.measurementForm = controlKeys.length > 0 ? this.fb.group(controls) : null;
  }

  private buildMeasurementData(): Record<string, Record<string, unknown>> {
    const data: Record<string, Record<string, unknown>> = {};
    if (!this.measurementForm) {
      return data;
    }

    for (const [controlName, meta] of this.controlMap.entries()) {
      const control = this.measurementForm.get(controlName);
      if (!control) {
        continue;
      }
      const value = control.value;
      const sectionName = meta.section || 'Sektion';
      const cardName = meta.card || 'Bereich';
      const fieldName = meta.field || 'Feld';

      if (!data[sectionName]) {
        data[sectionName] = {};
      }

      const compositeField = cardName ? `${cardName} - ${fieldName}` : fieldName;
      data[sectionName][compositeField] = value;
    }

    return data;
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimeout) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastMessage.set(null);
      this.toastTimeout = null;
    }, 4000);
  }

  private parseSchema(schema: string): TemplateSchema {
    const parsed = JSON.parse(schema);
    if (!parsed.sections) {
      throw new Error('Ungültiges Schema');
    }
    return parsed as TemplateSchema;
  }
}
