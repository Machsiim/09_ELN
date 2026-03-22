import { Component, OnInit, signal } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TemplateSchema, TemplateFieldType } from '../../models/template-schema';
import { BackendTemplateSchema } from '../../models/backend-template-schema';
import {
  isBackendSchema,
  isUiSchema,
  mapBackendTypeToUiType,
  splitFieldName
} from '../../utils/template-schema';
import { ExcelParseService, ExcelParseResponse } from '../../services/excel-parse.service';
import { TemplateDto, TemplateService } from '../../services/template.service';
import { MeasurementService } from '../../services/measurement.service';
import { MeasurementSeriesService, MeasurementSeriesDto } from '../../services/measurement-series.service';
import { ImportService, ImportResponse, ImportRowError } from '../../services/import.service';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface TemplateCatalogEntry {
  sectionTitle: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: TemplateFieldType;
}

export interface BuildMeasurementDataError {
  fieldKey: string;
  reason: string;
}

export interface RowImportError {
  rowIndex: number;
  error: BuildMeasurementDataError | { fieldKey: string; reason: string };
}

export type BuildMeasurementDataResult =
  | { data: Record<string, Record<string, unknown>> }
  | { error: BuildMeasurementDataError };

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildTemplateCatalog = (schema: TemplateSchema): TemplateCatalogEntry[] => {
  const entries: TemplateCatalogEntry[] = [];

  schema.sections?.forEach((section) => {
    const sectionTitle = section.title?.trim() || 'Sektion';
    section.cards?.forEach((card) => {
      const cardTitle = card.title?.trim() || 'Bereich';
      card.fields?.forEach((field) => {
        const fieldLabel = field.label?.trim() || 'Feld';
        const fieldKey = `${cardTitle} - ${fieldLabel}`;
        entries.push({
          sectionTitle,
          fieldKey,
          fieldLabel,
          fieldType: field.type
        });
      });
    });
  });

  return entries;
};

export const autoMapColumns = (
  columns: string[],
  catalog: TemplateCatalogEntry[]
): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const exactIndex = new Map(catalog.map((entry) => [entry.fieldKey, entry]));
  const normalizedFieldKeyIndex = new Map(
    catalog.map((entry) => [normalizeToken(entry.fieldKey), entry])
  );
  const normalizedLabelIndex = new Map<string, TemplateCatalogEntry[]>();
  catalog.forEach((entry) => {
    const label = normalizeToken(entry.fieldLabel);
    const bucket = normalizedLabelIndex.get(label) ?? [];
    bucket.push(entry);
    normalizedLabelIndex.set(label, bucket);
  });

  columns.forEach((column) => {
    const exact = exactIndex.get(column);
    if (exact) {
      mapping[column] = exact.fieldKey;
      return;
    }

    const normalizedColumn = normalizeToken(column);
    const normalizedMatch = normalizedFieldKeyIndex.get(normalizedColumn);
    if (normalizedMatch) {
      mapping[column] = normalizedMatch.fieldKey;
      return;
    }

    const labelMatches = normalizedLabelIndex.get(normalizedColumn);
    if (labelMatches && labelMatches.length === 1) {
      mapping[column] = labelMatches[0].fieldKey;
    }
  });

  return mapping;
};

type ImportStep = 'select' | 'upload' | 'preview' | 'importing' | 'done';

