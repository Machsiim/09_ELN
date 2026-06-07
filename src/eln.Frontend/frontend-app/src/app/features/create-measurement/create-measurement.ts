
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { TemplateDto, TemplateService } from '../../services/template.service';
import {
  FormulaToken,
  TemplateCardSchema,
  TemplateFieldSchema,
  TemplateFieldType,
  TemplateSchema,
  TemplateSectionSchema
} from '../../models/template-schema';
import { evaluateFormula, getReferencedFieldIds } from '../../utils/formula';
import {
  BackendFieldType,
  BackendTemplateSchema
} from '../../models/backend-template-schema';
import {
  isBackendSchema,
  isUiSchema,
  mapBackendTypeToUiType,
  mapUiTypeToBackendType,
  splitFieldName
} from '../../utils/template-schema';
import { MeasurementService, CreateMeasurementPayload } from '../../services/measurement.service';
import {
  MeasurementSeriesDto,
  MeasurementSeriesService
} from '../../services/measurement-series.service';
import { MediaAttachment } from '../../models/media-attachment';
import { MediaUploadField } from '../../components/media-upload-field/media-upload-field';
import { ImageService } from '../../services/image.service';
import { NotificationService } from '../../services/notification.service';

interface MeasurementFieldSchema extends TemplateFieldSchema {
  backendName: string;
  backendType: BackendFieldType;
  formula?: FormulaToken[];
}

interface MeasurementCardSchema extends TemplateCardSchema {
  fields: MeasurementFieldSchema[];
}

interface MeasurementSectionSchema extends TemplateSectionSchema {
  cards: MeasurementCardSchema[];
}

interface MeasurementTemplateSchema {
  sections: MeasurementSectionSchema[];
}

