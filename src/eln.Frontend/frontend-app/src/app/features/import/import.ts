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
import { MeasurementSeriesService } from '../../services/measurement-series.service';
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

// Example:
// const schema = { sections: [{ title: 'S1', cards: [{ title: 'C1', fields: [{ label: 'F1', type: 'text' }] }] }] };
// buildTemplateCatalog(schema as TemplateSchema).length === 1

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

const sanitizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const normalized = String(value).trim().replace(',', '.');
  if (normalized.length === 0) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['true', '1', 'yes', 'y', 'ja'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'nein'].includes(normalized)) {
    return false;
  }
  return null;
};

export const buildMeasurementData = (
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  templateCatalog: TemplateCatalogEntry[],
  fieldKeyToColumn: Map<string, string>
): BuildMeasurementDataResult => {
  const data: Record<string, Record<string, unknown>> = {};

  for (const entry of templateCatalog) {
    const sourceColumn = fieldKeyToColumn.get(entry.fieldKey);
    if (!sourceColumn) {
      return { error: { fieldKey: entry.fieldKey, reason: 'Missing mapping for template field.' } };
    }

    const rawValue = row[sourceColumn];
    let parsedValue: string | number | boolean | null = null;

    if (entry.fieldType === 'number') {
      parsedValue = parseNumber(rawValue);
      if (parsedValue === null) {
        return { error: { fieldKey: entry.fieldKey, reason: 'Invalid or missing number value.' } };
      }
    } else if (entry.fieldType === 'boolean') {
      const parsed = parseBoolean(rawValue);
      if (parsed === null) {
        return { error: { fieldKey: entry.fieldKey, reason: 'Invalid or missing boolean value.' } };
      }
      parsedValue = parsed;
    } else if (
      entry.fieldType === 'text' ||
      entry.fieldType === 'multiline' ||
      entry.fieldType === 'date' ||
      entry.fieldType === 'media' ||
      entry.fieldType === 'table'
    ) {
      parsedValue = sanitizeText(rawValue);
      if (parsedValue === null) {
        return { error: { fieldKey: entry.fieldKey, reason: 'Invalid or missing text value.' } };
      }
    } else {
      return { error: { fieldKey: entry.fieldKey, reason: `Unsupported field type '${entry.fieldType}'.` } };
    }

    if (!data[entry.sectionTitle]) {
      data[entry.sectionTitle] = {};
    }
    data[entry.sectionTitle][entry.fieldKey] = parsedValue;
  }

  return { data };
};

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

  selectedTemplate = '';
  selectedFile = signal<File | null>(null);
  dragOver = signal(false);
  templates = signal<TemplateDto[]>([]);
  previewRows = signal<Array<Record<string, unknown>>>([]);
  previewColumns = signal<string[]>([]);
  previewDtypes = signal<Record<string, string>>({});
  previewRowCount = signal(0);
  previewWarning = signal<string | null>(null);
  templateCatalog = signal<TemplateCatalogEntry[]>([]);
  columnMapping = signal<Record<string, string>>({});
  importStatus = signal<'idle' | 'parsing' | 'ready' | 'importing' | 'done' | 'error'>('idle');
  rowErrors = signal<RowImportError[]>([]);
  importedCount = signal(0);
  totalCount = signal(0);
  globalError = signal<string | null>(null);
  headerRow = signal(1);

  constructor(
    private router: Router,
    excelParseService: ExcelParseService,
    templateService: TemplateService,
    measurementService: MeasurementService,
    measurementSeriesService: MeasurementSeriesService
  ) {
    this.excelParseService = excelParseService;
    this.templateService = templateService;
    this.measurementService = measurementService;
    this.measurementSeriesService = measurementSeriesService;
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    this.templateService.getTemplates().subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.templates.set([])
    });
  }

  isDragOver(): boolean {
    return this.dragOver();
  }

  onTemplateChange(): void {
    console.log('Template selected:', this.selectedTemplate);
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
  }

  canProceed(): boolean {
    return this.selectedTemplate !== '' && this.selectedFile() !== null;
  }

  onUpload(): void {
    if (!this.canProceed()) {
      return;
    }

    void this.loadPreview();
  }

  canImport(): boolean {
    return this.importStatus() === 'ready';
  }

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
    if (catalog.length === 0 || columns.length === 0) {
      return;
    }
    this.columnMapping.set(autoMapColumns(columns, catalog));
  }

  onImport(): void {
    if (!this.canImport()) {
      return;
    }

    void this.startImport();
  }

  getDuplicateMappings(): string[] {
    const mapping = this.columnMapping();
    const used = new Map<string, string[]>();
    Object.entries(mapping).forEach(([column, fieldKey]) => {
      if (!fieldKey) {
        return;
      }
      const list = used.get(fieldKey) ?? [];
      list.push(column);
      used.set(fieldKey, list);
    });

    return Array.from(used.entries())
      .filter(([, columns]) => columns.length > 1)
      .map(([fieldKey]) => fieldKey);
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  private resolveTemplate(selected: string): TemplateDto | null {
    const templates = this.templates();
    const byId = Number(selected);
    if (!Number.isNaN(byId)) {
      return templates.find((template) => template.id === byId) ?? null;
    }

    const normalized = selected.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return templates.find((template) => template.name.trim().toLowerCase() === normalized) ?? null;
  }

  private parseSchema(schema: string): TemplateSchema | null {
    try {
      const first = JSON.parse(schema);
      const normalizedFirst = this.normalizeSchema(first);
      if (normalizedFirst) {
        return normalizedFirst;
      }
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
    if (isUiSchema(schema)) {
      return schema;
    }
    if (isBackendSchema(schema)) {
      return this.convertBackendSchema(schema);
    }
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
    if (!file) {
      return;
    }

    const template = this.resolveTemplate(this.selectedTemplate);
    if (!template) {
      this.importStatus.set('error');
      this.globalError.set('Template konnte nicht geladen werden.');
      return;
    }

    const schema = this.parseSchema(template.schema);
    if (!schema) {
      this.importStatus.set('error');
      this.globalError.set('Template-Schema ist ungültig.');
      return;
    }

    this.importStatus.set('parsing');
    this.previewRows.set([]);
    this.previewColumns.set([]);
    this.previewDtypes.set({});
    this.previewRowCount.set(0);
    this.previewWarning.set(null);
    this.templateCatalog.set([]);
    this.columnMapping.set({});
    this.rowErrors.set([]);
    this.importedCount.set(0);
    this.totalCount.set(0);
    this.globalError.set(null);

    let parseResponse: ExcelParseResponse;
    try {
      parseResponse = await firstValueFrom(
        this.excelParseService.parseExcel(file, this.headerRow())
      );
    } catch (error) {
      this.importStatus.set('error');
      this.globalError.set('Excel-Datei konnte nicht geparst werden.');
      return;
    }

    this.previewRows.set(parseResponse.preview ?? []);
    this.previewColumns.set(parseResponse.columns ?? []);
    this.previewDtypes.set(parseResponse.dtypes ?? {});
    this.previewRowCount.set(parseResponse.rows ?? 0);

    const previewRows = parseResponse.preview ?? [];
    const totalRows = parseResponse.rows ?? previewRows.length;
    if (previewRows.length < totalRows) {
      this.previewWarning.set(
        `Es werden nur ${previewRows.length} von ${totalRows} Zeilen importiert, da der Parser nur eine Vorschau liefert.`
      );
    }

    const catalog = buildTemplateCatalog(schema);
    this.templateCatalog.set(catalog);
    const mapping = autoMapColumns(parseResponse.columns ?? [], catalog);
    this.columnMapping.set(mapping);
    this.importStatus.set('ready');
  }

  private async startImport(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    const template = this.resolveTemplate(this.selectedTemplate);
    if (!template) {
      this.importStatus.set('error');
      this.globalError.set('Template konnte nicht geladen werden.');
      return;
    }

    const schema = this.parseSchema(template.schema);
    if (!schema) {
      this.importStatus.set('error');
      this.globalError.set('Template-Schema ist ungÃ¼ltig.');
      return;
    }

    const catalog = buildTemplateCatalog(schema);
    const mapping = this.columnMapping();
    const mappingForParse = Object.fromEntries(
      Object.entries(mapping).filter(([, value]) => value && value.length > 0)
    );
    const mappedFields = new Set(Object.values(mappingForParse));
    const missingFields = catalog.filter((entry) => !mappedFields.has(entry.fieldKey));
    const duplicateFields = this.getDuplicateMappings();

    if (missingFields.length > 0) {
      this.importStatus.set('error');
      const preview = missingFields.slice(0, 5).map((entry) => entry.fieldKey).join(', ');
      const suffix = missingFields.length > 5 ? `, +${missingFields.length - 5} weitere` : '';
      this.globalError.set(`Mapping unvollstÃ¤ndig. Fehlende Felder: ${preview}${suffix}`);
      return;
    }
    if (duplicateFields.length > 0) {
      this.importStatus.set('error');
      const preview = duplicateFields.slice(0, 5).join(', ');
      const suffix = duplicateFields.length > 5 ? `, +${duplicateFields.length - 5} weitere` : '';
      this.globalError.set(`Mapping doppelt belegt: ${preview}${suffix}`);
      return;
    }

    this.importStatus.set('importing');

    let parseResponse: ExcelParseResponse;
    try {
      parseResponse = await firstValueFrom(
        this.excelParseService.parseExcel(file, this.headerRow(), mappingForParse)
      );
    } catch (error) {
      this.importStatus.set('error');
      this.globalError.set('Excel-Datei konnte nicht geparst werden.');
      return;
    }

    this.previewRows.set(parseResponse.preview ?? []);
    this.previewColumns.set(parseResponse.columns ?? []);
    this.previewDtypes.set(parseResponse.dtypes ?? {});
    this.previewRowCount.set(parseResponse.rows ?? 0);

    const rows = parseResponse.preview ?? [];
    this.totalCount.set(rows.length);
    const fieldKeyToColumn = new Map<string, string>();
    (parseResponse.columns ?? []).forEach((column) => {
      fieldKeyToColumn.set(column, column);
    });

    const rawName = file.name.replace(/\.[^/.]+$/, '');
    const name = rawName.trim().slice(0, 200) || 'Import';
    let seriesId: number;
    try {
      const series = await firstValueFrom(
        this.measurementSeriesService.createSeries({
          name,
          description: `Import aus Datei ${file.name}`
        })
      );
      seriesId = series.id;
      console.log('Import series created:', seriesId);
    } catch {
      this.importStatus.set('error');
      this.globalError.set('Messreihe konnte nicht erstellt werden.');
      return;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const result = buildMeasurementData(row, mapping, catalog, fieldKeyToColumn);
      if ('error' in result) {
        this.rowErrors.update((current) => [
          ...current,
          { rowIndex: index + 1, error: result.error }
        ]);
        continue;
      }

      if (seriesId === null) {
        this.rowErrors.update((current) => [
          ...current,
          {
            rowIndex: index + 1,
            error: { fieldKey: '*', reason: 'Keine gÃ¼ltige Messreihe fÃ¼r den Import.' }
          }
        ]);
        continue;
      }

      const payload = {
        seriesId: seriesId,
        templateId: template.id,
        data: result.data
      };

      try {
        await firstValueFrom(this.measurementService.createMeasurement(payload));
        this.importedCount.update((count) => count + 1);
      } catch {
        this.rowErrors.update((current) => [
          ...current,
          {
            rowIndex: index + 1,
            error: { fieldKey: '*', reason: 'Measurement konnte nicht gespeichert werden.' }
          }
        ]);
      }
    }

    this.importStatus.set('done');
  }
}