@Component({
  selector: 'app-import',
  imports: [FormsModule, Header, Footer],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class Import implements OnInit {
  private readonly excelParseService: ExcelParseService;
  private readonly templateService: TemplateService;
  private readonly measurementService: MeasurementService;
  private readonly measurementSeriesService: MeasurementSeriesService;
  private readonly importService: ImportService;

  // Step tracking
  currentStep = signal<ImportStep>('select');

  // Template & Series
  selectedTemplate = '';
  templates = signal<TemplateDto[]>([]);
  existingSeries = signal<MeasurementSeriesDto[]>([]);
  seriesMode = signal<'new' | 'existing'>('new');
  selectedSeriesId = '';
  newSeriesName = '';

  // File
  selectedFile = signal<File | null>(null);
  dragOver = signal(false);

  // Preview
  previewRows = signal<Array<Record<string, unknown>>>([]);
  previewColumns = signal<string[]>([]);
  previewDtypes = signal<Record<string, string>>({});
  previewRowCount = signal(0);
  previewWarning = signal<string | null>(null);
  templateCatalog = signal<TemplateCatalogEntry[]>([]);
  columnMapping = signal<Record<string, string>>({});
  headerRow = signal(1);

  // Import result
  importResult = signal<ImportResponse | null>(null);
  globalError = signal<string | null>(null);

  constructor(
    private router: Router,
    excelParseService: ExcelParseService,
    templateService: TemplateService,
    measurementService: MeasurementService,
    measurementSeriesService: MeasurementSeriesService,
    importService: ImportService
  ) {
    this.excelParseService = excelParseService;
    this.templateService = templateService;
    this.measurementService = measurementService;
    this.measurementSeriesService = measurementSeriesService;
    this.importService = importService;
  }

  ngOnInit(): void {
    this.loadTemplates();
    this.loadSeries();
  }

  private loadTemplates(): void {
    this.templateService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.templates.set([])
    });
  }

  private loadSeries(): void {
    this.measurementSeriesService.getSeries().subscribe({
      next: (series) => this.existingSeries.set(series),
      error: () => this.existingSeries.set([])
    });
  }

  // --- Step helpers ---

  getStepNumber(): number {
    const steps: ImportStep[] = ['select', 'upload', 'preview', 'importing', 'done'];
    return steps.indexOf(this.currentStep()) + 1;
  }

  getStepLabel(): string {
    switch (this.currentStep()) {
      case 'select': return 'Template & Serie wählen';
      case 'upload': return 'Datei hochladen';
      case 'preview': return 'Vorschau & Zuordnung';
      case 'importing': return 'Import läuft...';
      case 'done': return 'Ergebnis';
    }
  }

  getProgressWidth(): string {
    return `${(this.getStepNumber() / 5) * 100}%`;
  }

  // --- Sample Excel download ---

  get sampleExcelUrl(): string {
    if (!this.selectedTemplate) return '';
    return `${environment.apiUrl}/templates/${this.selectedTemplate}/sample-excel`;
  }

  downloadSampleExcel(): void {
    if (!this.selectedTemplate) return;
    window.open(this.sampleExcelUrl, '_blank');
  }

  // --- File handling ---

  isDragOver(): boolean {
    return this.dragOver();
  }

  onTemplateChange(): void {
    // Reset downstream state when template changes
    this.previewRows.set([]);
    this.previewColumns.set([]);
    this.templateCatalog.set([]);
    this.columnMapping.set({});
    this.importResult.set(null);
    this.globalError.set(null);
    if (this.currentStep() !== 'select') {
      this.currentStep.set('select');
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile.set(files[0]);
    }
  }

  removeFile(): void {
    this.selectedFile.set(null);
    this.previewRows.set([]);
    this.previewColumns.set([]);
    this.templateCatalog.set([]);
    this.columnMapping.set({});
    this.importResult.set(null);
    this.globalError.set(null);
    if (this.currentStep() === 'preview') {
      this.currentStep.set('upload');
    }
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // --- Step navigation ---

  canGoToUpload(): boolean {
    return this.selectedTemplate !== '';
  }

  goToUpload(): void {
    if (!this.canGoToUpload()) return;
    this.currentStep.set('upload');
  }

  canLoadPreview(): boolean {
    return this.selectedTemplate !== '' && this.selectedFile() !== null;
  }

  onLoadPreview(): void {
    if (!this.canLoadPreview()) return;
    void this.loadPreview();
  }

  canImport(): boolean {
    return this.currentStep() === 'preview' && this.getDuplicateMappings().length === 0;
  }

  // --- Mapping ---

  getMappingValue(column: string): string {
    return this.columnMapping()[column] ?? '';
  }

  setMappingValue(column: string, value: string): void {
    this.columnMapping.update((current) => ({
      ...current,
      [column]: value
    }));
  }

  autoMap(): void {
    const catalog = this.templateCatalog();
    const columns = this.previewColumns();
    if (catalog.length === 0 || columns.length === 0) return;
    this.columnMapping.set(autoMapColumns(columns, catalog));
  }

  getDuplicateMappings(): string[] {
    const mapping = this.columnMapping();
    const used = new Map<string, string[]>();
    Object.entries(mapping).forEach(([column, fieldKey]) => {
      if (!fieldKey) return;
      const list = used.get(fieldKey) ?? [];
      list.push(column);
      used.set(fieldKey, list);
    });
    return Array.from(used.entries())
      .filter(([, columns]) => columns.length > 1)
      .map(([fieldKey]) => fieldKey);
  }

  // --- Preview ---

  private resolveTemplate(selected: string): TemplateDto | null {
    const templates = this.templates();
    const byId = Number(selected);
    if (!Number.isNaN(byId)) {
      return templates.find((template) => template.id === byId) ?? null;
    }
    const normalized = selected.trim().toLowerCase();
    if (!normalized) return null;
    return templates.find((template) => template.name.trim().toLowerCase() === normalized) ?? null;
  }

  private parseSchema(schema: string): TemplateSchema | null {
    try {
      const first = JSON.parse(schema);
      const normalizedFirst = this.normalizeSchema(first);
      if (normalizedFirst) return normalizedFirst;
      if (typeof first === 'string') {
        const second = JSON.parse(first);
        return this.normalizeSchema(second);
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeSchema(schema: unknown): TemplateSchema | null {
    if (isUiSchema(schema)) return schema;
    if (isBackendSchema(schema)) return this.convertBackendSchema(schema);
    return null;
  }

  private convertBackendSchema(schema: BackendTemplateSchema): TemplateSchema {
    return {
      sections: schema.sections.map((section) => {
        const cardMap = new Map<string, { title: string; fields: TemplateCatalogEntry[] }>();
        const fields = section.fields ?? section.Fields ?? [];
        fields.forEach((field) => {
          const fieldName = field.name ?? field.Name ?? '';
          const fieldType = field.type ?? field.Type ?? 'text';
          const uiType = field.uiType ?? field.UiType;
          const { cardTitle, fieldLabel } = splitFieldName(fieldName);
          if (!cardMap.has(cardTitle)) {
            cardMap.set(cardTitle, { title: cardTitle, fields: [] });
          }
          cardMap.get(cardTitle)!.fields.push({
            sectionTitle: section.name ?? section.Name ?? 'Sektion',
            fieldKey: `${cardTitle} - ${fieldLabel}`,
            fieldLabel,
            fieldType: mapBackendTypeToUiType(fieldType, uiType)
          });
        });
        const cards = Array.from(cardMap.values()).map((card) => ({
          id: `card-${Math.random().toString(36).slice(2, 9)}`,
          title: card.title,
          fields: card.fields.map((field) => ({
            id: `field-${Math.random().toString(36).slice(2, 9)}`,
            label: field.fieldLabel,
            type: field.fieldType
          }))
        }));
        return {
          id: `section-${Math.random().toString(36).slice(2, 9)}`,
          title: section.name ?? section.Name ?? 'Sektion',
          cards
        };
      })
    };
  }

  private async loadPreview(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    const template = this.resolveTemplate(this.selectedTemplate);
    if (!template) {
      this.globalError.set('Template konnte nicht geladen werden.');
      return;
    }

    const schema = this.parseSchema(template.schema);
    if (!schema) {
      this.globalError.set('Template-Schema ist ungültig.');
      return;
    }

    this.globalError.set(null);
    this.previewRows.set([]);
    this.previewColumns.set([]);
    this.previewDtypes.set({});
    this.previewRowCount.set(0);
    this.previewWarning.set(null);
    this.templateCatalog.set([]);
    this.columnMapping.set({});
    this.importResult.set(null);

    let parseResponse: ExcelParseResponse;
    try {
      parseResponse = await firstValueFrom(
        this.excelParseService.parseExcel(file, this.headerRow())
      );
    } catch {
      this.globalError.set('Excel-Datei konnte nicht geparst werden.');
      return;
    }

    this.previewRows.set(parseResponse.preview ?? []);
    this.previewColumns.set(parseResponse.columns ?? []);
    this.previewDtypes.set(parseResponse.dtypes ?? {});
    this.previewRowCount.set(parseResponse.rows ?? 0);

    if ((parseResponse.preview?.length ?? 0) < (parseResponse.rows ?? 0)) {
      this.previewWarning.set(
        `Vorschau zeigt ${parseResponse.preview?.length ?? 0} von ${parseResponse.rows ?? 0} Zeilen. Beim Import werden alle Zeilen verarbeitet.`
      );
    }

    const catalog = buildTemplateCatalog(schema);
    this.templateCatalog.set(catalog);
    const mapping = autoMapColumns(parseResponse.columns ?? [], catalog);
    this.columnMapping.set(mapping);
    this.currentStep.set('preview');
  }

  // --- Import ---

  onImport(): void {
    if (!this.canImport()) return;
    void this.startImport();
  }

  private async startImport(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    const templateId = Number(this.selectedTemplate);
    if (isNaN(templateId)) {
      this.globalError.set('Ungültiges Template.');
      return;
    }

    this.currentStep.set('importing');
    this.globalError.set(null);

    try {
      const ext = file.name.toLowerCase().split('.').pop();
      const seriesId = this.seriesMode() === 'existing' && this.selectedSeriesId
        ? Number(this.selectedSeriesId) : undefined;
      const seriesName = this.seriesMode() === 'new'
        ? (this.newSeriesName.trim() || file.name.replace(/\.[^/.]+$/, ''))
        : undefined;

      let result: ImportResponse;
      if (ext === 'csv') {
        result = await firstValueFrom(
          this.importService.importCsv(file, templateId, seriesId, seriesName)
        );
      } else {
        result = await firstValueFrom(
          this.importService.importExcel(file, templateId, seriesId, seriesName)
        );
      }

      this.importResult.set(result);
      this.currentStep.set('done');
    } catch (error: unknown) {
      this.globalError.set(
        error instanceof Error ? error.message : 'Import fehlgeschlagen.'
      );
      this.currentStep.set('preview');
    }
  }

  // --- Navigation ---

  goToSeries(): void {
    const result = this.importResult();
    if (result) {
      this.router.navigate(['/messungen/serie', result.seriesId]);
    }
  }

  resetImport(): void {
    this.selectedFile.set(null);
    this.previewRows.set([]);
    this.previewColumns.set([]);
    this.templateCatalog.set([]);
    this.columnMapping.set({});
    this.importResult.set(null);
    this.globalError.set(null);
    this.newSeriesName = '';
    this.selectedSeriesId = '';
    this.currentStep.set('select');
  }
}