interface FieldMeta {
  section: string;
  fieldName: string;
  backendType: BackendFieldType;
  uiType: TemplateFieldType;
  required: boolean;
}
@Component({
  selector: 'app-create-measurement',
  imports: [ReactiveFormsModule, Header, Footer, MediaUploadField],
  templateUrl: './create-measurement.html',
  styleUrl: './create-measurement.scss'
})
export class CreateMeasurement implements OnInit {
  private readonly templateService = inject(TemplateService);
  private readonly measurementService = inject(MeasurementService);
  private readonly seriesService = inject(MeasurementSeriesService);
  private readonly imageService = inject(ImageService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notification = inject(NotificationService);

  readonly templates = signal<TemplateDto[]>([]);
  readonly templateSearchTerm = signal('');
  readonly filteredTemplates = computed(() => {
    const query = this.normalizeSearchText(this.templateSearchTerm());
    const templates = this.templates();

    if (!query) {
      return templates;
    }

    const terms = query.split(/\s+/).filter(Boolean);
    return templates.filter((template) => {
      const searchText = this.buildTemplateSearchText(template);
      return terms.every((term) => searchText.includes(term));
    });
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedTemplateId = signal<number | null>(null);
  readonly activeSchema = signal<MeasurementTemplateSchema | null>(null);
  readonly measurementSeries = signal<MeasurementSeriesDto[]>([]);
  readonly seriesSearchTerm = signal('');
  readonly filteredMeasurementSeries = computed(() => {
    const query = this.normalizeSearchText(this.seriesSearchTerm());
    const series = this.measurementSeries();

    if (!query) {
      return series;
    }

    const terms = query.split(/\s+/).filter(Boolean);
    return series.filter((item) => {
      const searchText = this.buildSeriesSearchText(item);
      return terms.every((term) => searchText.includes(term));
    });
  });
  readonly seriesLoading = signal(false);
  readonly seriesError = signal<string | null>(null);
  readonly selectedSeriesId = signal<number | null>(null);
  readonly showSeriesForm = signal(false);
  readonly createSeriesLoading = signal(false);
  readonly createSeriesError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  measurementForm: FormGroup | null = null;
  private controlMap = new Map<string, FieldMeta>();
  readonly seriesForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['']
  });
  readonly measurementImagesControl = new FormControl<MediaAttachment[]>([]);

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
          this.templates.set(templates.filter((t) => !t.isArchived));
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
          this.seriesError.set('Messserien konnten nicht geladen werden.');
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
          this.notification.show(`Messserie "${series.name}" wurde angelegt.`);
        },
        error: () => {
          this.createSeriesLoading.set(false);
          this.createSeriesError.set('Messserie konnte nicht erstellt werden.');
        }
      });
  }

  onTemplateSearchChange(value: string): void {
    this.templateSearchTerm.set(value);
  }

  onSeriesSearchChange(value: string): void {
    this.seriesSearchTerm.set(value);
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
      this.submitError.set('Wähle eine Messserie aus.');
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
          const images = this.measurementImagesControl.value ?? [];
          if (images.length === 0) {
            this.submitting.set(false);
            this.notification.show(`Messung #${response.id} wurde gespeichert.`);
            this.measurementForm?.reset();
            this.measurementImagesControl.reset();
            return;
          }

          let uploaded = 0;
          images.forEach((img) => {
            fetch(img.dataUrl)
              .then((r) => r.blob())
              .then((blob) => {
                const file = new File([blob], img.name, { type: img.type });
                this.imageService.uploadImage(response.id, file)
                  .pipe(takeUntilDestroyed(this.destroyRef))
                  .subscribe({
                    next: () => {
                      if (++uploaded === images.length) {
                        this.submitting.set(false);
                        this.notification.show("Messung #${response.id} mit ${images.length} Bild(ern) gespeichert.");
                        this.measurementForm?.reset();
                        this.measurementImagesControl.reset();
                      }
                    },
                    error: () => {
                      if (++uploaded === images.length) {
                        this.submitting.set(false);
                        this.notification.show("Messung #${response.id} gespeichert (Bilder teilweise fehlgeschlagen).");
                        this.measurementForm?.reset();
                        this.measurementImagesControl.reset();
                      }
                    }
                  });
              });
          });
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

  private buildForm(schema: MeasurementTemplateSchema): void {
    const controls: Record<string, unknown> = {};
    this.controlMap.clear();
    const fieldIdToControl = new Map<string, string>();
    const calculatedFields: { controlName: string; formula: FormulaToken[] }[] = [];

    schema.sections?.forEach((section) => {
      section.cards?.forEach((card) => {
        card.fields?.forEach((field) => {
          const controlName = this.getControlName(section.id, card.id, field.id, field.label);
          const validators = this.getValidators(field.backendType, field.type, field.required ?? false);
          const control = this.buildControl(field.type, validators);
          controls[controlName] = control;
          fieldIdToControl.set(field.id, controlName);
          const sectionKey = section.title || 'Sektion';
          this.controlMap.set(controlName, {
            section: sectionKey,
            fieldName: field.backendName,
            backendType: field.backendType,
            uiType: field.type,
            required: field.required ?? false
          });
          if (field.type === 'calculated' && field.formula) {
            calculatedFields.push({ controlName, formula: field.formula });
          }
        });
      });
    });

    const controlKeys = Object.keys(controls);
    this.measurementForm = controlKeys.length > 0 ? this.fb.group(controls) : null;

    if (this.measurementForm) {
      const form = this.measurementForm;
      for (const calc of calculatedFields) {
        const refIds = getReferencedFieldIds(calc.formula);
        const recompute = () => {
          const result = evaluateFormula(calc.formula, (fieldId) => {
            const refControlName = fieldIdToControl.get(fieldId);
            if (!refControlName) return null;
            const raw = form.get(refControlName)?.value;
            if (raw === null || raw === undefined || raw === '') return null;
            const num = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
            return Number.isFinite(num) ? num : null;
          });
          const target = form.get(calc.controlName);
          if (target) {
            target.setValue(result, { emitEvent: false });
          }
        };
        for (const refId of refIds) {
          const refControlName = fieldIdToControl.get(refId);
          if (!refControlName) continue;
          const refControl = form.get(refControlName);
          if (!refControl) continue;
          refControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => recompute());
        }
        recompute();
      }
    }
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
      const value = this.normalizeValue(control.value, meta.backendType, meta.uiType);
      const sectionName = meta.section || 'Sektion';

      if (!data[sectionName]) {
        data[sectionName] = {};
      }

      data[sectionName][meta.fieldName] = value;
    }

    return data;
  }

  private parseSchema(schema: string): MeasurementTemplateSchema {
    const parsed = JSON.parse(schema);
    if (isUiSchema(parsed)) {
      return this.convertUiSchema(parsed);
    }
    if (isBackendSchema(parsed)) {
      return this.convertBackendSchema(parsed);
    }
    throw new Error('Ungültiges Schema');
  }

  private convertUiSchema(schema: TemplateSchema): MeasurementTemplateSchema {
    return {
      sections: schema.sections.map((section) => ({
        id: section.id,
        title: section.title,
        cards: section.cards.map((card) => ({
          id: card.id,
          title: card.title,
          subtitle: card.subtitle,
          fields: card.fields.map((field) => ({
            id: field.id,
            label: field.label,
            type: field.type,
            required: field.required ?? false,
            hint: field.hint,
            backendName: this.buildFieldName(card.title, field.label),
            backendType: mapUiTypeToBackendType(field.type),
            ...(field.formula ? { formula: field.formula } : {})
          }))
        }))
      }))
    };
  }

  private convertBackendSchema(schema: BackendTemplateSchema): MeasurementTemplateSchema {
    return {
      sections: schema.sections.map((section) => {
        const cardMap = new Map<string, MeasurementCardSchema>();
        const fields = section.fields ?? section.Fields ?? [];

        fields.forEach((field) => {
          const fieldName = field.name ?? field.Name ?? '';
          const fieldType = field.type ?? field.Type ?? 'text';
          const uiType = field.uiType ?? field.UiType;
          const required = field.required ?? field.Required ?? false;
          const description = field.description ?? field.Description;
          const { cardTitle, fieldLabel } = splitFieldName(fieldName);
          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, {
              id: this.createId('card'),
              title: cardTitle,
              subtitle: '',
              fields: []
            });
          }

          const formula = field.formula ?? field.Formula;
          const originalId = field.id ?? field.Id;
          cardMap.get(cardTitle)!.fields.push({
            id: originalId ?? this.createId('field'),
            label: fieldLabel,
            type: mapBackendTypeToUiType(fieldType, uiType),
            required,
            hint: description ?? '',
            backendName: fieldName,
            backendType: fieldType,
            ...(formula ? { formula } : {})
          });
        });

        return {
          id: this.createId('section'),
          title: section.name ?? section.Name ?? 'Ohne Titel',
          cards: Array.from(cardMap.values())
        };
      })
    };
  }

  private buildFieldName(cardTitle: string, fieldLabel: string): string {
    const normalizedCard = cardTitle?.trim() || 'Allgemein';
    const normalizedField = fieldLabel?.trim() || 'Feld';
    return `${normalizedCard} - ${normalizedField}`;
  }

  private getValidators(
    backendType: BackendFieldType,
    uiType: TemplateFieldType,
    required: boolean
  ): ValidatorFn[] {
    const validators: ValidatorFn[] = [];

    if (uiType === 'calculated') {
      return validators;
    }

    if (required && uiType === 'boolean') {
      validators.push(Validators.requiredTrue);
    } else if (required) {
      validators.push(Validators.required);
    }

    if (uiType === 'integer') {
      validators.push(Validators.pattern(/^-?\d+$/));
    } else if (uiType === 'number') {
      const integerOnly = this.isIntegerType(backendType);
      validators.push(Validators.pattern(integerOnly ? /^-?\d+$/ : /^-?\d+([.,]\d+)?$/));
    }

    return validators;
  }

  getFieldErrorMessage(controlName: string, uiType: TemplateFieldType): string {
    const errors = this.measurementForm?.get(controlName)?.errors;
    if (!errors) {
      return '';
    }

    if (errors['requiredTrue'] && uiType === 'boolean') {
      return 'Dieses Feld muss aktiviert werden.';
    }

    if (errors['required']) {
      return 'Dieses Feld ist erforderlich.';
    }

    if (errors['pattern'] && uiType === 'integer') {
      return 'Bitte eine Ganzzahl eingeben.';
    }

    if (errors['pattern'] && uiType === 'number') {
      return 'Bitte eine Zahl eingeben.';
    }

    return 'Bitte prüfen Sie dieses Feld.';
  }

  private buildControl(type: TemplateFieldType, validators: ValidatorFn[]): unknown {
    if (type === 'media') {
      return this.fb.control<MediaAttachment[]>([], { validators });
    }
    if (type === 'boolean') {
      return this.fb.control(false);
    }
    if (type === 'calculated') {
      return this.fb.control<number | null>({ value: null, disabled: false });
    }
    if (type === 'period') {
      return this.fb.group({
        start: this.fb.control(''),
        end: this.fb.control('')
      });
    }
    return this.fb.control('', validators);
  }

  private normalizeValue(
    value: unknown,
    backendType: BackendFieldType,
    uiType: TemplateFieldType
  ): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    const normalizedType = backendType.toLowerCase();
    if (uiType === 'calculated') {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    }
    if (normalizedType === 'int' || normalizedType === 'integer') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : Math.trunc(parsed);
    }
    if (
      normalizedType === 'float' ||
      normalizedType === 'double' ||
      normalizedType === 'number'
    ) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    }
    if (normalizedType === 'bool' || normalizedType === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }
      return String(value).toLowerCase() === 'true';
    }
    if (normalizedType === 'date' || normalizedType === 'datetime') {
      return typeof value === 'string' ? value : String(value);
    }
    if (uiType === 'period' || normalizedType === 'period') {
      if (value && typeof value === 'object' && 'start' in (value as object)) {
        const v = value as { start?: string; end?: string };
        return { start: v.start ?? '', end: v.end ?? '' };
      }
      return value;
    }

    if (uiType === 'media') {
      return typeof value === 'string' ? value : JSON.stringify(value ?? []);
    }

    return value;
  }

  private isIntegerType(backendType: BackendFieldType): boolean {
    const normalizedType = backendType.toLowerCase();
    return normalizedType === 'int' || normalizedType === 'integer';
  }

  private buildTemplateSearchText(template: TemplateDto): string {
    const parts = [template.name];

    try {
      const schema = JSON.parse(template.schema) as unknown;
      this.collectSchemaSearchParts(schema, parts);
    } catch {
      parts.push(template.schema);
    }

    return this.normalizeSearchText(parts.join(' '));
  }

  private collectSchemaSearchParts(schema: unknown, parts: string[]): void {
    if (isUiSchema(schema)) {
      schema.sections.forEach((section) => {
        parts.push(section.title);
        section.cards.forEach((card) => {
          parts.push(card.title, card.subtitle ?? '');
          card.fields.forEach((field) => {
            parts.push(field.label, field.hint ?? '', field.type);
          });
        });
      });
      return;
    }

    if (isBackendSchema(schema)) {
      schema.sections.forEach((section) => {
        parts.push(section.name ?? '', section.Name ?? '', section.description ?? '', section.Description ?? '');
        const fields = section.fields ?? section.Fields ?? [];

        fields.forEach((field) => {
          const fieldName = field.name ?? field.Name ?? '';
          const { cardTitle, fieldLabel } = splitFieldName(fieldName);
          parts.push(
            fieldName,
            cardTitle,
            fieldLabel,
            field.description ?? '',
            field.Description ?? '',
            field.type ?? '',
            field.Type ?? '',
            field.uiType ?? '',
            field.UiType ?? ''
          );
        });
      });
    }
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .toLowerCase()
      .trim();
  }

  private buildSeriesSearchText(series: MeasurementSeriesDto): string {
    return this.normalizeSearchText([
      series.name,
      series.description ?? '',
      series.createdByUsername,
      series.createdAt,
      String(series.measurementCount),
      series.lockedByUsername ?? ''
    ].join(' '));
  }

  private createId(scope: string): string {
    return `${scope}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
